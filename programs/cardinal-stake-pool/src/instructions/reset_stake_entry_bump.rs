use crate::errors::ErrorCode;
use crate::state::*;
use crate::utils::resize_account;
use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct ResetStakeEntryBumpIx {
    bump: u8,
}

#[derive(Accounts)]
#[instruction(ix: ResetStakeEntryBumpIx)]
pub struct ResetStakeEntryBumpCtx<'info> {
    #[account(mut)]
    stake_entry: Box<Account<'info, StakeEntry>>,

    #[account(mut, constraint = stake_entry.pool == stake_pool.key() @ ErrorCode::InvalidStakePool)]
    stake_pool: Box<Account<'info, StakePool>>,

    #[account(mut, constraint = authority.key() == stake_pool.authority @ ErrorCode::InvalidPoolAuthority)]
    authority: Signer<'info>,
    #[account(mut)]
    payer: Signer<'info>,
    system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<ResetStakeEntryBumpCtx>, ix: ResetStakeEntryBumpIx) -> Result<()> {
    let stake_entry = &mut ctx.accounts.stake_entry;
    let new_stake_entry = StakeEntry {
        bump: ix.bump,
        pool: stake_entry.pool,
        amount: stake_entry.amount,
        original_mint: stake_entry.original_mint,
        original_mint_claimed: stake_entry.original_mint_claimed,
        last_staker: stake_entry.last_staker,
        last_staked_at: stake_entry.last_staked_at,
        total_stake_seconds: stake_entry.total_stake_seconds,
        stake_mint_claimed: stake_entry.stake_mint_claimed,
        kind: stake_entry.kind,
        stake_mint: stake_entry.stake_mint,
        cooldown_start_seconds: stake_entry.cooldown_start_seconds,
        last_updated_at: stake_entry.last_updated_at,
        grouped: stake_entry.grouped,
    };
    let new_space = new_stake_entry.try_to_vec()?.len() + 8;
    stake_entry.set_inner(new_stake_entry);

    resize_account(
        &stake_entry.to_account_info(),
        new_space,
        &ctx.accounts.payer.to_account_info(),
        &ctx.accounts.system_program.to_account_info(),
    )?;

    Ok(())
}
