import { ethers } from "hardhat";
import output from "./info.json";
import fs from "fs";

async function main() {
  const toolFactory = await ethers.getContractFactory("BatchL2DataCreatedRollup");
  const toolContract = await toolFactory.deploy();
  await toolContract.waitForDeployment()
  const txPath = "./tx.json"
  const tx = await toolContract.generateInitializeTransaction(output.networkID, output.bridgeAddress, output.gasTokenAddress, output.gasTokenNetwork, output.gasTokenMetadata)
  await fs.writeFileSync(txPath, JSON.stringify(tx, null, 1))
}

main().then(() => {
    process.exit(0);
}, (err) => {
    console.log(err.message);
    console.log(err.stack);
    process.exit(1);
});