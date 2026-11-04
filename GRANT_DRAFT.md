# Grant application draft: sol-tx-explainer (черновик, правит и отправляет владелец)

> Перед отправкой: проверьте актуальные условия на superteam.fun/earn/grants и solana.org/grants; суммы и сроки ниже — предложение, а не гарантия.

## One-liner
Open-source, offline, dependency-free tool and library that explains Solana transactions in plain language and warns about wallet-drainer patterns before the user signs.

## Problem
Users routinely sign transactions they cannot read. Drainer attacks (unlimited token approvals, account ownership changes, assigning accounts to malicious programs) rely on this. Existing explainers need network/RPC or live inside a single wallet.

## What is built already (MVP, working)
Parser for legacy and v0 transactions, decoders for System/Token/Token-2022/ATA/ComputeBudget/Memo, 8+ risk rules, CLI with exit codes, JSON output, 15 passing tests, zero dependencies.

## Why Solana specifically
The tool decodes Solana's own wire format: compact-u16 shortvec encoding, the message header with signer/readonly counts, v0 messages with address lookup tables, and the native programs (System, SPL Token, Token-2022, Compute Budget, ATA). The risk rules target Solana-specific attack patterns: unlimited SPL token delegation, token account owner changes via SetAuthority, and `Assign` of a signing account to a foreign program. Fee estimation follows Solana's model (5000 lamports per signature plus priority fee in micro-lamports per compute unit). None of this transfers to other chains.

## Milestones (proposal)
1. **M1 (2 weeks):** publish v0.1 on GitHub + npm, docs, CI. Add decoders for Stake, Vote, Address Lookup Table, BPF Loader (upgrade authority changes).
2. **M2 (3 weeks):** optional lookup-table resolution via user-supplied RPC; Jupiter/Raydium/Orca instruction decoding; test corpus from real public transactions.
3. **M3 (3 weeks):** browser build (single JS file) and a minimal web page where users paste a tx; rule documentation; false-positive review.

## Budget (proposal)
Request: **USD 3,000** (about 8 weeks, part-time). Maintenance commitment: bug fixes and rule updates for 6 months.

## Public-good rationale
MIT licensed, no telemetry, no token. Reusable by wallets, dApps, auditors and educators.

## Success metrics
GitHub stars/forks, npm downloads, number of rules with tests, integrations by third parties.

## Team
Applicant: <ваше имя / GitHub / X>. (Заполняется вами.)

## Links
Repo: <ссылка после публикации>
