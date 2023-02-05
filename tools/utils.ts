import {
  findMintEditionId,
  findMintMetadataId,
  METADATA_PROGRAM_ID,
  tryGetAccount,
} from "@cardinal/common";
import { fetchIdlAccountNullable } from "@cardinal/rewards-center";
import {
  createCreateOrUpdateInstruction,
  PREFIX as TOKEN_AUTH_RULESET_PREFIX,
  PROGRAM_ID as TOKEN_AUTH_RULES_ID,
} from "@metaplex-foundation/mpl-token-auth-rules";
import {
  createCreateInstruction,
  createMintInstruction,
  TokenStandard,
} from "@metaplex-foundation/mpl-token-metadata";
import { encode } from "@msgpack/msgpack";
import { utils } from "@project-serum/anchor";
import type { Wallet } from "@project-serum/anchor/dist/cjs/provider";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import type { Connection, SendTransactionError, Signer } from "@solana/web3.js";
import {
  Keypair,
  PublicKey,
  sendAndConfirmRawTransaction,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  Transaction,
} from "@solana/web3.js";
import * as dotenv from "dotenv";

import { getStakePool } from "../src/programs/stakePool/accounts";

dotenv.config();

export type StakePoolKind = "v1" | "v2" | "unknown";

export const stakePoolKind = async (
  connection: Connection,
  stakePoolAddress: PublicKey
): Promise<StakePoolKind> => {
  const checkStakePooolV1 = await tryGetAccount(() =>
    getStakePool(connection, stakePoolAddress)
  );
  if (checkStakePooolV1) return "v1";

  const checkStakePoolV2 = await fetchIdlAccountNullable(
    connection,
    stakePoolAddress,
    "stakePool"
  );
  if (checkStakePoolV2) return "v2";

  return "unknown";
};

export function chunkArray<T>(arr: T[], size: number): T[][] {
  return arr.length > size
    ? [arr.slice(0, size), ...chunkArray(arr.slice(size), size)]
    : [arr];
}

export const keypairFrom = (s: string, n?: string): Keypair => {
  try {
    if (s.includes("[")) {
      return Keypair.fromSecretKey(
        Buffer.from(
          s
            .replace("[", "")
            .replace("]", "")
            .split(",")
            .map((c) => parseInt(c))
        )
      );
    } else {
      return Keypair.fromSecretKey(utils.bytes.bs58.decode(s));
    }
  } catch (e) {
    try {
      return Keypair.fromSecretKey(
        Buffer.from(
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          JSON.parse(
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-var-requires
            require("fs").readFileSync(s, {
              encoding: "utf-8",
            })
          )
        )
      );
    } catch (e) {
      process.stdout.write(`${n ?? "keypair"} is not valid keypair`);
      process.exit(1);
    }
  }
};

export const publicKeyFrom = (s: string, n?: string): PublicKey => {
  try {
    return new PublicKey(s);
  } catch (e) {
    process.stdout.write(`${n ?? "publicKey"} is not valid publicKey`);
    process.exit(1);
  }
};

export async function executeTransaction(
  connection: Connection,
  tx: Transaction,
  wallet: Wallet,
  config?: { signers?: Signer[]; silent?: boolean }
): Promise<string> {
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.feePayer = wallet.publicKey;
  await wallet.signTransaction(tx);
  if (config?.signers) {
    tx.partialSign(...(config?.signers ?? []));
  }
  try {
    const txid = await sendAndConfirmRawTransaction(connection, tx.serialize());
    return txid;
  } catch (e) {
    if (!config?.silent) {
      handleError(e);
    }
    throw e;
  }
}

export async function executeTransactions(
  connection: Connection,
  txs: Transaction[],
  wallet: Wallet,
  config?: { signers?: Signer[]; silent?: boolean }
): Promise<string[]> {
  const latestBlockhash = (await connection.getLatestBlockhash()).blockhash;
  const signedTxs = await wallet.signAllTransactions(
    txs.map((tx) => {
      tx.recentBlockhash = latestBlockhash;
      tx.feePayer = wallet.publicKey;
      if (config?.signers) {
        tx.partialSign(...(config?.signers ?? []));
      }
      return tx;
    })
  );
  const txids = await Promise.all(
    signedTxs.map(async (tx) => {
      try {
        const txid = await sendAndConfirmRawTransaction(
          connection,
          tx.serialize()
        );
        return txid;
      } catch (e) {
        if (!config?.silent) {
          handleError(e);
        }
        throw e;
      }
    })
  );
  return txids;
}

