import { findAta } from "@cardinal/common";
import {
  createInitMintManagerInstruction,
  findMintManagerId,
  findMintMetadataId,
  findRulesetId,
  MintManager,
} from "@cardinal/creator-standard";
import { expectTXTable } from "@saberhq/chai-solana";
import {
  SignerWallet,
  SolanaProvider,
  TransactionEnvelope,
} from "@saberhq/solana-contrib";
import type * as splToken from "@solana/spl-token";
import type { Transaction } from "@solana/web3.js";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { expect } from "chai";

import { createStakePool, stake, unstake } from "../../src";
import { getStakeEntry } from "../../src/programs/stakePool/accounts";
import { findStakeEntryIdFromMint } from "../../src/programs/stakePool/utils";
import { createMint } from "../utils";
import { getProvider } from "../workspace";

describe("Create stake pool", () => {
  let stakePoolId: PublicKey;
  let originalMintTokenAccountId: PublicKey;
  let originalMint: splToken.Token;
  const staker = Keypair.generate();

  before(async () => {
    const provider = getProvider();

    const fromAirdropSignature = await provider.connection.requestAirdrop(
      staker.publicKey,
      LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(fromAirdropSignature);

    // original mint
    [originalMintTokenAccountId, originalMint] = await createMint(
      provider.connection,
      staker,
      staker.publicKey,
      1,
      staker.publicKey,
      staker.publicKey,
      0
    );

    const mintManagerId = findMintManagerId(originalMint.publicKey);
    const mintMetadataId = findMintMetadataId(originalMint.publicKey);
    const rulesetId = findRulesetId();
    const ix = createInitMintManagerInstruction({
      mintManager: mintManagerId,
      mint: originalMint.publicKey,
      mintMetadata: mintMetadataId,
      ruleset: rulesetId,
      holderTokenAccount: originalMintTokenAccountId,
      tokenAuthority: staker.publicKey,
      authority: staker.publicKey,
      payer: staker.publicKey,
    });
    const txEnvelope = new TransactionEnvelope(
      SolanaProvider.init({
        connection: provider.connection,
        wallet: new SignerWallet(staker),
        opts: provider.opts,
      }),
      [ix]
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
      new SignerWallet(staker),
      {}
    );

    await expectTXTable(
      new TransactionEnvelope(
        SolanaProvider.init({
          connection: provider.connection,
          wallet: new SignerWallet(staker),
          opts: provider.opts,
        }),
        [...transaction.instructions]
      ),
      "Create pool"
    ).to.be.fulfilled;
  });

  it("Stake", async () => {
    const provider = getProvider();

    await expectTXTable(
      new TransactionEnvelope(
        SolanaProvider.init({
          connection: provider.connection,
          wallet: new SignerWallet(staker),
          opts: provider.opts,
        }),
        [
          ...(
            await stake(provider.connection, new SignerWallet(staker), {
              stakePoolId: stakePoolId,
              originalMintId: originalMint.publicKey,
              userOriginalMintTokenAccountId: originalMintTokenAccountId,
            })
          ).instructions,
        ]
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
    expect(checkUserOriginalTokenAccount.amount.toNumber()).to.eq(1);
    expect(checkUserOriginalTokenAccount.isFrozen).to.eq(true);

    const mintManagerId = findMintManagerId(originalMint.publicKey);
    const checkMintManagerData = await MintManager.fromAccountAddress(
      provider.connection,
      mintManagerId
    );
    expect(checkMintManagerData.inUseBy?.toString()).to.be.eq(
      stakeEntryData.pubkey.toString()
    );
  });

  it("Unstake", async () => {
    const provider = getProvider();
    await expectTXTable(
      new TransactionEnvelope(
        SolanaProvider.init({
          connection: provider.connection,
          wallet: new SignerWallet(staker),
          opts: provider.opts,
        }),
        [
          ...(
            await unstake(provider.connection, new SignerWallet(staker), {
              stakePoolId: stakePoolId,
              originalMintId: originalMint.publicKey,
            })
          ).instructions,
        ]
      ),
      "Unstake"
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
    expect(stakeEntryData.parsed.lastStaker.toString()).to.eq(
      PublicKey.default.toString()
    );
    expect(stakeEntryData.parsed.lastStakedAt.toNumber()).to.gt(0);

    const userOriginalMintTokenAccountId = await findAta(
      originalMint.publicKey,
      staker.publicKey,
      true
    );
    const checkUserOriginalTokenAccount = await originalMint.getAccountInfo(
      userOriginalMintTokenAccountId
    );
    expect(checkUserOriginalTokenAccount.amount.toNumber()).to.eq(1);
    expect(checkUserOriginalTokenAccount.isFrozen).to.eq(true);

    const mintManagerId = findMintManagerId(originalMint.publicKey);
    const checkMintManagerData = await MintManager.fromAccountAddress(
      provider.connection,
      mintManagerId
    );
    expect(checkMintManagerData.inUseBy?.toString()).to.be.undefined;
  });
});
