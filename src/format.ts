import { shortKey } from './programs.ts';
import type { Explanation } from './types.ts';

const RISK_TEXT = { ok: 'OK (no risky patterns found)', caution: 'CAUTION', danger: 'DANGER' } as const;

export function formatExplanation(e: Explanation): string {
  const lines: string[] = [];
  lines.push(`Transaction (${e.version === 'legacy' ? 'legacy' : 'v0'}) — overall risk: ${RISK_TEXT[e.riskLevel]}`);
  lines.push(`Fee payer: ${e.feePayer}`);
  lines.push(
    `Signers: ${e.signers.map((s) => `${shortKey(s.key)} (${s.signed ? 'signed' : 'not signed yet'})`).join(', ') || 'none'}`,
  );
  lines.push(
    `Estimated fee: ${e.estimatedFeeSol} (base ${e.baseFeeLamports} + priority ${e.priorityFeeLamports} lamports)`,
  );
  lines.push('');
  lines.push('What this transaction does:');
  if (e.instructions.length === 0) lines.push('  (no instructions)');
  for (const ix of e.instructions) lines.push(`  ${ix.index + 1}. ${ix.summary}`);
  lines.push('');
  lines.push('Findings:');
  if (e.findings.length === 0) lines.push('  none');
  for (const f of e.findings) {
    const where = f.instructionIndex === undefined ? '' : ` (instruction ${f.instructionIndex + 1})`;
    lines.push(`  [${f.severity.toUpperCase()}]${where} ${f.message}`);
  }
  lines.push('');
  lines.push('This tool explains common instructions offline. It cannot prove a transaction is safe: only sign what you understand and trust.');
  return lines.join('\n');
}
