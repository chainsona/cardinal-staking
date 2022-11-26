import { TOKEN_MANAGER_ADDRESS } from "@cardinal/token-manager/dist/cjs/programs/tokenManager";
import type { BN } from "@project-serum/anchor";
import { AnchorProvider, Program } from "@project-serum/anchor";
import type { Wallet } from "@saberhq/solana-contrib";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@saberhq/token-utils";
import type {
  AccountMeta,
  Connection,
  PublicKey,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";

import type { STAKE_POOL_PROGRAM } from "../constants";
import { STAKE_POOL_ADDRESS, STAKE_POOL_IDL } from "../constants";

export const permissionedStake = (
  connection: Connection,
  wallet: Wallet,
  params: {
    originalMint: PublicKey;
    stakeEntryId: PublicKey;
    stakePoolId: PublicKey;
    tokenManager: PublicKey;
    mintManager: PublicKey;
    stakeEntryOriginalMintTokenAccountId: PublicKey;
    userOriginalMintTokenAccountId: PublicKey;
    amount: BN;
  }
): TransactionInstruction => {
  const provider = new AnchorProvider(connection, wallet, {});
  const stakePoolProgram = new Program<STAKE_POOL_PROGRAM>(
    STAKE_POOL_IDL,
    STAKE_POOL_ADDRESS,
    provider
  );

  return stakePoolProgram.instruction.permissionedStake({
    accounts: {
      stakeEntry: params.stakeEntryId,
      stakePool: params.stakePoolId,
      stakeEntryOriginalMintTokenAccount:
        params.stakeEntryOriginalMintTokenAccountId,
      originalMint: params.originalMint,
      tokenManager: params.tokenManager,
      mintManager: params.mintManager,
      user: wallet.publicKey,
      userOriginalMintTokenAccount: params.userOriginalMintTokenAccountId,
      rent: SYSVAR_RENT_PUBKEY,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      associatedToken: ASSOCIATED_TOKEN_PROGRAM_ID,
      cardinalTokenManager: TOKEN_MANAGER_ADDRESS,
      instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
    },
  });
};

export const permissionedUnstake = (
  connection: Connection,
  wallet: Wallet,
  params: {
    stakePoolId: PublicKey;
    stakeEntryId: PublicKey;
    tokenManager: PublicKey;
    mintManager: PublicKey;
    originalMint: PublicKey;
    stakeEntryOriginalMintTokenAccount: PublicKey;
    userOriginalMintTokenAccount: PublicKey;
    user: PublicKey;
    remainingAccounts: AccountMeta[];
  }
): TransactionInstruction => {
  const provider = new AnchorProvider(connection, wallet, {});
  const stakePoolProgram = new Program<STAKE_POOL_PROGRAM>(
    STAKE_POOL_IDL,
    STAKE_POOL_ADDRESS,
    provider
  );

  return stakePoolProgram.instruction.permissionedUnstake({
    accounts: {
      stakePool: params.stakePoolId,
      stakeEntry: params.stakeEntryId,
      originalMint: params.originalMint,
      tokenManager: params.tokenManager,
      mintManager: params.mintManager,
      stakeEntryOriginalMintTokenAccount:
        params.stakeEntryOriginalMintTokenAccount,
      user: params.user,
      userOriginalMintTokenAccount: params.userOriginalMintTokenAccount,
      rent: SYSVAR_RENT_PUBKEY,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      associatedToken: ASSOCIATED_TOKEN_PROGRAM_ID,
      cardinalTokenManager: TOKEN_MANAGER_ADDRESS,
      instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
    },
    remainingAccounts: params.remainingAccounts,
  });
};
