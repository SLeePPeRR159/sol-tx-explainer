import { base58Decode, base58Encode } from '../src/base58.ts';

export const SYSTEM = '11111111111111111111111111111111';
export const TOKEN = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const COMPUTE_BUDGET = 'ComputeBudget111111111111111111111111111111';
export const MEMO = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';

/** Deterministic fake address: 32 bytes filled with `n`. */
export function fakeKey(n: number): string {
  return base58Encode(new Uint8Array(32).fill(n));
}

export interface Meta {
  pubkey: string;
  isSigner: boolean;
  isWritable: boolean;
}

export interface Ix {
  programId: string;
  keys: Meta[];
  data: Uint8Array;
}

function compactU16(n: number): number[] {
  const out: number[] = [];
  let v = n;
  for (;;) {
    const byte = v & 0x7f;
    v >>= 7;
    if (v === 0) {
      out.push(byte);
      return out;
    }
    out.push(byte | 0x80);
  }
}

export function u64le(n: bigint): Uint8Array {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, n, true);
  return b;
}

export function u32le(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, true);
  return b;
}

export function concat(...parts: Uint8Array[]): Uint8Array {
  return Uint8Array.from(parts.flatMap((p) => Array.from(p)));
}

export interface BuildOptions {
  payer: string;
  instructions: Ix[];
  /** Pretend the transaction has been signed (non-zero signature bytes). */
  signed?: boolean;
  /** v0 transaction with address table lookups. */
  lookups?: { accountKey: string; writableIndexes: number[]; readonlyIndexes: number[] }[];
  /** Extra account indexes (beyond static keys) to append to the first instruction (for lookup tests). */
  extraAccountIndexes?: number[];
}

/** Build wire-format bytes of a legacy (or v0 when `lookups` is given) transaction. */
export function buildTx(opts: BuildOptions): Uint8Array {
  type Entry = { signer: boolean; writable: boolean };
  const order: string[] = [];
  const flags = new Map<string, Entry>();
  const add = (key: string, signer: boolean, writable: boolean) => {
    const e = flags.get(key);
    if (e) {
      e.signer ||= signer;
      e.writable ||= writable;
    } else {
      flags.set(key, { signer, writable });
      order.push(key);
    }
  };
  add(opts.payer, true, true);
  for (const ix of opts.instructions) {
    for (const k of ix.keys) add(k.pubkey, k.isSigner, k.isWritable);
    add(ix.programId, false, false);
  }
  const rank = (k: string) => {
    const f = flags.get(k)!;
    return (f.signer ? 0 : 2) + (f.writable ? 0 : 1);
  };
  const keys = [...order].sort((a, b) => (a === opts.payer ? -1 : b === opts.payer ? 1 : rank(a) - rank(b) || order.indexOf(a) - order.indexOf(b)));
  const numSigners = keys.filter((k) => flags.get(k)!.signer).length;
  const numReadonlySigned = keys.filter((k) => flags.get(k)!.signer && !flags.get(k)!.writable).length;
  const numReadonlyUnsigned = keys.filter((k) => !flags.get(k)!.signer && !flags.get(k)!.writable).length;

  const out: number[] = [];
  out.push(...compactU16(numSigners));
  for (let i = 0; i < numSigners; i++) out.push(...new Uint8Array(64).fill(opts.signed ? 7 : 0));
  const v0 = opts.lookups !== undefined;
  if (v0) out.push(0x80);
  out.push(numSigners, numReadonlySigned, numReadonlyUnsigned);
  out.push(...compactU16(keys.length));
  for (const k of keys) out.push(...base58Decode(k).subarray(0, 32), ...new Array(Math.max(0, 32 - base58Decode(k).length)).fill(0));
  out.push(...new Uint8Array(32).fill(9)); // recent blockhash
  out.push(...compactU16(opts.instructions.length));
  opts.instructions.forEach((ix, idx) => {
    out.push(keys.indexOf(ix.programId));
    const idxs = ix.keys.map((k) => keys.indexOf(k.pubkey));
    if (idx === 0 && opts.extraAccountIndexes) idxs.push(...opts.extraAccountIndexes.map((n) => keys.length + n));
    out.push(...compactU16(idxs.length), ...idxs);
    out.push(...compactU16(ix.data.length), ...ix.data);
  });
  if (v0) {
    out.push(...compactU16(opts.lookups!.length));
    for (const l of opts.lookups!) {
      out.push(...base58Decode(l.accountKey));
      out.push(...compactU16(l.writableIndexes.length), ...l.writableIndexes);
      out.push(...compactU16(l.readonlyIndexes.length), ...l.readonlyIndexes);
    }
  }
  return Uint8Array.from(out);
}

