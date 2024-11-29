# Create new Rollup

Script to call `createNewRollup` function.

-   This script needs of a genesis as input only if we are trying to deploy a sovereign chain. The genesis will only be updated in case of trying to deploy a sovereign chain. In this case, this new sovereign genesis will be appended at the output file

## Install

```
npm i
```

## Setup

-   Config file
    - `type`: Specify the type of rollup creation, only available:
        - EOA: If creating the rollup from a wallet, the script will execute the creation of the rollup on the specified network
        - Multisig: If creating the rollup from a multisig, the script will output the calldata of the transaction to execute for creating the rollup
        - Timelock: If creating the rollup through a timelock, the script will output the execute and schedule data to send to the timelock contract
    -   `trustedSequencerURL`: Sequencer URL of the new created rollup
    -   `networkName`: Network name of the new created rollup
    -   `trustedSequencer`: Sequencer address of the new created rollup
    -   `chainID`: ChainID of the rollup, must be a new one, can not have more than 32 bits
    -   `rollupAdminAddress`: Admin address of the new created rollup
    -   `consensusContractName`: select between consensus contract. Supported: `["PolygonZkEVMEtrog", "PolygonValidiumEtrog", "PolygonPessimisticConsensus"]`. This is the name of the consensus of the rollupType of the rollup to be created
    -   `gasTokenAddress`: Address of the native gas token of the rollup, zero if ether
    -   `deployerPvtKey`: Not mandatory, used to deploy from specific wallet
    -   `maxFeePerGas(optional)`: string, Set `maxFeePerGas`, must define as well `maxPriorityFeePerGas` to use it
    -   `maxPriorityFeePerGas(optional)`: string, Set `maxPriorityFeePerGas`, must define as well `maxFeePerGas` to use it
    -   `multiplierGas(optional)`: number, Gas multiplier with 3 decimals. If `maxFeePerGas` and `maxPriorityFeePerGas` are set, this will not take effect
    - `timelockDelay(optional)`: timelock delay, only required on timelock type
    - `timelockSalt(optional)`: timelock salt, only required on timelock type
    -   `rollupManagerAddress`: Address of deployed rollupManager contract
    -   `isVanillaClient`: Flag for vanilla/sovereign clients handling
    -   `sovereignParams`:
        -   `bridgeManager`: bridge manager address
        -   `sovereignWETHAddress`: sovereign WETH address
        -   `sovereignWETHAddressIsNotMintable`: Flag to indicate if the wrapped ETH is not mintable
        -   `globalExitRootUpdater`: Address of globalExitRootUpdater for sovereign chains
        -   `globalExitRootRemover`: Address of globalExitRootRemover for sovereign chains

## Usage

> All commands are done from root repository.

### Call 'createNewRollup' from an EOA

-   Copy configuration files:

```
cp ./tools/createNewRollup/create_new_rollup.json.example ./tools/createNewRollup/create_new_rollup.json
```

-   Copy genesis file (only for sovereign chains)

```
cp ./tools/createNewRollup/genesis.json.example ./tools/createNewRollup/genesis.json
```

-   Set your parameters
-   Run tool:

```
npx hardhat run ./tools/createNewRollup/createNewRollup.ts --network sepolia
```

Recommendation: run the tool from the interactive rollup manager cli -> https://github.com/0xPolygonHermez/rollup-manager-cli
