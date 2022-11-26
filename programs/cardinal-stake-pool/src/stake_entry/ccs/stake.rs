use cardinal_creator_standard::instructions::set_in_use_by;
use solana_program::program::invoke;

use {
    crate::{errors::ErrorCode, state::*},
    anchor_lang::prelude::*,
    anchor_spl::token::{Mint, Token, TokenAccount},
};

#[derive(Accounts)]
pub struct StakeCCSCtx<'info> {
    #[account(mut, seeds = [STAKE_ENTRY_PREFIX.as_bytes(), stake_entry.pool.as_ref(), stake_entry.original_mint.as_ref(), get_stake_seed(mint.supply, user.key()).as_ref()], bump=stake_entry.bump)]
    stake_entry: Box<Account<'info, StakeEntry>>,

    #[account(mut, constraint = stake_entry.pool == stake_pool.key() @ ErrorCode::InvalidStakePool)]
    stake_pool: Box<Account<'info, StakePool>>,

    /// CHECK: This is not dangerous because we don't read or write from this account
    #[account(mut)]
    mint_manager: UncheckedAccount<'info>,
    /// CHECK: This is not dangerous because we don't read or write from this account
    ruleset: UncheckedAccount<'info>,

    // stake_entry token accounts
    #[account(mut, constraint =
        stake_entry_mint_token_account.mint == stake_entry.original_mint
        && stake_entry_mint_token_account.owner == stake_entry.key()
        @ ErrorCode::InvalidStakeEntryOriginalMintTokenAccount
    )]
    stake_entry_mint_token_account: Box<Account<'info, TokenAccount>>,
    mint: Box<Account<'info, Mint>>,

    // user
    #[account(mut)]
    user: Signer<'info>,
    #[account(mut, constraint =
        user_mint_token_account.amount > 0
        && user_mint_token_account.mint == stake_entry.original_mint
        && user_mint_token_account.owner == user.key()
        @ ErrorCode::InvalidUserOriginalMintTokenAccount
    )]
    user_mint_token_account: Box<Account<'info, TokenAccount>>,

    // programs
    token_program: Program<'info, Token>,
    /// CHECK: This is not dangerous because we don't read or write from this account
    #[account(address = cardinal_creator_standard::id())]
    cardinal_creator_standard: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<StakeCCSCtx>) -> Result<()> {
    let stake_pool = &mut ctx.accounts.stake_pool;
    let stake_entry = &mut ctx.accounts.stake_entry;

    if stake_pool.end_date.is_some() && Clock::get().unwrap().unix_timestamp > stake_pool.end_date.unwrap() {
        return Err(error!(ErrorCode::StakePoolHasEnded));
    }

    if stake_entry.amount != 0 {
        stake_entry.total_stake_seconds = stake_entry.total_stake_seconds.saturating_add(
            (u128::try_from(stake_entry.cooldown_start_seconds.unwrap_or(Clock::get().unwrap().unix_timestamp))
                .unwrap()
                .saturating_sub(u128::try_from(stake_entry.last_staked_at).unwrap()))
            .checked_mul(u128::try_from(stake_entry.amount).unwrap())
            .unwrap(),
        );
        stake_entry.cooldown_start_seconds = None;
    }

    invoke(
        &set_in_use_by(
            ctx.accounts.cardinal_creator_standard.key(),
            ctx.accounts.mint_manager.key(),
            ctx.accounts.ruleset.key(),
            ctx.accounts.user.key(),
            ctx.accounts.user_mint_token_account.key(),
            stake_entry.key(),
        )?,
        &[
            ctx.accounts.mint_manager.to_account_info(),
            ctx.accounts.ruleset.to_account_info(),
            ctx.accounts.user.to_account_info(),
            ctx.accounts.user_mint_token_account.to_account_info(),
        ],
    )?;

    if stake_pool.reset_on_stake && stake_entry.amount == 0 {
        stake_entry.total_stake_seconds = 0;
    }

    // update stake entry
    stake_entry.last_staked_at = Clock::get().unwrap().unix_timestamp;
    stake_entry.last_staker = ctx.accounts.user.key();
    stake_entry.amount = stake_entry.amount.checked_add(1).unwrap();
    stake_pool.total_staked = stake_pool.total_staked.checked_add(1).expect("Add error");

    Ok(())
}