export const toBase64 = (b: Uint8Array): string => Buffer.from(b).toString('base64');

// Instruction helpers -------------------------------------------------------

export function systemTransfer(from: string, to: string, lamports: bigint): Ix {
  return {
    programId: SYSTEM,
    keys: [
      { pubkey: from, isSigner: true, isWritable: true },
      { pubkey: to, isSigner: false, isWritable: true },
    ],
    data: concat(u32le(2), u64le(lamports)),
  };
}

export function systemAssign(account: string, owner: string): Ix {
  return {
    programId: SYSTEM,
    keys: [{ pubkey: account, isSigner: true, isWritable: true }],
    data: concat(u32le(1), base58Decode(owner)),
  };
}

export function tokenApprove(source: string, delegate: string, owner: string, amount: bigint): Ix {
  return {
    programId: TOKEN,
    keys: [
      { pubkey: source, isSigner: false, isWritable: true },
      { pubkey: delegate, isSigner: false, isWritable: false },
      { pubkey: owner, isSigner: true, isWritable: false },
    ],
    data: concat(Uint8Array.of(4), u64le(amount)),
  };
}

export function tokenTransferChecked(src: string, mint: string, dst: string, owner: string, amount: bigint, decimals: number): Ix {
  return {
    programId: TOKEN,
    keys: [
      { pubkey: src, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: dst, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
    ],
    data: concat(Uint8Array.of(12), u64le(amount), Uint8Array.of(decimals)),
  };
}

export function tokenSetAuthority(account: string, current: string, type: number, newAuthority: string | null): Ix {
  return {
    programId: TOKEN,
    keys: [
      { pubkey: account, isSigner: false, isWritable: true },
      { pubkey: current, isSigner: true, isWritable: false },
    ],
    data: newAuthority
      ? concat(Uint8Array.of(6, type, 1), base58Decode(newAuthority))
      : Uint8Array.of(6, type, 0),
  };
}

export function computePrice(microLamports: bigint): Ix {
  return { programId: COMPUTE_BUDGET, keys: [], data: concat(Uint8Array.of(3), u64le(microLamports)) };
}

export function computeLimit(units: number): Ix {
  return { programId: COMPUTE_BUDGET, keys: [], data: concat(Uint8Array.of(2), u32le(units)) };
}

export function memo(text: string): Ix {
  return { programId: MEMO, keys: [], data: new TextEncoder().encode(text) };
}

export const STAKE = 'Stake11111111111111111111111111111111111111';
export const LOOKUP_TABLE = 'AddressLookupTab1e1111111111111111111111111';

export function stakeAuthorize(stake: string, authority: string, newAuthority: string, kind: 0 | 1): Ix {
  return {
    programId: STAKE,
    keys: [
      { pubkey: stake, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false },
    ],
    data: concat(u32le(1), base58Decode(newAuthority), u32le(kind)),
  };
}

export function stakeDelegate(stake: string, vote: string, authority: string): Ix {
  return {
    programId: STAKE,
    keys: [
      { pubkey: stake, isSigner: false, isWritable: true },
      { pubkey: vote, isSigner: false, isWritable: false },
      { pubkey: authority, isSigner: true, isWritable: false },
    ],
    data: u32le(2),
  };
}

export function stakeWithdraw(stake: string, recipient: string, authority: string, lamports: bigint): Ix {
  return {
    programId: STAKE,
    keys: [
      { pubkey: stake, isSigner: false, isWritable: true },
      { pubkey: recipient, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false },
    ],
    data: concat(u32le(4), u64le(lamports)),
  };
}

export function lookupTableExtend(table: string, authority: string, keys: string[]): Ix {
  return {
    programId: LOOKUP_TABLE,
    keys: [
      { pubkey: table, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false },
    ],
    data: concat(u32le(2), u64le(BigInt(keys.length)), ...keys.map((k) => base58Decode(k))),
  };
}

export function lookupTableClose(table: string, authority: string, recipient: string): Ix {
  return {
    programId: LOOKUP_TABLE,
    keys: [
      { pubkey: table, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false },
      { pubkey: recipient, isSigner: false, isWritable: true },
    ],
    data: u32le(4),
  };
}
