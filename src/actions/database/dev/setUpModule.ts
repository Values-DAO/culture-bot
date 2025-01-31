import { ethers } from "ethers";
import EthersAdapter from "@safe-global/protocol-kit";
import Safe from "@safe-global/protocol-kit";
import { config } from "../../../config/config";

// Create provider
const provider = new ethers.JsonRpcProvider(config.baseSepoliaRpc);

// Create signers from private keys
const owner1 = new ethers.Wallet(
  "OWNER_1_PRIVATE_KEY", // Replace with first owner's private key
  provider
);

const owner2 = new ethers.Wallet(
  "OWNER_2_PRIVATE_KEY", // Replace with second owner's private key
  provider
);

async function enableModule() {
  // Create ethAdapter instances
  const ethAdapter1 = new EthersAdapter(); // Initialize without arguments
  await ethAdapter1.init({ ethers, signerOrProvider: owner1 }); // Initialize separately

  const ethAdapter2 = new EthersAdapter();
  await ethAdapter2.init({ ethers, signerOrProvider: owner2 });

  // Initialize the Safe instance with first owner
  const safeSdk1 = await Safe.create({
    ethAdapter: ethAdapter1,
    safeAddress: "0x57cb6f115BC64187Bf8c77681dD89768F8863c5b",
  });

  const moduleAddress = "0x43a11F1bF8036B5564F81A29357a14D5E01E9269";

  // Create the enable module transaction
  const safeTransaction = await safeSdk1.createEnableModuleTx(moduleAddress);

  // Sign with first owner
  const signedSafeTransaction = await safeSdk1.signTransaction(safeTransaction);
  console.log("Signed by owner 1");

  // Initialize second owner's SDK instance
  const safeSdk2 = await Safe.create({
    ethAdapter: ethAdapter2,
    safeAddress: "0x57cb6f115BC64187Bf8c77681dD89768F8863c5b",
  });

  // Sign with second owner
  const fullySignedTx = await safeSdk2.signTransaction(signedSafeTransaction);
  console.log("Signed by owner 2");

  try {
    // Execute the transaction
    const executeTxResponse = await safeSdk1.executeTransaction(fullySignedTx);
    const transactionResponse = await executeTxResponse.transactionResponse;
    console.log("Transaction hash:", transactionResponse?.hash);

    // Wait for transaction confirmation
    await transactionResponse?.wait();
    console.log("Transaction confirmed");

    return transactionResponse;
  } catch (error) {
    console.error("Error executing transaction:", error);
    throw error;
  }
}

// Execute the function
enableModule()
  .then(() => {
    console.log("Module enabled successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
