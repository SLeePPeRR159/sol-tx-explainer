/** Format an integer amount of base units with the given number of decimals. */
export function formatUnits(amount: bigint, decimals: number): string {
  if (decimals <= 0) return amount.toString();
  const s = amount.toString().padStart(decimals + 1, '0');
  const whole = s.slice(0, s.length - decimals);
  const frac = s.slice(s.length - decimals).replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole;
}

export const LAMPORTS_PER_SOL_DECIMALS = 9;
export const U64_MAX = 18446744073709551615n;

export function formatSol(lamports: bigint): string {
  return `${formatUnits(lamports, LAMPORTS_PER_SOL_DECIMALS)} SOL`;
}

export function readU64(data: Uint8Array, offset: number): bigint {
  if (data.length < offset + 8) throw new RangeError('data too short');
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getBigUint64(offset, true);
}

export function readU32(data: Uint8Array, offset: number): number {
  if (data.length < offset + 4) throw new RangeError('data too short');
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(offset, true);
}
