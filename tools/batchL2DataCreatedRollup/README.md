# Generate BatchL2DataCreatedRollup
1. Update `input.json`:
```
{
    "rpc": "http://127.0.0.1:32804",
    "networkID": 0,
    "bridgeAddress": "0x9b28F436039654F8b948dd32599032F684899cF0",
    "gasTokenAddress": "0x0000000000000000000000000000000000000000",
    "gasTokenNetwork": 0
}
```
2. Run `./generateBatchL2DataCreatedRollup.sh`:
- Get information from network with `getData.ts` --> write `info.json`
```
npx hardhat run getData.ts --network zkevmDevnet
```
- Generate tx with `batchL2DataCreatedRollup.ts` --> write `tx.json`
```
npx hardhat run batchL2DataCreatedRollup.ts
```
3. Output: `tx.json`