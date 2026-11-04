#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { explainTransaction } from './explain.ts';
import { formatExplanation } from './format.ts';

const USAGE = `sol-tx-explain — explain a Solana transaction before you sign it

Usage:
  sol-tx-explain <base64-or-base58-transaction>
  sol-tx-explain --file <path>
  sol-tx-explain -            (read the transaction from stdin)

Options:
  --json     print machine-readable JSON
  --help     show this help

Exit codes: 0 = no dangerous patterns, 2 = at least one DANGER finding, 1 = error.
The transaction is parsed locally. Nothing is sent over the network.`;

function main(argv: string[]): number {
  const args = argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(USAGE);
    return args.length === 0 ? 1 : 0;
  }
  const json = args.includes('--json');
  const rest = args.filter((a) => a !== '--json');

  let input: string;
  try {
    if (rest[0] === '--file') {
      if (!rest[1]) throw new Error('--file needs a path');
      input = readFileSync(rest[1], 'utf8');
    } else if (rest[0] === '-') {
      input = readFileSync(0, 'utf8');
    } else {
      input = rest[0];
    }
    const explanation = explainTransaction(input);
    console.log(json ? JSON.stringify(explanation, null, 2) : formatExplanation(explanation));
    return explanation.riskLevel === 'danger' ? 2 : 0;
  } catch (e) {
    console.error(`error: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
}

process.exitCode = main(process.argv);
