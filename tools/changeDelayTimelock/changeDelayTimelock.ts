/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
import {expect} from "chai";
import path = require("path");
import fs = require("fs");

import * as dotenv from "dotenv";
dotenv.config({path: path.resolve(__dirname, "../../../.env")});
import {ethers, network, upgrades} from "hardhat";
import { PolygonZkEVMTimelock } from "../../typechain-types";

const parameters = require("./change_delay_timelock.json");
const pathOutputJson = path.resolve(__dirname, "./change_delay_output.json");

async function main() {

    const outputJson = {} as any;

    // Load provider
    let currentProvider = ethers.provider;
    if (parameters.multiplierGas || parameters.maxFeePerGas) {
        if (process.env.HARDHAT_NETWORK !== "hardhat") {
            currentProvider = ethers.getDefaultProvider(
                `https://${process.env.HARDHAT_NETWORK}.infura.io/v3/${process.env.INFURA_PROJECT_ID}`
            ) as any;
            if (parameters.maxPriorityFeePerGas && parameters.maxFeePerGas) {
                console.log(
                    `Hardcoded gas used: MaxPriority${parameters.maxPriorityFeePerGas} gwei, MaxFee${parameters.maxFeePerGas} gwei`
                );
                const FEE_DATA = new ethers.FeeData(
                    null,
                    ethers.parseUnits(parameters.maxFeePerGas, "gwei"),
                    ethers.parseUnits(parameters.maxPriorityFeePerGas, "gwei")
                );

                currentProvider.getFeeData = async () => FEE_DATA;
            } else {
                console.log("Multiplier gas used: ", parameters.multiplierGas);
                async function overrideFeeData() {
                    const feedata = await ethers.provider.getFeeData();
                    return new ethers.FeeData(
                        null,
                        ((feedata.maxFeePerGas as bigint) * BigInt(parameters.multiplierGas)) / 1000n,
                        ((feedata.maxPriorityFeePerGas as bigint) * BigInt(parameters.multiplierGas)) / 1000n
                    );
                }
                currentProvider.getFeeData = overrideFeeData;
            }
        }
    }

    // Load deployer
    let deployer;
    if (parameters.deployerPvtKey) {
        deployer = new ethers.Wallet(parameters.deployerPvtKey, currentProvider);
    } else if (process.env.MNEMONIC) {
        deployer = ethers.HDNodeWallet.fromMnemonic(
            ethers.Mnemonic.fromPhrase(process.env.MNEMONIC),
            "m/44'/60'/0'/0/0"
        ).connect(currentProvider);
    } else {
        [deployer] = await ethers.getSigners();
    }
    

    const timelockContractFactory = await ethers.getContractFactory("PolygonZkEVMTimelock", deployer);
    const timelockContract = (await timelockContractFactory.attach(
        parameters.timelockContractAddress
    )) as PolygonZkEVMTimelock;

    console.log("#######################\n");
    console.log("timelockContract address: ", timelockContract.target)
    console.log("#######################\n");

    const timelockDelay = parameters.timeLockDelay ? parameters.timeLockDelay : Number(await timelockContract.getMinDelay());
    const salt = parameters.timelockSalt || ethers.ZeroHash;
    const predecessor = parameters.predecessor || ethers.ZeroHash;

    const operation = genOperation(
        parameters.timelockContractAddress,
        0, // value
        timelockContract.interface.encodeFunctionData(
            'updateDelay',
            [parameters.newMinDelay],
        ),
        predecessor, // predecessor
        salt // salt
    );

    // Schedule operation
    const scheduleData = timelockContractFactory.interface.encodeFunctionData("schedule", [
        operation.target,
        operation.value,
        operation.data,
        operation.predecessor,
        operation.salt,
        timelockDelay,
    ]);

    // Execute operation
    const executeData = timelockContractFactory.interface.encodeFunctionData("execute", [
        operation.target,
        operation.value,
        operation.data,
        operation.predecessor,
        operation.salt,
    ]);

    console.log("timelockDelay: ", timelockDelay)
    console.log({scheduleData});
    console.log({executeData});
   
    outputJson.scheduleData = scheduleData;
    outputJson.executeData = executeData;
    outputJson.minDelay = timelockDelay;
    outputJson.functionData = {
        function: 'updateDelay',
        parameters: parameters.newMinDelay
    }

    if(parameters.sendSchedule) {
        const txScheduled = await timelockContract.schedule(
            operation.target,
            operation.value,
            operation.data,
            operation.predecessor,
            operation.salt,
            timelockDelay,
        );
        await txScheduled.wait();
        console.log("SEND SCHEDULE")
    }
    if (parameters.sendSchedule && parameters.sendExecute) {
        await wait(timelockDelay);
    }
    if(parameters.sendExecute) {
        const txExecute = await timelockContract.execute(
            operation.target,
            operation.value,
            operation.data,
            operation.predecessor,
            operation.salt
        );
        await txExecute.wait();
        console.log("SEND EXECUTE")
        console.log("newMinDelay: ", await timelockContract.getMinDelay())
    }

    await fs.writeFileSync(pathOutputJson, JSON.stringify(outputJson, null, 1));
}

// OZ test functions
function genOperation(target: any, value: any, data: any, predecessor: any, salt: any) {
    const abiEncoded = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint256", "bytes", "uint256", "bytes32"],
        [target, value, data, predecessor, salt]
    );
    const id = ethers.keccak256(abiEncoded);
    return {
        id,
        target,
        value,
        data,
        predecessor,
        salt,
    };
}

function wait(seconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
