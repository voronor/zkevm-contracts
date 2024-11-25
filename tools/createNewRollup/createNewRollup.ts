/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
import {expect} from "chai";
import path = require("path");
import fs = require("fs");

import * as dotenv from "dotenv";
dotenv.config({path: path.resolve(__dirname, "../../.env")});
import {ethers, upgrades} from "hardhat";
import {processorUtils, Constants} from "@0xpolygonhermez/zkevm-commonjs";

const createRollupParameters = require("./create_new_rollup.json");

import updateVanillaGenesis from "../../deployment/v2/utils/updateVanillaGenesis";
const pathOutputJson = path.join(__dirname, "./create_new_rollup_output.json");

import {
    PolygonRollupManager,
    PolygonZkEVMEtrog,
    PolygonZkEVMBridgeV2,
    PolygonValidiumEtrog,
    PolygonPessimisticConsensus,
} from "../../typechain-types";

async function main() {
    const outputJson = {} as any;
    /*
     * Check deploy parameters
     * Check that every necessary parameter is fulfilled
     */
    const mandatoryDeploymentParameters = [
        "trustedSequencerURL",
        "networkName",
        "trustedSequencer",
        "chainID",
        "rollupAdminAddress",
        "consensusContractName",
        "rollupManagerAddress",
        "rollupTypeId",
        "gasTokenAddress",
    ];

    for (const parameterName of mandatoryDeploymentParameters) {
        if (createRollupParameters[parameterName] === undefined || createRollupParameters[parameterName] === "") {
            throw new Error(`Missing parameter: ${parameterName}`);
        }
    }

    const {
        trustedSequencerURL,
        networkName,
        trustedSequencer,
        chainID,
        rollupAdminAddress,
        consensusContractName,
        isVanillaClient,
        sovereignParams,
    } = createRollupParameters;

    // Check supported consensus is correct
    const supportedConsensus = ["PolygonZkEVMEtrog", "PolygonValidiumEtrog", "PolygonPessimisticConsensus"];

    if (!supportedConsensus.includes(consensusContractName)) {
        throw new Error(
            `Consensus contract ${consensusContractName} not supported, supported contracts are: ${supportedConsensus}`
        );
    }

    // Check consensus compatibility
    if (isVanillaClient) {
        if (consensusContractName !== "PolygonPessimisticConsensus") {
            throw new Error(`Vanilla client only supports PolygonPessimisticConsensus`);
        }
        // Check sovereign params
        const mandatorySovereignParams = [
            "bridgeManager",
            "sovereignWETHAddress",
            "sovereignWETHAddressIsNotMintable",
            "globalExitRootUpdater",
            "globalExitRootRemover",
        ];
        for (const parameterName of mandatorySovereignParams) {
            if (typeof sovereignParams[parameterName] === undefined || sovereignParams[parameterName] === "") {
                throw new Error(`Missing sovereign parameter: ${parameterName}`);
            }
        }
    }

    // Load provider
    let currentProvider = ethers.provider;
    if (createRollupParameters.multiplierGas || createRollupParameters.maxFeePerGas) {
        if (process.env.HARDHAT_NETWORK !== "hardhat") {
            currentProvider = ethers.getDefaultProvider(
                `https://${process.env.HARDHAT_NETWORK}.infura.io/v3/${process.env.INFURA_PROJECT_ID}`
            ) as any;
            if (createRollupParameters.maxPriorityFeePerGas && createRollupParameters.maxFeePerGas) {
                console.log(
                    `Hardcoded gas used: MaxPriority${createRollupParameters.maxPriorityFeePerGas} gwei, MaxFee${createRollupParameters.maxFeePerGas} gwei`
                );
                const FEE_DATA = new ethers.FeeData(
                    null,
                    ethers.parseUnits(createRollupParameters.maxFeePerGas, "gwei"),
                    ethers.parseUnits(createRollupParameters.maxPriorityFeePerGas, "gwei")
                );

                currentProvider.getFeeData = async () => FEE_DATA;
            } else {
                console.log("Multiplier gas used: ", createRollupParameters.multiplierGas);
                async function overrideFeeData() {
                    const feedata = await ethers.provider.getFeeData();
                    return new ethers.FeeData(
                        null,
                        ((feedata.maxFeePerGas as bigint) * BigInt(createRollupParameters.multiplierGas)) / 1000n,
                        ((feedata.maxPriorityFeePerGas as bigint) * BigInt(createRollupParameters.multiplierGas)) /
                            1000n
                    );
                }
                currentProvider.getFeeData = overrideFeeData;
            }
        }
    }

    // Load deployer
    let deployer;
    if (createRollupParameters.deployerPvtKey) {
        deployer = new ethers.Wallet(createRollupParameters.deployerPvtKey, currentProvider);
    } else if (process.env.MNEMONIC) {
        deployer = ethers.HDNodeWallet.fromMnemonic(
            ethers.Mnemonic.fromPhrase(process.env.MNEMONIC),
            "m/44'/60'/0'/0/0"
        ).connect(currentProvider);
    } else {
        [deployer] = await ethers.getSigners();
    }

    // Load Rollup manager
    const PolygonRollupManagerFactory = await ethers.getContractFactory("PolygonRollupManager", deployer);
    const rollupManagerContract = PolygonRollupManagerFactory.attach(
        createRollupParameters.rollupManagerAddress
    ) as PolygonRollupManager;

    // Load global exit root manager
    const globalExitRootManagerFactory = await ethers.getContractFactory("PolygonZkEVMGlobalExitRootV2", deployer);
    const globalExitRootManagerAddress = await rollupManagerContract.globalExitRootManager();
    const globalExitRootManagerContract = globalExitRootManagerFactory.attach(
        globalExitRootManagerAddress
    ) as PolygonRollupManager;

    // Check if the deployer has right to deploy new rollups from rollupManager contract
    const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
    if ((await rollupManagerContract.hasRole(DEFAULT_ADMIN_ROLE, deployer.address)) == false) {
        throw new Error(
            `Deployer does not have admin role. Use the test flag on deploy_parameters if this is a test deployment`
        );
    }

    // Check chainID
    let rollupID = await rollupManagerContract.chainIDToRollupID(chainID);
    if (Number(rollupID) !== 0) {
        throw new Error(`Rollup with chainID ${chainID} already exists`);
    }
    // Check rollupTypeId
    const rollupType = await rollupManagerContract.rollupTypeMap(createRollupParameters.rollupTypeId);
    const consensusContractAddress = rollupType[0];
    const verifierType = Number(rollupType[3]);
    if (consensusContractName === "PolygonPessimisticConsensus" && verifierType !== 1) {
        throw new Error(`Verifier type should be 1 for ${consensusContractName}`);
    }
    if (consensusContractName !== "PolygonPessimisticConsensus" && verifierType !== 0) {
        throw new Error(`Verifier type should be 0 for ${consensusContractName}`);
    }

    // Grant role CREATE_ROLLUP_ROLE to deployer
    const CREATE_ROLLUP_ROLE = ethers.id("CREATE_ROLLUP_ROLE");
    if ((await rollupManagerContract.hasRole(CREATE_ROLLUP_ROLE, deployer.address)) == false)
        await rollupManagerContract.grantRole(CREATE_ROLLUP_ROLE, deployer.address);

    // Get rollup address deterministically
    const nonce = await currentProvider.getTransactionCount(rollupManagerContract.target);
    const createdRollupAddress = ethers.getCreateAddress({
        from: rollupManagerContract.target as string,
        nonce: nonce,
    });

    // Create new rollup
    const txDeployRollup = await rollupManagerContract.createNewRollup(
        createRollupParameters.rollupTypeId,
        chainID,
        rollupAdminAddress,
        trustedSequencer,
        createRollupParameters.gasTokenAddress,
        trustedSequencerURL,
        networkName
    );
    outputJson.gasTokenAddress = createRollupParameters.gasTokenAddress;

    const receipt = (await txDeployRollup.wait()) as any;
    const blockDeploymentRollup = await receipt?.getBlock();
    const timestampReceipt = blockDeploymentRollup.timestamp;

    console.log("#######################\n");
    console.log(`Created new ${consensusContractName} Rollup:`, createdRollupAddress);

    // Update rollupId
    rollupID = await rollupManagerContract.chainIDToRollupID(chainID);

    // If is a validium, data committee must be set up
    const polygonConsensusFactory = (await ethers.getContractFactory(consensusContractName, deployer)) as any;
    const dataAvailabilityProtocol = createRollupParameters.dataAvailabilityProtocol || "PolygonDataCommittee";
    if (consensusContractName.includes("PolygonValidiumEtrog") && dataAvailabilityProtocol === "PolygonDataCommittee") {
        // deploy data committee
        const PolygonDataCommitteeContract = (await ethers.getContractFactory("PolygonDataCommittee", deployer)) as any;
        let polygonDataCommittee = await upgrades.deployProxy(PolygonDataCommitteeContract, [], {
            unsafeAllow: ["constructor"],
        });
        await polygonDataCommittee?.waitForDeployment();

        // Load data committee
        const PolygonValidiumContract = (await polygonConsensusFactory.attach(
            createdRollupAddress
        )) as PolygonValidiumEtrog;
        // add data committee to the consensus contract
        if ((await PolygonValidiumContract.admin()) == deployer.address) {
            await (
                await PolygonValidiumContract.setDataAvailabilityProtocol(polygonDataCommittee?.target as any)
            ).wait();

            // // Setup data committee to 0
            // await (await polygonDataCommittee?.setupCommittee(0, [], "0x")).wait();
        } else {
            await (await polygonDataCommittee?.transferOwnership(rollupAdminAddress)).wait();
        }

        outputJson.polygonDataCommitteeAddress = polygonDataCommittee?.target;
    }

    // Assert admin address
    expect(await upgrades.erc1967.getAdminAddress(createdRollupAddress)).to.be.equal(rollupManagerContract.target);
    expect(await upgrades.erc1967.getImplementationAddress(createdRollupAddress)).to.be.equal(consensusContractAddress);

    // Search added global exit root on the logs
    let globalExitRoot;
    for (const log of receipt?.logs) {
        if (log.address == createdRollupAddress) {
            const parsedLog = polygonConsensusFactory.interface.parseLog(log);
            if (parsedLog != null && parsedLog.name == "InitialSequenceBatches") {
                globalExitRoot = parsedLog.args.lastGlobalExitRoot;
            }
        }
    }

    let gasTokenAddress, gasTokenNetwork, gasTokenMetadata;

    // Get bridge instance
    const bridgeFactory = await ethers.getContractFactory("PolygonZkEVMBridgeV2", deployer);
    const bridgeContractAddress = await rollupManagerContract.bridgeAddress();
    const rollupBridgeContract = bridgeFactory.attach(bridgeContractAddress) as PolygonZkEVMBridgeV2;
    if (
        ethers.isAddress(createRollupParameters.gasTokenAddress) &&
        createRollupParameters.gasTokenAddress !== ethers.ZeroAddress
    ) {
        // Get token metadata
        gasTokenMetadata = await rollupBridgeContract.getTokenMetadata(createRollupParameters.gasTokenAddress);
        outputJson.gasTokenMetadata = gasTokenMetadata;
        // If gas token metadata includes `0x124e4f545f56414c49445f454e434f44494e47 (NOT_VALID_ENCODING)` means there is no erc20 token deployed at the selected gas token network
        if (gasTokenMetadata.includes("124e4f545f56414c49445f454e434f44494e47")) {
            throw new Error(
                `Invalid gas token address, no ERC20 token deployed at the selected gas token network ${createRollupParameters.gasTokenAddress}`
            );
        }
        const wrappedData = await rollupBridgeContract.wrappedTokenToTokenInfo(createRollupParameters.gasTokenAddress);
        if (wrappedData.originNetwork != 0n) {
            // Wrapped token
            gasTokenAddress = wrappedData.originTokenAddress;
            gasTokenNetwork = wrappedData.originNetwork;
        } else {
            // Mainnet token
            gasTokenAddress = createRollupParameters.gasTokenAddress;
            gasTokenNetwork = 0n;
        }
    } else {
        gasTokenAddress = ethers.ZeroAddress;
        gasTokenNetwork = 0;
        gasTokenMetadata = "0x";
    }

    let batchData = "";
    // If is vanilla client, replace genesis by sovereign contracts, else, inject initialization batch
    if (isVanillaClient) {
        const pathGenesis = path.join(__dirname, "./genesis.json");
        let genesis = require(pathGenesis);
        const initializeParams = {
            rollupID: rollupID,
            gasTokenAddress,
            gasTokenNetwork,
            polygonRollupManager: ethers.ZeroAddress,
            gasTokenMetadata,
            bridgeManager: sovereignParams.bridgeManager,
            sovereignWETHAddress: sovereignParams.sovereignWETHAddress,
            sovereignWETHAddressIsNotMintable: sovereignParams.sovereignWETHAddressIsNotMintable,
            globalExitRootUpdater: sovereignParams.globalExitRootUpdater,
            globalExitRootRemover: sovereignParams.globalExitRootRemover,
        };
        genesis = await updateVanillaGenesis(genesis, chainID, initializeParams);
        // Add weth address to deployment output if gas token address is provided and sovereignWETHAddress is not provided
        if (
            gasTokenAddress !== ethers.ZeroAddress &&
            ethers.isAddress(gasTokenAddress) &&
            (sovereignParams.sovereignWETHAddress === ethers.ZeroAddress ||
                !ethers.isAddress(sovereignParams.sovereignWETHAddress))
        ) {
            const wethObject = genesis.genesis.find(function (obj: {contractName: string}) {
                return obj.contractName == "WETH";
            });
            outputJson.WETHAddress = wethObject.address;
        }
        fs.writeFileSync(pathGenesis, JSON.stringify(genesis, null, 1));
    } else {
        if (consensusContractName === "PolygonPessimisticConsensus") {
            // Add the first batch of the created rollup
            const newPessimisticRollup = (await polygonConsensusFactory.attach(
                createdRollupAddress
            )) as PolygonPessimisticConsensus;

            // Get last GER
            const lastGER = await globalExitRootManagerContract.getLastGlobalExitRoot();

            const dataInjectedTx = await rollupBridgeContract.interface.encodeFunctionData("initialize", [
                rollupID,
                gasTokenAddress,
                gasTokenNetwork,
                Constants.ADDRESS_GLOBAL_EXIT_ROOT_MANAGER_L2, // Global exit root address on L2
                ethers.ZeroAddress, // Rollup manager on L2 does not exist
                gasTokenMetadata as any,
            ]);

            // check maximum length is 65535
            if ((dataInjectedTx.length - 2) / 2 > 0xffff) {
                // throw error
                throw new Error(`HugeTokenMetadataNotSupported`);
            }

            const injectedTx = {
                type: 0, // force ethers to parse it as a legacy transaction
                chainId: 0, // force ethers to parse it as a pre-EIP155 transaction
                to: await newPessimisticRollup.bridgeAddress(),
                value: 0,
                gasPrice: 0,
                gasLimit: 30000000,
                nonce: 0,
                data: dataInjectedTx,
                signature: {
                    v: "0x1b",
                    r: "0x00000000000000000000000000000000000000000000000000000005ca1ab1e0",
                    s: "0x000000000000000000000000000000000000000000000000000000005ca1ab1e",
                },
            };

            // serialize transactions
            const txObject = ethers.Transaction.from(injectedTx);

            const customData = processorUtils.rawTxToCustomRawTx(txObject.serialized);
            batchData = {
                batchL2Data: customData,
                globalExitRoot: lastGER,
                timestamp: blockDeploymentRollup.timestamp,
                sequencer: trustedSequencer,
                l1BlockNumber: blockDeploymentRollup.number,
                l1BlockHash: blockDeploymentRollup.hash,
                l1ParentHash: blockDeploymentRollup.parentHash,
            } as any;
        } else {
            // Add the first batch of the created rollup
            const newRollupContract = (await polygonConsensusFactory.attach(createdRollupAddress)) as PolygonZkEVMEtrog;
            batchData = {
                batchL2Data: await newRollupContract.generateInitializeTransaction(
                    Number(rollupID),
                    gasTokenAddress,
                    gasTokenNetwork,
                    gasTokenMetadata as any
                ),
                globalExitRoot: globalExitRoot,
                timestamp: timestampReceipt,
                sequencer: trustedSequencer,
            } as any;
        }
    }
    outputJson.firstBatchData = batchData;
    outputJson.genesis = rollupType.genesis;
    outputJson.createRollupBlockNumber = blockDeploymentRollup.number;
    outputJson.rollupAddress = createdRollupAddress;
    outputJson.consensusContract = consensusContractName;
    outputJson.rollupID = Number(rollupID);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
