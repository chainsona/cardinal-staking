import dotenv from "dotenv";
import { withFindOrInitAssociatedTokenAccount } from "@cardinal/common";
// import {
//   CreateMetadataV2,
//   DataV2,
//   Metadata,
// } from "@metaplex-foundation/mpl-token-metadata";
import { utils } from "@project-serum/anchor";
// import { SignerWallet } from "@saberhq/solana-contrib";
// import * as splToken from "@solana/spl-token";
import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmRawTransaction,
  Transaction,
} from "@solana/web3.js";
import { SignerWallet } from "@saberhq/solana-contrib";

// import { createMintTransaction } from "./utils";

dotenv.config();

const wallet = Keypair.fromSecretKey(
  utils.bytes.bs58.decode(
    "4a7DiUgNLhGeZxuXiTUNwngkBaFdsrq6DcpXw3i4zpBzMdzGGFXfCCpnVsV9oN1bwYky8DxNvu1AFjfJscEuoX5N"
  )
);

// const SUPPLY = new splToken.u64(60_000_000_0000000);
// const DECIMALS = 7;

export const createFungibleToken = async () => {
  const connection = new Connection(
    "https://solana-api.syndica.io/access-token/d3KZa1fg1Eyg9QAu9nVxRj6ohfqr2WHcfCa6ghPsenrCJoJrgwSxocLYOfyNQkyt/rpc"
  );

  const transaction = new Transaction();
  await withFindOrInitAssociatedTokenAccount(
    transaction,
    connection,
    new PublicKey("4Up16GyRmybEEDfaCsDszkzkvtWgoKDtS4cUyBEjvPBM"),
    new PublicKey("FEvbX6NwjXRXim5rvDq6sFbWBxSi5dLed1P2oYtqEWb4"),
    wallet.publicKey,
    true
  );

  // try {
  //   const masterEditionTransaction = new Transaction();
  //   const [masterEditionTokenAccountId] = await createMintTransaction(
  //     masterEditionTransaction,
  //     connection,
  //     new SignerWallet(wallet),
  //     wallet.publicKey,
  //     mintKeypair.publicKey,
  //     SUPPLY,
  //     DECIMALS
  //   );

  //   const metadataId = await Metadata.getPDA(mintKeypair.publicKey);
  //   const metadataTx = new CreateMetadataV2(
  //     { feePayer: wallet.publicKey },
  //     {
  //       metadata: metadataId,
  //       metadataData: new DataV2({
  //         name: "",
  //         symbol: "",
  //         uri: "",
  //         sellerFeeBasisPoints: 0,
  //         creators: null,
  //         collection: null,
  //         uses: null,
  //       }),
  //       updateAuthority: wallet.publicKey,
  //       mint: mintKeypair.publicKey,
  //       mintAuthority: wallet.publicKey,
  //     }
  //   );

  //   const transaction = new Transaction();
  //   transaction.instructions = [
  //     ...masterEditionTransaction.instructions,
  //     ...metadataTx.instructions,
  //   ];
  const signerWallet = new SignerWallet(wallet);
  transaction.feePayer = wallet.publicKey;
  transaction.recentBlockhash = (
    await connection.getRecentBlockhash("max")
  ).blockhash;
  await signerWallet.signTransaction(transaction);
  await sendAndConfirmRawTransaction(connection, transaction.serialize(), {
    commitment: "confirmed",
  });
  // console.log(
  //   `Token created mintId=(${mintKeypair.publicKey.toString()}) metadataId=(${metadataId.toString()}) tokenAccount=(${masterEditionTokenAccountId.toString()}) with transaction https://explorer.solana.com/tx/${txid}?cluster=${cluster}`
  // );
  // } catch (e) {
  //   console.log("Failed", e);
  // }
};

createFungibleToken().catch((e) => {
  console.log(e);
});
