import { base58Encode } from './base58.ts';
import { ByteReader, ParseError } from './reader.ts';

export interface CompiledInstruction {
  programIdIndex: number;
  accountIndexes: number[];
  data: Uint8Array;
}

export interface AddressTableLookup {
  accountKey: string;
  writableIndexes: number[];
  readonlyIndexes: number[];
}

export interface ParsedTransaction {
  version: 'legacy' | 0;
  signatures: Uint8Array[];
  numRequiredSignatures: number;
  numReadonlySigned: number;
  numReadonlyUnsigned: number;
  accountKeys: string[];
  recentBlockhash: string;
  instructions: CompiledInstruction[];
  lookups: AddressTableLookup[];
}

/** Parse the Solana wire format of a (possibly unsigned) legacy or v0 transaction. */
export function parseTransaction(bytes: Uint8Array): ParsedTransaction {
  const r = new ByteReader(bytes);

  const sigCount = r.compactU16();
  const signatures: Uint8Array[] = [];
  for (let i = 0; i < sigCount; i++) signatures.push(r.take(64));

  const first = r.u8();
  let version: 'legacy' | 0 = 'legacy';
  let numRequiredSignatures = first;
  if (first & 0x80) {
    const v = first & 0x7f;
    if (v !== 0) throw new ParseError(`unsupported transaction version: ${v}`);
    version = 0;
    numRequiredSignatures = r.u8();
  }
  const numReadonlySigned = r.u8();
  const numReadonlyUnsigned = r.u8();

  const keyCount = r.compactU16();
  const accountKeys: string[] = [];
  for (let i = 0; i < keyCount; i++) accountKeys.push(base58Encode(r.take(32)));
  const recentBlockhash = base58Encode(r.take(32));

  if (numRequiredSignatures > keyCount) throw new ParseError('header requires more signers than accounts');
  if (numReadonlySigned + numReadonlyUnsigned > keyCount) throw new ParseError('invalid readonly counts in header');
  if (sigCount !== numRequiredSignatures) {
    throw new ParseError(`signature count (${sigCount}) does not match required signatures (${numRequiredSignatures})`);
  }

  const ixCount = r.compactU16();
  const instructions: CompiledInstruction[] = [];
  for (let i = 0; i < ixCount; i++) {
    const programIdIndex = r.u8();
    const accCount = r.compactU16();
    const accountIndexes = Array.from(r.take(accCount));
    const dataLen = r.compactU16();
    const data = r.take(dataLen).slice();
    instructions.push({ programIdIndex, accountIndexes, data });
  }

  const lookups: AddressTableLookup[] = [];
  if (version === 0) {
    const lookupCount = r.compactU16();
    for (let i = 0; i < lookupCount; i++) {
      const accountKey = base58Encode(r.take(32));
      const writableIndexes = Array.from(r.take(r.compactU16()));
      const readonlyIndexes = Array.from(r.take(r.compactU16()));
      lookups.push({ accountKey, writableIndexes, readonlyIndexes });
    }
  }
  if (r.remaining() !== 0) throw new ParseError(`${r.remaining()} unexpected trailing byte(s)`);

  const total = keyCount + lookups.reduce((n, l) => n + l.writableIndexes.length + l.readonlyIndexes.length, 0);
  for (const ix of instructions) {
    if (ix.programIdIndex >= total) throw new ParseError('instruction references a missing program account');
    if (ix.programIdIndex >= keyCount) throw new ParseError('program account cannot come from a lookup table');
    for (const a of ix.accountIndexes) {
      if (a >= total) throw new ParseError('instruction references a missing account');
    }
  }

  return {
    version,
    signatures,
    numRequiredSignatures,
    numReadonlySigned,
    numReadonlyUnsigned,
    accountKeys,
    recentBlockhash,
    instructions,
    lookups,
  };
}
