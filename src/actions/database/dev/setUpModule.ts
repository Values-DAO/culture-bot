import Safe from "@safe-global/protocol-kit";

const provider = "https://base-sepolia.g.alchemy.com/v2/sCRkeELOK2UImXTjQsv3HsfyvaQ1qlIV";

async function enableModule() {

  const protocolKit = await Safe.init({
    provider,
    signer: "3c1124e44dc11a86e6f476ececac615560445f689b41e0ad22acd67cc7337530",
    // signer: "bb8b55474f1d391ed9123f61473230a8084433e2bb94944a0a2a75fb33bd7dd0",
    safeAddress: "0x57cb6f115BC64187Bf8c77681dD89768F8863c5b",
    isL1SafeSingleton: true, // Optional
  });

  const moduleAddress = "0x43562C7441E903102ECCD00Dc761fc0283FA1D20";

  const safeTransaction = await protocolKit.createEnableModuleTx(
    moduleAddress,
  );
    
  const safeTransactionHash = await protocolKit.getTransactionHash(safeTransaction);
  console.log("Transaction Hash", safeTransactionHash);
  
  const txResponse = await protocolKit.approveTransactionHash(
    safeTransactionHash,
  );
  
  console.log("Transaction Response", txResponse);
  
  const safeTxHash = await protocolKit.executeTransaction(safeTransaction);
  console.log(safeTxHash);
  
  // const isEnabled = await protocolKit.isModuleEnabled(moduleAddress);
  // console.log(isEnabled);
  
  // const moduleAddresses = await protocolKit.getModules();
  // console.log(moduleAddresses);
}

enableModule()