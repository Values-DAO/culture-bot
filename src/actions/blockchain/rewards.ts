import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import { type IWallet } from "../../models/wallet";
import { logger } from "../../utils/logger";
import { ethers } from "ethers";

interface MerkleProof {
  inputs: [string, string];
  proof: string[];
  root: string;
  leaf: string;
}

export const generateMerkleTreeAndProofs = async (
  wallets: { wallet: IWallet; frequency: number }[],
  amountUnit: bigint
): Promise<{ root: string; proofs: MerkleProof[] }> => {
  try {
    const leaves = formatDataForMerkleTree(wallets, amountUnit);

    logger.info(`[BOT]: Merkle tree leaves: `);
    console.log(JSON.stringify(leaves, null, 2));

    const tree = createMerkleTree(leaves);
    const root = tree.root;

    const proofs = generateProofsForWallets(tree, root, wallets, amountUnit);

    logger.info(`[BOT]: Generated Merkle root: ${root}`);
    logger.info(`[BOT]: Generated proofs:`);
    console.log(JSON.stringify(proofs, null, 2));

    return { root, proofs };
  } catch (error) {
    logger.error(`[BOT]: Error generating Merkle tree and proofs: ${error}`);
    throw new Error(`Failed to generate Merkle tree and proofs: ${error}`);
  }
};

// * Formats the data for the Merkle tree
export const formatDataForMerkleTree = (
  wallets: {wallet: IWallet, frequency: number}[],
  amountUnit: bigint
): [string, string][] => {
  return wallets.map((wallet) => [wallet.wallet.publicKey, (amountUnit * BigInt(wallet.frequency)).toString()]);
};

// * Creates a Merkle tree from the leaves using the OpenZeppelin Merkle tree library
export const createMerkleTree = (leaves: [string, string][]): StandardMerkleTree<[string, string]> => {
  return StandardMerkleTree.of(leaves, ["address", "uint256"]);
};

// * Generates Merkle proofs for the wallets
export const generateProofsForWallets = (
  tree: StandardMerkleTree<[string, string]>,
  root: string,
  wallets: { wallet: IWallet; frequency: number }[],
  amountUnit: bigint
): MerkleProof[] => {
  const proofs = wallets.map((wallet, index) => {
    const proof = tree.getProof(index);
    const inputs: [string, string] = [wallet.wallet.publicKey, (BigInt(wallet.frequency) * amountUnit).toString()];

    // Match the contract's leaf generation
    const encodedLeaf = ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "uint256"],
      [wallet.wallet.publicKey, (BigInt(wallet.frequency) * amountUnit).toString()]
    );
    
    const innerHash = ethers.keccak256(encodedLeaf);
    const leaf = ethers.keccak256(ethers.concat([innerHash]));

    return {
      inputs,
      proof,
      root,
      leaf,
    };
  });

  return proofs;
};