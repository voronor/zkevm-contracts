# Create new Rollup

Script to call `createNewRollup` function.

-   This script needs of a genesis as input only if we are trying to deploy a sovereign chain. The genesis will only be updated in case of trying to deploy a sovereign chain. In this case, a new `genesis_sovereign.json` will be created.

## Install

```
npm i
```

## Setup

-   Config file
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
    - `timelockDelay`: timelock delay, if is zero, no timelock is executed, direct deploy
    - `timelockSalt(optional)`: timelock salt
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
