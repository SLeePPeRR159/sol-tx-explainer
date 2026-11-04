# sol-tx-explainer

Explain a Solana transaction in plain language, **offline**, with zero dependencies, and flag patterns commonly used by wallet drainers.

Paste a base64/base58 serialized transaction (the thing a dApp asks your wallet to sign) and see what it really does before you sign.

```
$ node src/cli.ts <base64-or-base58-tx>
Transaction (legacy) — overall risk: DANGER
  2. SPL Token: allow CktR…Ezy8 to spend up to UNLIMITED from GgBa…zLHq
  [DANGER] This gives CktR…Ezy8 permission to spend an UNLIMITED amount of tokens...
```

## Why
Most users sign transactions they cannot read. This tool decodes the wire format locally (no RPC, no network, nothing leaves your machine) and turns it into sentences.

## What it decodes
- Legacy and v0 transactions (address lookup tables are shown as unresolved, never guessed)
- System Program, SPL Token and Token-2022, Associated Token Account, Compute Budget, Memo
- Recognizes (without decoding) Stake, Vote, Address Lookup Table, BPF Upgradeable Loader, Jupiter v6

## What it flags
| Level | Examples |
|---|---|
| danger | unlimited token approval; token account owner change; signing account assigned to another program; priority fee ≥ 0.1 SOL |
| caution | limited approval; authority removal; closing an account to a third party; unknown program; priority fee ≥ 0.01 SOL |
| info | unresolved lookup tables |

## Usage
Requires Node.js ≥ 22.18 (runs TypeScript directly, no build step).

```
node src/cli.ts <tx>            # explain
node src/cli.ts --file tx.txt   # from file
cat tx.txt | node src/cli.ts -  # from stdin
node src/cli.ts <tx> --json     # machine-readable
```
Exit codes: 0 ok/caution, 2 danger, 1 error (useful in CI or scripts).

As a library: `import { explainTransaction } from './src/index.ts'`.

## Tests
`npm test` (or `node --test test/*.test.ts`). 15 tests cover parsing, each risk rule, fees, v0, malformed input and the CLI.

## Limitations (honest)
It cannot prove a transaction is safe. Unknown programs are only flagged, not analyzed. Lookup-table accounts cannot be resolved offline. Fee numbers are estimates. Not financial advice.

## License
MIT
