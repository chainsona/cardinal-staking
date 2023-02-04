use mpl_token_metadata::instruction::MetadataInstruction;
use solana_program::{instruction::Instruction, program::invoke};

use {
    crate::{errors::ErrorCode, state::*},
    anchor_lang::prelude::*,
    anchor_spl::token::{self, Mint, Token, TokenAccount},
};

#[derive(Accounts)]
pub struct StakeProgrammableCtx<'info> {
    #[account(mut, seeds = [STAKE_ENTRY_PREFIX.as_bytes(), stake_entry.pool.as_ref(), stake_entry.original_mint.as_ref(), get_stake_seed(original_mint.supply, user.key()).as_ref()], bump=stake_entry.bump)]
    stake_entry: Box<Account<'info, StakeEntry>>,

    #[account(mut, constraint = stake_entry.pool == stake_pool.key() @ ErrorCode::InvalidStakePool)]
    stake_pool: Box<Account<'info, StakePool>>,

    // stake_entry token accounts
    #[account(mut, constraint =
        stake_entry_original_mint_token_account.mint == stake_entry.original_mint
        && stake_entry_original_mint_token_account.owner == stake_entry.key()
        @ ErrorCode::InvalidStakeEntryOriginalMintTokenAccount
    )]
    stake_entry_original_mint_token_account: Box<Account<'info, TokenAccount>>,
    original_mint: Box<Account<'info, Mint>>,

    // user
    #[account(mut)]
    user: Signer<'info>,
    #[account(mut, constraint =
        user_original_mint_token_account.amount > 0
        && user_original_mint_token_account.mint == stake_entry.original_mint
        && user_original_mint_token_account.owner == user.key()
        @ ErrorCode::InvalidUserOriginalMintTokenAccount
    )]
    user_original_mint_token_account: Box<Account<'info, TokenAccount>>,

    // programs
    token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<StakeProgrammableCtx>, amount: u64) -> Result<()> {
    let stake_pool = &mut ctx.accounts.stake_pool;
    let stake_entry = &mut ctx.accounts.stake_entry;

    if stake_pool.end_date.is_some() && Clock::get().unwrap().unix_timestamp > stake_pool.end_date.unwrap() {
        return Err(error!(ErrorCode::StakePoolHasEnded));
    }

    if stake_entry.amount != 0 {
        stake_entry.total_stake_seconds = stake_entry.total_stake_seconds.saturating_add(
            (u128::try_from(stake_entry.cooldown_start_seconds.unwrap_or(Clock::get().unwrap().unix_timestamp))
                .unwrap()
                .saturating_sub(u128::try_from(stake_entry.last_updated_at.unwrap_or(stake_entry.last_staked_at)).unwrap()))
            .checked_mul(u128::try_from(stake_entry.amount).unwrap())
            .unwrap(),
        );
        stake_entry.cooldown_start_seconds = None;
    }

    // transfer original
    let cpi_accounts = token::Transfer {
        from: ctx.accounts.user_original_mint_token_account.to_account_info(),
        to: ctx.accounts.stake_entry_original_mint_token_account.to_account_info(),
        authority: ctx.accounts.user.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_context = CpiContext::new(cpi_program, cpi_accounts);
    token::transfer(cpi_context, amount)?;

    if stake_pool.reset_on_stake && stake_entry.amount == 0 {
        stake_entry.total_stake_seconds = 0;
    }

    // update stake entry
    stake_entry.last_staked_at = Clock::get().unwrap().unix_timestamp;
    stake_entry.last_updated_at = Some(Clock::get().unwrap().unix_timestamp);
    stake_entry.last_staker = ctx.accounts.user.key();
    stake_entry.amount = stake_entry.amount.checked_add(amount).unwrap();
    stake_pool.total_staked = stake_pool.total_staked.checked_add(1).expect("Add error");

    let mint_metadata_info = next_account_info(remaining_accs)?;
    let mint_edition_info = next_account_info(remaining_accs)?;
    let token_manager_token_record_info = next_account_info(remaining_accs)?;
    let recipient_token_record_info = next_account_info(remaining_accs)?;
    let sysvar_instructions_info = next_account_info(remaining_accs)?;
    let associated_token_program_info = next_account_info(remaining_accs)?;
    let authorization_rules_program_info = next_account_info(remaining_accs)?;
    let authorization_rules_info = next_account_info(remaining_accs)?;
    invoke(
        &Instruction {
            program_id: mpl_token_metadata::id(),
            accounts: vec![
                // 0. `[writable]` Delegate record account
                AccountMeta::new_readonly(mpl_token_metadata::id(), false),
                // 1. `[]` Delegated owner
                AccountMeta::new_readonly(token_manager.key(), false),
                // 2. `[writable]` Metadata account
                AccountMeta::new(mint_metadata_info.key(), false),
                // 3. `[optional]` Master Edition account
                AccountMeta::new_readonly(mint_edition_info.key(), false),
                // 4. `[]` Token record
                AccountMeta::new(recipient_token_record_info.key(), false),
                // 5. `[]` Mint account
                AccountMeta::new_readonly(mint_info.key(), false),
                // 6. `[optional, writable]` Token account
                AccountMeta::new(ctx.accounts.recipient_token_account.key(), false),
                // 7. `[signer]` Approver (update authority or token owner) to approve the delegation
                AccountMeta::new_readonly(ctx.accounts.recipient.key(), true),
                // 8. `[signer, writable]` Payer
                AccountMeta::new(ctx.accounts.recipient.key(), true),
                // 9. `[]` System Program
                AccountMeta::new_readonly(ctx.accounts.system_program.key(), false),
                // 10. `[]` Instructions sysvar account
                AccountMeta::new_readonly(sysvar_instructions_info.key(), false),
                // 11. `[optional]` SPL Token Program
                AccountMeta::new_readonly(ctx.accounts.token_program.key(), false),
                // 12. `[optional]` Token Authorization Rules program
                AccountMeta::new_readonly(authorization_rules_program_info.key(), false),
                // 13. `[optional]` Token Authorization Rules account
                AccountMeta::new_readonly(authorization_rules_info.key(), false),
            ],
            data: MetadataInstruction::Delegate(DelegateArgs::Lock {
                amount: token_manager.amount,
                locked_address: token_manager.key(),
                authorization_data: None,
            })
            .try_to_vec()
            .unwrap(),
        },
        &[
            token_manager.to_account_info(),
            mint_metadata_info.to_account_info(),
            mint_edition_info.to_account_info(),
            recipient_token_record_info.to_account_info(),
            mint_info.to_account_info(),
            ctx.accounts.recipient_token_account.to_account_info(),
            ctx.accounts.recipient.to_account_info(),
            ctx.accounts.recipient.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
            sysvar_instructions_info.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
            authorization_rules_program_info.to_account_info(),
            authorization_rules_info.to_account_info(),
        ],
    )?;

    invoke_signed(
        &Instruction {
            program_id: mpl_token_metadata::id(),
            accounts: vec![
                // 0. `[signer]` Delegate
                AccountMeta::new_readonly(token_manager.key(), true),
                // 1. `[optional]` Token owner
                AccountMeta::new_readonly(ctx.accounts.recipient.key(), false),
                // 2. `[writable]` Token account
                AccountMeta::new(ctx.accounts.recipient_token_account.key(), false),
                // 3. `[]` Mint account
                AccountMeta::new_readonly(mint_info.key(), false),
                // 4. `[writable]` Metadata account
                AccountMeta::new(mint_metadata_info.key(), false),
                // 5. `[optional]` Edition account
                AccountMeta::new_readonly(mint_edition_info.key(), false),
                // 6. `[optional, writable]` Token record account
                AccountMeta::new(recipient_token_record_info.key(), false),
                // 7. `[signer, writable]` Payer
                AccountMeta::new(ctx.accounts.recipient.key(), true),
                // 8. `[]` System Program
                AccountMeta::new_readonly(ctx.accounts.system_program.key(), false),
                // 9. `[]` Instructions sysvar account
                AccountMeta::new_readonly(sysvar_instructions_info.key(), false),
                // 10. `[optional]` SPL Token Program
                AccountMeta::new_readonly(ctx.accounts.token_program.key(), false),
                // 11. `[optional]` Token Authorization Rules program
                AccountMeta::new_readonly(authorization_rules_program_info.key(), false),
                // 12. `[optional]` Token Authorization Rules account
                AccountMeta::new_readonly(authorization_rules_info.key(), false),
            ],
            data: MetadataInstruction::Lock(LockArgs::V1 { authorization_data: None }).try_to_vec().unwrap(),
        },
        &[
            token_manager.to_account_info(),
            ctx.accounts.recipient.to_account_info(),
            ctx.accounts.recipient_token_account.to_account_info(),
            mint_info.to_account_info(),
            ctx.accounts.recipient_token_account.to_account_info(),
            mint_info.to_account_info(),
            mint_metadata_info.to_account_info(),
            mint_edition_info.to_account_info(),
            recipient_token_record_info.to_account_info(),
            ctx.accounts.recipient.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
            sysvar_instructions_info.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
            authorization_rules_program_info.to_account_info(),
            authorization_rules_info.to_account_info(),
        ],
        token_manager_signer,
    )?;

    Ok(())
}
