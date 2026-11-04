export type Severity = 'info' | 'warn' | 'danger';

export interface Finding {
  severity: Severity;
  code: string;
  message: string;
  instructionIndex?: number;
}

export interface AccountRef {
  /** Base58 address, or a placeholder for lookup-table accounts that cannot be resolved offline. */
  key: string;
  label: string;
  signer: boolean;
  writable: boolean;
  unresolved: boolean;
}

export interface ExplainedInstruction {
  index: number;
  programId: string;
  programName: string;
  known: boolean;
  decoded: boolean;
  kind: string;
  summary: string;
  accounts: AccountRef[];
  dataLength: number;
}

export interface Explanation {
  version: 'legacy' | 0;
  feePayer: string;
  signers: { key: string; signed: boolean }[];
  baseFeeLamports: string;
  priorityFeeLamports: string;
  estimatedFeeSol: string;
  instructions: ExplainedInstruction[];
  findings: Finding[];
  riskLevel: 'ok' | 'caution' | 'danger';
}
