export const SYSTEM_PROGRAM = '11111111111111111111111111111111';
export const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
export const ASSOCIATED_TOKEN_PROGRAM = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
export const COMPUTE_BUDGET_PROGRAM = 'ComputeBudget111111111111111111111111111111';
export const MEMO_PROGRAM = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';
export const MEMO_V1_PROGRAM = 'Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo';

/** Programs we recognise by address. `decoded` programs get a plain-language explanation. */
export const KNOWN_PROGRAMS: Record<string, { name: string; decoded: boolean }> = {
  [SYSTEM_PROGRAM]: { name: 'System Program', decoded: true },
  [TOKEN_PROGRAM]: { name: 'SPL Token Program', decoded: true },
  [TOKEN_2022_PROGRAM]: { name: 'SPL Token-2022 Program', decoded: true },
  [ASSOCIATED_TOKEN_PROGRAM]: { name: 'Associated Token Account Program', decoded: true },
  [COMPUTE_BUDGET_PROGRAM]: { name: 'Compute Budget Program', decoded: true },
  [MEMO_PROGRAM]: { name: 'Memo Program', decoded: true },
  [MEMO_V1_PROGRAM]: { name: 'Memo Program (v1)', decoded: true },
  Stake11111111111111111111111111111111111111: { name: 'Stake Program', decoded: false },
  Vote111111111111111111111111111111111111111: { name: 'Vote Program', decoded: false },
  AddressLookupTab1e1111111111111111111111111: { name: 'Address Lookup Table Program', decoded: false },
  BPFLoaderUpgradeab1e11111111111111111111111: { name: 'BPF Upgradeable Loader', decoded: false },
  JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4: { name: 'Jupiter Aggregator v6', decoded: false },
};

export function shortKey(key: string): string {
  return key.length <= 10 ? key : `${key.slice(0, 4)}…${key.slice(-4)}`;
}

/** Human label for an address: a known program name, otherwise a shortened key. */
export function describeKey(key: string): string {
  return KNOWN_PROGRAMS[key]?.name ?? shortKey(key);
}