export const handleError = (e: any) => {
  const message = (e as SendTransactionError).message ?? "";
  const logs = (e as SendTransactionError).logs;
  if (logs) {
    console.log(logs, message);
  } else {
    console.log(e, message);
  }
};

export const createProgrammableAsset = async (
  connection: Connection,
  wallet: Wallet
): Promise<[PublicKey, PublicKey, PublicKey]> => {
  const mintKeypair = Keypair.generate();
  const mintId = mintKeypair.publicKey;
  const [tx, ata, rulesetId] = createProgrammableAssetTx(
    mintKeypair.publicKey,
    wallet.publicKey
  );
  await executeTransaction(connection, tx, wallet, { signers: [mintKeypair] });
  return [ata, mintId, rulesetId];
};

export const findRuleSetId = (authority: PublicKey, name: string) => {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from(TOKEN_AUTH_RULESET_PREFIX),
      authority.toBuffer(),
      Buffer.from(name),
    ],
    TOKEN_AUTH_RULES_ID
  )[0];
};

export function findTokenRecordId(
  mint: PublicKey,
  token: PublicKey
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata"),
      METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
      Buffer.from("token_record"),
      token.toBuffer(),
    ],
    METADATA_PROGRAM_ID
  )[0];
}

export const createProgrammableAssetTx = (
  mintId: PublicKey,
  authority: PublicKey
): [Transaction, PublicKey, PublicKey] => {
  const metadataId = findMintMetadataId(mintId);
  const masterEditionId = findMintEditionId(mintId);
  const ataId = getAssociatedTokenAddressSync(mintId, authority);
  const rulesetName = `rs-${Math.floor(Date.now() / 1000)}`;
  const rulesetId = findRuleSetId(authority, rulesetName);
  const rulesetIx = createCreateOrUpdateInstruction(
    {
      payer: authority,
      ruleSetPda: rulesetId,
    },
    {
      createOrUpdateArgs: {
        __kind: "V1",
        serializedRuleSet: encode([
          1,
          authority.toBuffer().reduce((acc, i) => {
            acc.push(i);
            return acc;
          }, [] as number[]),
          rulesetName,
          {
            "Transfer:WalletToWallet": "Pass",
            "Transfer:Owner": "Pass",
            "Transfer:Delegate": "Pass",
            "Transfer:TransferDelegate": "Pass",
          },
        ]),
      },
    }
  );
  const createIx = createCreateInstruction(
    {
      metadata: metadataId,
      masterEdition: masterEditionId,
      mint: mintId,
      authority: authority,
      payer: authority,
      splTokenProgram: TOKEN_PROGRAM_ID,
      sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
      updateAuthority: authority,
    },
    {
      createArgs: {
        __kind: "V1",
        assetData: {
          name: `NFT - ${Math.floor(Date.now() / 1000)}`,
          symbol: "PNF",
          uri: "uri",
          sellerFeeBasisPoints: 0,
          creators: [
            {
              address: authority,
              share: 100,
              verified: false,
            },
          ],
          primarySaleHappened: false,
          isMutable: true,
          tokenStandard: TokenStandard.ProgrammableNonFungible,
          collection: null,
          uses: null,
          collectionDetails: null,
          ruleSet: rulesetId,
        },
        decimals: 0,
        printSupply: { __kind: "Zero" },
      },
    }
  );
  const createIxWithSigner = {
    ...createIx,
    keys: createIx.keys.map((k) =>
      k.pubkey.toString() === mintId.toString() ? { ...k, isSigner: true } : k
    ),
  };
  const mintIx = createMintInstruction(
    {
      token: ataId,
      tokenOwner: authority,
      metadata: metadataId,
      masterEdition: masterEditionId,
      tokenRecord: findTokenRecordId(mintId, ataId),
      mint: mintId,
      payer: authority,
      authority: authority,
      sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
      splAtaProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      splTokenProgram: TOKEN_PROGRAM_ID,
      authorizationRules: rulesetId,
      authorizationRulesProgram: TOKEN_AUTH_RULES_ID,
    },
    {
      mintArgs: {
        __kind: "V1",
        amount: 1,
        authorizationData: null,
      },
    }
  );
  return [
    new Transaction().add(rulesetIx, createIxWithSigner, mintIx),
    ataId,
    rulesetId,
  ];
};
