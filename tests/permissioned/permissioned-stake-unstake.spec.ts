import { createMint, findAta, tryGetAccount } from "@cardinal/common";
import {
  withInitTransferAuthority,
  withWrapToken,
} from "@cardinal/token-manager";
import { getTransferAuthority } from "@cardinal/token-manager/dist/cjs/programs/transferAuthority/accounts";
import { findTransferAuthorityAddress } from "@cardinal/token-manager/dist/cjs/programs/transferAuthority/pda";
import { expectTXTable } from "@saberhq/chai-solana";
import {
  SignerWallet,
  SolanaProvider,
  TransactionEnvelope,
} from "@saberhq/solana-contrib";
import type * as splToken from "@solana/spl-token";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import { expect } from "chai";

import { createStakePool } from "../../src";
import { getStakeEntry } from "../../src/programs/stakePool/accounts";
import {
  withPermissionedStake,
  withPermissionedUnstake,
} from "../../src/programs/stakePool/permissioned/transaction";
import { withInitStakeEntry } from "../../src/programs/stakePool/transaction";
import { findStakeEntryIdFromMint } from "../../src/programs/stakePool/utils";
import { getProvider } from "../workspace";

describe("Permissioned Stake", () => {
  let stakePoolId: PublicKey;
  let originalMintTokenAccountId: PublicKey;
  let originalMint: splToken.Token;
  const staker = Keypair.generate();
  const stakerWallet = new SignerWallet(staker);

  before(async () => {
    const provider = getProvider();
    const stakerAirdropSignature = await provider.connection.requestAirdrop(
      staker.publicKey,
      LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(stakerAirdropSignature);

    // original mint
    [originalMintTokenAccountId, originalMint] = await createMint(
      provider.connection,
      staker,
      staker.publicKey,
      1,
      staker.publicKey
    );

    const taTransaction = new Transaction();
    const [transferAuthorityId] = await findTransferAuthorityAddress("global");
    const transferAuthorityData = await tryGetAccount(() =>
      getTransferAuthority(provider.connection, transferAuthorityId)
    );
    if (!transferAuthorityData) {
      await withInitTransferAuthority(
        taTransaction,
        provider.connection,
        provider.wallet,
        "global"
      );
    }

    if (taTransaction.instructions.length > 0) {
      const taTxEnvelope = new TransactionEnvelope(
        SolanaProvider.init({
          connection: provider.connection,
          wallet: provider.wallet,
          opts: provider.opts,
        }),
        taTransaction.instructions
      );

      await expectTXTable(taTxEnvelope, "before", {
        verbosity: "error",
        formatLogs: true,
      }).to.be.fulfilled;
    }

    const transaction = new Transaction();
    await withWrapToken(
      transaction,
      provider.connection,
      stakerWallet,
      originalMint.publicKey,
      {
        transferAuthorityName: "global",
      }
    );

    const txEnvelope = new TransactionEnvelope(
      SolanaProvider.init({
        connection: provider.connection,
        wallet: stakerWallet,
        opts: provider.opts,
      }),
      transaction.instructions
    );

    await expectTXTable(txEnvelope, "before", {
      verbosity: "error",
      formatLogs: true,
    }).to.be.fulfilled;
  });

  it("Create Pool", async () => {
    const provider = getProvider();

    let transaction: Transaction;
    [transaction, stakePoolId] = await createStakePool(
      provider.connection,
      provider.wallet,
      {}
    );

    await expectTXTable(
      new TransactionEnvelope(SolanaProvider.init(provider), [
        ...transaction.instructions,
      ]),
      "Create pool"
    ).to.be.fulfilled;
  });

  it("Create Stake Entry", async () => {
    const provider = getProvider();
    const transaction = new Transaction();

    await withInitStakeEntry(transaction, provider.connection, stakerWallet, {
      stakePoolId: stakePoolId,
      originalMintId: originalMint.publicKey,
    });

    await expectTXTable(
      new TransactionEnvelope(
        SolanaProvider.init({
          connection: provider.connection,
          wallet: stakerWallet,
          opts: provider.opts,
        }),
        transaction.instructions
      ),
      "Create Stake Entry"
    ).to.be.fulfilled;

    const stakeEntryData = await getStakeEntry(
      provider.connection,
      (
        await findStakeEntryIdFromMint(
          provider.connection,
          staker.publicKey,
          stakePoolId,
          originalMint.publicKey
        )
      )[0]
    );
    expect(stakeEntryData.parsed.lastStakedAt.toNumber()).to.eq(0);
    expect(stakeEntryData.parsed.lastStaker.toString()).to.eq(
      PublicKey.default.toString()
    );
  });

  it("Stake", async () => {
    const provider = getProvider();
    const transaction = new Transaction();
    await withPermissionedStake(
      transaction,
      provider.connection,
      stakerWallet,
      {
        stakePoolId: stakePoolId,
        originalMintId: originalMint.publicKey,
        userOriginalMintTokenAccountId: originalMintTokenAccountId,
      }
    );

    await expectTXTable(
      new TransactionEnvelope(
        SolanaProvider.init({
          connection: provider.connection,
          wallet: stakerWallet,
          opts: provider.opts,
        }),
        transaction.instructions
      ),
      "Stake"
    ).to.be.fulfilled;

    const stakeEntryData = await getStakeEntry(
      provider.connection,
      (
        await findStakeEntryIdFromMint(
          provider.connection,
          staker.publicKey,
          stakePoolId,
          originalMint.publicKey
        )
      )[0]
    );

    const userOriginalMintTokenAccountId = await findAta(
      originalMint.publicKey,
      staker.publicKey,
      true
    );

    expect(stakeEntryData.parsed.lastStakedAt.toNumber()).to.be.greaterThan(0);
    expect(stakeEntryData.parsed.lastStaker.toString()).to.eq(
      staker.publicKey.toString()
    );

    const checkUserOriginalTokenAccount = await originalMint.getAccountInfo(
      userOriginalMintTokenAccountId
    );
    expect(checkUserOriginalTokenAccount.amount.toNumber()).to.eq(0);
  });

  it("Unstake", async () => {
    const provider = getProvider();
    const transatcion = new Transaction();

    await withPermissionedUnstake(
      transatcion,
      provider.connection,
      stakerWallet,
      {
        stakePoolId: stakePoolId,
        originalMintId: originalMint.publicKey,
        userOriginalMintTokenAccountId: originalMintTokenAccountId,
      }
    );

    await expectTXTable(
      new TransactionEnvelope(
        SolanaProvider.init({
          connection: provider.connection,
          wallet: stakerWallet,
          opts: provider.opts,
        }),
        transatcion.instructions
      ),
      "Unstake"
    ).to.be.fulfilled;

    const [stakeEntryId] = await findStakeEntryIdFromMint(
      provider.connection,
      provider.wallet.publicKey,
      stakePoolId,
      originalMint.publicKey
    );
    const stakeEntryData = await getStakeEntry(
      provider.connection,
      stakeEntryId
    );
    expect(stakeEntryData.parsed.lastStaker.toString()).to.eq(
      PublicKey.default.toString()
    );
    expect(stakeEntryData.parsed.lastStakedAt.toNumber()).to.gt(0);

    const userOriginalMintTokenAccountId = await findAta(
      originalMint.publicKey,
      stakerWallet.publicKey,
      true
    );
    const checkUserOriginalTokenAccount = await originalMint.getAccountInfo(
      userOriginalMintTokenAccountId
    );
    expect(checkUserOriginalTokenAccount.amount.toNumber()).to.eq(1);
    expect(checkUserOriginalTokenAccount.isFrozen).to.eq(true);
  });
});
