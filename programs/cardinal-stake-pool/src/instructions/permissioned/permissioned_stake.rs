use anchor_spl::associated_token::{self, AssociatedToken};
use cardinal_token_manager::{
    program::CardinalTokenManager,
    state::{TokenManager, TokenManagerKind},
};
use solana_program::sysvar::{self};

use {
    crate::{errors::ErrorCode, state::*},
    anchor_lang::prelude::*,
    anchor_spl::token::{Mint, Token, TokenAccount},
};

#[derive(Accounts)]
pub struct PermissionedStakeCtx<'info> {
    #[account(mut, seeds = [STAKE_ENTRY_PREFIX.as_bytes(), stake_entry.pool.as_ref(), stake_entry.original_mint.as_ref(), get_stake_seed(original_mint.supply, user.key()).as_ref()], bump=stake_entry.bump)]
    stake_entry: Box<Account<'info, StakeEntry>>,

    #[account(mut, constraint = stake_entry.pool == stake_pool.key() @ ErrorCode::InvalidStakePool)]
    stake_pool: Box<Account<'info, StakePool>>,

    /// CHECK: This is not dangerous because we don't read or write from this account
    #[account(mut)]
    stake_entry_original_mint_token_account: UncheckedAccount<'info>,
    #[account(mut)]
    original_mint: Box<Account<'info, Mint>>,

    #[account(mut, constraint = token_manager.mint == original_mint.key() && token_manager.kind == TokenManagerKind::Permissioned as u8 @ ErrorCode::InvalidTokenManager)]
    token_manager: Box<Account<'info, TokenManager>>,
    /// CHECK: This is not dangerous because we don't read or write from this account
    #[account(mut)]
    mint_manager: UncheckedAccount<'info>,

    // user
    #[account(mut)]
    user: Signer<'info>,
    #[account(mut, constraint =
        user_original_mint_token_account.amount == 1
        && user_original_mint_token_account.owner == user.key()
        && user_original_mint_token_account.key() == token_manager.recipient_token_account
        @ ErrorCode::InvalidUserOriginalMintTokenAccount
    )]
    user_original_mint_token_account: Box<Account<'info, TokenAccount>>,

    // programs and sysvars
    rent: Sysvar<'info, Rent>,
    token_program: Program<'info, Token>,
    system_program: Program<'info, System>,
    associated_token: Program<'info, AssociatedToken>,
    cardinal_token_manager: Program<'info, CardinalTokenManager>,
    /// CHECK: This is not dangerous because the ID is checked with instructions sysvar
    #[account(address = sysvar::instructions::id())]
    instructions: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<PermissionedStakeCtx>) -> Result<()> {
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

    let cpi_accounts = associated_token::Create {
        payer: ctx.accounts.user.to_account_info(),
        associated_token: ctx.accounts.stake_entry_original_mint_token_account.to_account_info(),
        authority: stake_entry.to_account_info(),
        mint: ctx.accounts.original_mint.to_account_info(),
        system_program: ctx.accounts.system_program.to_account_info(),
        token_program: ctx.accounts.token_program.to_account_info(),
        rent: ctx.accounts.rent.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_context = CpiContext::new(cpi_program, cpi_accounts);
    associated_token::create(cpi_context)?;

    // transfer original
    let cpi_accounts = cardinal_token_manager::cpi::accounts::SendCtx {
        token_manager: ctx.accounts.token_manager.to_account_info(),
        mint: ctx.accounts.original_mint.to_account_info(),
        mint_manager: ctx.accounts.mint_manager.to_account_info(),
        recipient: ctx.accounts.user.to_account_info(),
        recipient_token_account: ctx.accounts.user_original_mint_token_account.to_account_info(),
        target: stake_entry.to_account_info(),
        target_token_account: ctx.accounts.stake_entry_original_mint_token_account.to_account_info(),
        payer: ctx.accounts.user.to_account_info(),
        associated_token_program: ctx.accounts.associated_token.to_account_info(),
        token_program: ctx.accounts.token_program.to_account_info(),
        system_program: ctx.accounts.system_program.to_account_info(),
        rent: ctx.accounts.rent.to_account_info(),
        instructions: ctx.accounts.instructions.to_account_info(),
    };
    let cpi_context = CpiContext::new(ctx.accounts.token_manager.to_account_info(), cpi_accounts);
    cardinal_token_manager::cpi::send(cpi_context)?;

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
