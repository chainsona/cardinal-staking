pub mod receipt_mint;
pub use receipt_mint::*;
pub mod stake_booster;
pub use stake_booster::*;
pub mod stake_entry;
pub use stake_entry::*;
pub mod stake_pool;
pub use stake_pool::*;

pub mod errors;
pub mod state;

use anchor_lang::prelude::*;

declare_id!("stkBL96RZkjY5ine4TvPihGqW8UHJfch2cokjAPzV8i");

#[program]
pub mod cardinal_stake_pool {
    use super::*;

    pub fn init_identifier(ctx: Context<InitIdentifierCtx>) -> Result<()> {
        init_identifier::handler(ctx)
    }

    pub fn init_pool(ctx: Context<InitPoolCtx>, ix: InitPoolIx) -> Result<()> {
        init_pool::handler(ctx, ix)
    }

    pub fn init_entry(ctx: Context<InitEntryCtx>, user: Pubkey) -> Result<()> {
        init_entry::handler(ctx, user)
    }

    pub fn init_stake_mint(ctx: Context<InitStakeMintCtx>, ix: InitStakeMintIx) -> Result<()> {
        init_stake_mint::handler(ctx, ix)
    }

    pub fn authorize_mint(ctx: Context<AuthorizeMintCtx>, mint: Pubkey) -> Result<()> {
        authorize_mint::handler(ctx, mint)
    }

    pub fn deauthorize_mint(ctx: Context<DeauthorizeMintCtx>) -> Result<()> {
        deauthorize_mint::handler(ctx)
    }

    // editions
    pub fn stake(ctx: Context<StakeCtx>, amount: u64) -> Result<()> {
        editions::stake::handler(ctx, amount)
    }

    pub fn unstake(ctx: Context<UnstakeCtx>) -> Result<()> {
        editions::unstake::handler(ctx)
    }

    // ccs
    pub fn ccs_stake(ctx: Context<StakeCCSCtx>) -> Result<()> {
        ccs::stake::handler(ctx)
    }

    pub fn ccs_unstake(ctx: Context<UnstakeCCSCtx>) -> Result<()> {
        ccs::unstake::handler(ctx)
    }

    pub fn claim_receipt_mint<'key, 'accounts, 'remaining, 'info>(ctx: Context<'key, 'accounts, 'remaining, 'info, ClaimReceiptMintCtx<'info>>) -> Result<()> {
        claim_receipt_mint::handler(ctx)
    }

    pub fn update_pool(ctx: Context<UpdatePoolCtx>, ix: UpdatePoolIx) -> Result<()> {
        update_pool::handler(ctx, ix)
    }

    pub fn update_total_stake_seconds(ctx: Context<UpdateTotalStakeSecondsCtx>) -> Result<()> {
        update_total_stake_seconds::handler(ctx)
    }

    pub fn return_receipt_mint<'key, 'accounts, 'remaining, 'info>(ctx: Context<'key, 'accounts, 'remaining, 'info, ReturnReceiptMintCtx<'info>>) -> Result<()> {
        return_receipt_mint::handler(ctx)
    }

    pub fn close_stake_pool(ctx: Context<CloseStakePoolCtx>) -> Result<()> {
        close_stake_pool::handler(ctx)
    }

    pub fn close_stake_entry(ctx: Context<CloseStakeEntryCtx>) -> Result<()> {
        close_stake_entry::handler(ctx)
    }

    pub fn stake_entry_fill_zeros(ctx: Context<StakeEntryFillZeros>) -> Result<()> {
        stake_entry_fill_zeros::handler(ctx)
    }

    pub fn stake_pool_fill_zeros(ctx: Context<StakePoolFillZeros>) -> Result<()> {
        stake_pool_fill_zeros::handler(ctx)
    }

    pub fn reasssign_stake_entry(ctx: Context<ReassignStakeEntryCtx>, ix: ReassignStakeEntryIx) -> Result<()> {
        reassign_stake_entry::handler(ctx, ix)
    }

    //// stake_booster ////
    pub fn init_stake_booster(ctx: Context<InitStakeBoosterCtx>, ix: InitStakeBoosterIx) -> Result<()> {
        stake_booster::init_stake_booster::handler(ctx, ix)
    }

    pub fn update_stake_booster(ctx: Context<UpdateStakeBoosterCtx>, ix: UpdateStakeBoosterIx) -> Result<()> {
        stake_booster::update_stake_booster::handler(ctx, ix)
    }

    pub fn boost_stake_entry(ctx: Context<BoostStakeEntryCtx>, ix: BoostStakeEntryIx) -> Result<()> {
        stake_booster::boost_stake_entry::handler(ctx, ix)
    }

    pub fn close_stake_booster(ctx: Context<CloseStakeBoosterCtx>) -> Result<()> {
        stake_booster::close_stake_booster::handler(ctx)
    }
}
