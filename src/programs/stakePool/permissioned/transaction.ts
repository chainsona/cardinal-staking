import { findAta, tryGetAccount } from "@cardinal/common";
import {
  findMintManagerId,
  findTokenManagerAddress,
} from "@cardinal/token-manager/dist/cjs/programs/tokenManager/pda";
import { BN } from "@project-serum/anchor";
import type { Wallet } from "@saberhq/solana-contrib";
import type { Connection, PublicKey, Transaction } from "@solana/web3.js";

import { getStakeEntry } from "../accounts";
import {
  findStakeEntryIdFromMint,
  withRemainingAccountsForUnstake,
} from "../utils";
import { permissionedStake, permissionedUnstake } from "./instructions";

export const withPermissionedStake = async (
  transaction: Transaction,
  connection: Connection,
  wallet: Wallet,
  params: {
    stakePoolId: PublicKey;
    originalMintId: PublicKey;
    userOriginalMintTokenAccountId: PublicKey;
    amount?: BN;
  }
): Promise<Transaction> => {
  const [stakeEntryId] = await findStakeEntryIdFromMint(
    connection,
    wallet.publicKey,
    params.stakePoolId,
    params.originalMintId
  );

  const stakeEntryOriginalMintTokenAccountId = await findAta(
    params.originalMintId,
    stakeEntryId,
    true
  );
  const [tokenManagerId] = await findTokenManagerAddress(params.originalMintId);
  const [mintManagerId] = await findMintManagerId(params.originalMintId);

  transaction.add(
    permissionedStake(connection, wallet, {
      stakeEntryId: stakeEntryId,
      stakePoolId: params.stakePoolId,
      originalMint: params.originalMintId,
      tokenManager: tokenManagerId,
      mintManager: mintManagerId,
      stakeEntryOriginalMintTokenAccountId:
        stakeEntryOriginalMintTokenAccountId,
      userOriginalMintTokenAccountId: params.userOriginalMintTokenAccountId,
      amount: params.amount || new BN(1),
    })
  );
  return transaction;
};

export const withPermissionedUnstake = async (
  transaction: Transaction,
  connection: Connection,
  wallet: Wallet,
  params: {
    stakePoolId: PublicKey;
    originalMintId: PublicKey;
    userOriginalMintTokenAccountId: PublicKey;
  }
): Promise<Transaction> => {
  const [stakeEntryId] = await findStakeEntryIdFromMint(
    connection,
    wallet.publicKey,
    params.stakePoolId,
    params.originalMintId
  );

  const stakeEntryOriginalMintTokenAccountId = await findAta(
    params.originalMintId,
    stakeEntryId,
    true
  );
  const [tokenManagerId] = await findTokenManagerAddress(params.originalMintId);
  const [mintManagerId] = await findMintManagerId(params.originalMintId);

  const stakeEntryData = await tryGetAccount(() =>
    getStakeEntry(connection, stakeEntryId)
  );

  const remainingAccounts = await withRemainingAccountsForUnstake(
    transaction,
    connection,
    wallet,
    stakeEntryId,
    stakeEntryData?.parsed.stakeMint
  );

  transaction.add(
    permissionedUnstake(connection, wallet, {
      stakePoolId: params.stakePoolId,
      stakeEntryId: stakeEntryId,
      tokenManager: tokenManagerId,
      mintManager: mintManagerId,
      originalMint: params.originalMintId,
      stakeEntryOriginalMintTokenAccount: stakeEntryOriginalMintTokenAccountId,
      userOriginalMintTokenAccount: params.userOriginalMintTokenAccountId,
      user: wallet.publicKey,
      remainingAccounts: remainingAccounts,
    })
  );
  return transaction;
};
