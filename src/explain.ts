import { base58Decode } from './base58.ts';
import { decodeInstruction } from './decode.ts';
import { parseTransaction } from './parse.ts';
import type { ParsedTransaction } from './parse.ts';
import { COMPUTE_BUDGET_PROGRAM, KNOWN_PROGRAMS, describeKey, shortKey } from './programs.ts';
import { ParseError } from './reader.ts';
import type { AccountRef, Explanation, ExplainedInstruction, Finding } from './types.ts';
import { formatSol, readU32, readU64 } from './units.ts';

const LAMPORTS_PER_SIGNATURE = 5000n;
const DEFAULT_UNITS_PER_INSTRUCTION = 200_000n;
const MAX_UNITS = 1_400_000n;
const PRIORITY_FEE_WARN = 10_000_000n; // 0.01 SOL
const PRIORITY_FEE_DANGER = 100_000_000n; // 0.1 SOL

function fromBase64(text: string): Uint8Array {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(text)) throw new ParseError('not base64');
  return new Uint8Array(Buffer.from(text, 'base64'));
}

/** Parse a transaction given as a base64 or base58 string (the encodings wallets and RPC nodes use). */
export function parseTransactionString(input: string): ParsedTransaction {
  const text = input.trim().replace(/\s+/g, '');
  if (text.length === 0) throw new ParseError('empty input');
  const errors: string[] = [];
  for (const decode of [fromBase64, base58Decode]) {
    try {
      return parseTransaction(decode(text));
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  throw new ParseError(`input is not a valid base64 or base58 transaction (${errors.join('; ')})`);
}

function rank(s: Finding['severity']): number {
  return s === 'danger' ? 0 : s === 'warn' ? 1 : 2;
}

export function explainTransaction(input: Uint8Array | string | ParsedTransaction): Explanation {
  const tx =
    typeof input === 'string'
      ? parseTransactionString(input)
      : input instanceof Uint8Array
        ? parseTransaction(input)
        : input;

  const staticCount = tx.accountKeys.length;
  const writableLookupTotal = tx.lookups.reduce((n, l) => n + l.writableIndexes.length, 0);

  const resolve = (index: number): AccountRef => {
    if (index < staticCount) {
      const key = tx.accountKeys[index];
      const signer = index < tx.numRequiredSignatures;
      const writable = signer
        ? index < tx.numRequiredSignatures - tx.numReadonlySigned
        : index < staticCount - tx.numReadonlyUnsigned;
      return { key, label: describeKey(key), signer, writable, unresolved: false };
    }
    let i = index - staticCount;
    const writable = i < writableLookupTotal;
    if (!writable) i -= writableLookupTotal;
    for (const l of tx.lookups) {
      const list = writable ? l.writableIndexes : l.readonlyIndexes;
      if (i < list.length) {
        return {
          key: `lookup:${l.accountKey}#${list[i]}`,
          label: `account #${list[i]} of lookup table ${shortKey(l.accountKey)}`,
          signer: false,
          writable,
          unresolved: true,
        };
      }
      i -= list.length;
    }
    throw new ParseError('invalid account index');
  };

  const findings: Finding[] = [];
  const instructions: ExplainedInstruction[] = [];
  let unresolvedCount = 0;

  tx.instructions.forEach((ix, index) => {
    const programId = tx.accountKeys[ix.programIdIndex];
    const accounts = ix.accountIndexes.map(resolve);
    unresolvedCount += accounts.filter((a) => a.unresolved).length;
    const known = KNOWN_PROGRAMS[programId];
    const result = decodeInstruction({ programId, accounts, data: ix.data });

    if (result) {
      instructions.push({
        index,
        programId,
        programName: known?.name ?? shortKey(programId),
        known: true,
        decoded: result.decoded,
        kind: result.kind,
        summary: result.summary,
        accounts,
        dataLength: ix.data.length,
      });
      for (const f of result.findings) findings.push({ ...f, instructionIndex: index });
    } else if (known) {
      instructions.push({
        index,
        programId,
        programName: known.name,
        known: true,
        decoded: false,
        kind: 'known-program',
        summary: `Call to ${known.name} (${accounts.length} accounts, ${ix.data.length} bytes of data) — details not explained by this tool`,
        accounts,
        dataLength: ix.data.length,
      });
      findings.push({
        severity: 'info',
        code: 'undecoded-program',
        message: `${known.name} is recognised but its instruction is not explained by this tool.`,
        instructionIndex: index,
      });
    } else {
      instructions.push({
        index,
        programId,
        programName: shortKey(programId),
        known: false,
        decoded: false,
        kind: 'unknown-program',
        summary: `Call to unknown program ${programId} (${accounts.length} accounts, ${ix.data.length} bytes of data)`,
        accounts,
        dataLength: ix.data.length,
      });
      findings.push({
        severity: 'warn',
        code: 'unknown-program',
        message: `Program ${programId} is not recognised, so its effects cannot be explained. Only sign if you trust the app that built this transaction.`,
        instructionIndex: index,
      });
    }
  });

  // Fees: base fee per signature plus priority fee (price x requested compute units).
  let priceMicroLamports = 0n;
  let limitSet: bigint | null = null;
  let nonBudgetInstructions = 0n;
  for (const ix of tx.instructions) {
    if (tx.accountKeys[ix.programIdIndex] === COMPUTE_BUDGET_PROGRAM) {
      try {
        if (ix.data[0] === 3) priceMicroLamports = readU64(ix.data, 1);
        if (ix.data[0] === 2) limitSet = BigInt(readU32(ix.data, 1));
      } catch {
        /* malformed budget instruction is reported by the decoder */
      }
    } else {
      nonBudgetInstructions += 1n;
    }
  }
  const defaultLimit = nonBudgetInstructions * DEFAULT_UNITS_PER_INSTRUCTION;
  const units = limitSet ?? (defaultLimit > MAX_UNITS ? MAX_UNITS : defaultLimit);
  const baseFee = LAMPORTS_PER_SIGNATURE * BigInt(tx.numRequiredSignatures);
  const priorityFee = (priceMicroLamports * units + 999_999n) / 1_000_000n;

  if (priorityFee >= PRIORITY_FEE_DANGER) {
    findings.push({
      severity: 'danger',
      code: 'excessive-priority-fee',
      message: `The priority fee is about ${formatSol(priorityFee)}, far above normal. A bad actor can use this to burn your SOL as fees.`,
    });
  } else if (priorityFee >= PRIORITY_FEE_WARN) {
    findings.push({
      severity: 'warn',
      code: 'high-priority-fee',
      message: `The priority fee is about ${formatSol(priorityFee)}, higher than typical.`,
    });
  }

  if (unresolvedCount > 0) {
    findings.push({
      severity: 'info',
      code: 'lookup-table-unresolved',
      message: `${unresolvedCount} account(s) come from address lookup tables and cannot be resolved offline, so some addresses above are shown as table references.`,
    });
  }

  if (tx.instructions.length === 0) {
    findings.push({ severity: 'info', code: 'no-instructions', message: 'The transaction contains no instructions.' });
  }

  findings.sort(
    (a, b) => rank(a.severity) - rank(b.severity) || (a.instructionIndex ?? -1) - (b.instructionIndex ?? -1),
  );

  const signers = tx.accountKeys.slice(0, tx.numRequiredSignatures).map((key, i) => ({
    key,
    signed: tx.signatures[i].some((b) => b !== 0),
  }));

  return {
    version: tx.version,
    feePayer: tx.accountKeys[0] ?? '',
    signers,
    baseFeeLamports: baseFee.toString(),
    priorityFeeLamports: priorityFee.toString(),
    estimatedFeeSol: formatSol(baseFee + priorityFee),
    instructions,
    findings,
    riskLevel: findings.some((f) => f.severity === 'danger')
      ? 'danger'
      : findings.some((f) => f.severity === 'warn')
        ? 'caution'
        : 'ok',
  };
}

