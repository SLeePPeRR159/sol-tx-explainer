import { base58Encode } from './base58.ts';
import {
  ASSOCIATED_TOKEN_PROGRAM,
  COMPUTE_BUDGET_PROGRAM,
  MEMO_PROGRAM,
  MEMO_V1_PROGRAM,
  SYSTEM_PROGRAM,
  TOKEN_2022_PROGRAM,
  TOKEN_PROGRAM,
  describeKey,
} from './programs.ts';
import type { AccountRef, Finding } from './types.ts';
import { U64_MAX, formatSol, formatUnits, readU32, readU64 } from './units.ts';

export interface DecodeContext {
  programId: string;
  accounts: AccountRef[];
  data: Uint8Array;
}

export type PartialFinding = Omit<Finding, 'instructionIndex'>;

export interface DecodeResult {
  kind: string;
  summary: string;
  decoded: boolean;
  findings: PartialFinding[];
}

const lab = (ctx: DecodeContext, i: number): string => ctx.accounts[i]?.label ?? '<missing account>';

function malformed(ctx: DecodeContext, what: string): DecodeResult {
  return {
    kind: 'malformed',
    summary: `Malformed ${what} instruction (${ctx.data.length} bytes of data)`,
    decoded: false,
    findings: [
      {
        severity: 'warn',
        code: 'malformed-instruction',
        message: `A ${what} instruction has data that does not match its expected layout, so it cannot be explained.`,
      },
    ],
  };
}

function undecoded(ctx: DecodeContext, what: string, tag: number): DecodeResult {
  return {
    kind: `instruction-${tag}`,
    summary: `${what} instruction #${tag} (not explained by this tool)`,
    decoded: false,
    findings: [
      {
        severity: 'info',
        code: 'undecoded-instruction',
        message: `${what} instruction #${tag} is not explained by this tool; check it in your wallet.`,
      },
    ],
  };
}

function decodeSystem(ctx: DecodeContext): DecodeResult {
  const { data } = ctx;
  if (data.length < 4) return malformed(ctx, 'System Program');
  const tag = readU32(data, 0);
  switch (tag) {
    case 0: {
      const lamports = readU64(data, 4);
      const space = readU64(data, 12);
      if (data.length < 52) return malformed(ctx, 'System Program');
      const owner = base58Encode(data.subarray(20, 52));
      return {
        kind: 'system.createAccount',
        summary: `Create account ${lab(ctx, 1)} (${space} bytes, owner ${describeKey(owner)}), funded with ${formatSol(lamports)} from ${lab(ctx, 0)}`,
        decoded: true,
        findings: [],
      };
    }
    case 1: {
      if (data.length < 36) return malformed(ctx, 'System Program');
      const owner = base58Encode(data.subarray(4, 36));
      const account = ctx.accounts[0];
      const findings: PartialFinding[] = [];
      if (owner !== SYSTEM_PROGRAM) {
        const isSigner = account?.signer === true;
        findings.push({
          severity: isSigner ? 'danger' : 'warn',
          code: 'account-assigned-to-program',
          message: isSigner
            ? `This changes the owner of the signing account ${lab(ctx, 0)} to ${describeKey(owner)}. Handing a wallet account to another program can give that program control of it.`
            : `This changes the owner of account ${lab(ctx, 0)} to ${describeKey(owner)}.`,
        });
      }
      return {
        kind: 'system.assign',
        summary: `Assign account ${lab(ctx, 0)} to program ${describeKey(owner)}`,
        decoded: true,
        findings,
      };
    }
    case 2: {
      const lamports = readU64(data, 4);
      return {
        kind: 'system.transfer',
        summary: `Transfer ${formatSol(lamports)} from ${lab(ctx, 0)} to ${lab(ctx, 1)}`,
        decoded: true,
        findings: [],
      };
    }
    case 5: {
      const lamports = readU64(data, 4);
      return {
        kind: 'system.withdrawNonce',
        summary: `Withdraw ${formatSol(lamports)} from nonce account ${lab(ctx, 0)} to ${lab(ctx, 1)}`,
        decoded: true,
        findings: [],
      };
    }
    case 7: {
      if (data.length < 36) return malformed(ctx, 'System Program');
      const next = base58Encode(data.subarray(4, 36));
      return {
        kind: 'system.authorizeNonce',
        summary: `Change the authority of nonce account ${lab(ctx, 0)} to ${describeKey(next)}`,
        decoded: true,
        findings: [
          {
            severity: 'warn',
            code: 'nonce-authority-change',
            message: `This gives ${describeKey(next)} control of nonce account ${lab(ctx, 0)}.`,
          },
        ],
      };
    }
    case 8: {
      const space = readU64(data, 4);
      return {
        kind: 'system.allocate',
        summary: `Allocate ${space} bytes of storage for account ${lab(ctx, 0)}`,
        decoded: true,
        findings: [],
      };
    }
    case 11: {
      const lamports = readU64(data, 4);
      return {
        kind: 'system.transferWithSeed',
        summary: `Transfer ${formatSol(lamports)} from ${lab(ctx, 0)} to ${lab(ctx, 2)} (derived-address transfer)`,
        decoded: true,
        findings: [],
      };
    }
    default:
      return undecoded(ctx, 'System Program', tag);
  }
}

const TOKEN_AUTHORITY_TYPES = ['mint tokens', 'freeze tokens', 'account owner', 'close account'];

function amountText(amount: bigint, decimals: number | null): string {
  return decimals === null
    ? `${amount} raw units (decimals unknown offline)`
    : `${formatUnits(amount, decimals)} (${amount} raw units)`;
}

function decodeToken(ctx: DecodeContext): DecodeResult {
  const { data } = ctx;
  if (data.length < 1) return malformed(ctx, 'Token Program');
  const tag = data[0];
  const program = ctx.programId === TOKEN_2022_PROGRAM ? 'Token-2022' : 'SPL Token';
  try {
    switch (tag) {
      case 3: // Transfer
      case 12: {
        // TransferChecked
        const checked = tag === 12;
        const amount = readU64(data, 1);
        const decimals = checked ? data[9] : null;
        const [src, dst, auth] = checked ? [0, 2, 3] : [0, 1, 2];
        return {
          kind: checked ? 'token.transferChecked' : 'token.transfer',
          summary: `${program}: transfer ${amountText(amount, decimals)} from ${lab(ctx, src)} to ${lab(ctx, dst)} (authority ${lab(ctx, auth)})`,
          decoded: true,
          findings: [],
        };
      }
      case 4: // Approve
      case 13: {
        // ApproveChecked
        const checked = tag === 13;
        const amount = readU64(data, 1);
        const decimals = checked ? data[9] : null;
        const delegateIdx = checked ? 2 : 1;
        const findings: PartialFinding[] = [];
        if (amount === U64_MAX) {
          findings.push({
            severity: 'danger',
            code: 'unlimited-token-approval',
            message: `This gives ${lab(ctx, delegateIdx)} permission to spend an UNLIMITED amount of tokens from ${lab(ctx, 0)}. Wallet drainers use this pattern.`,
          });
        } else if (amount > 0n) {
          findings.push({
            severity: 'warn',
            code: 'token-delegate-approval',
            message: `This lets ${lab(ctx, delegateIdx)} spend up to ${amountText(amount, decimals)} from ${lab(ctx, 0)} without further approval.`,
          });
        }
        return {
          kind: checked ? 'token.approveChecked' : 'token.approve',
          summary: `${program}: allow ${lab(ctx, delegateIdx)} to spend up to ${amount === U64_MAX ? 'UNLIMITED' : amountText(amount, decimals)} from ${lab(ctx, 0)}`,
          decoded: true,
          findings,
        };
      }
      case 5:
        return {
          kind: 'token.revoke',
          summary: `${program}: revoke all spending permissions on ${lab(ctx, 0)}`,
          decoded: true,
          findings: [],
        };
      case 6: {
        const type = data[1];
        const hasNew = data[2] === 1;
        if (data.length < (hasNew ? 35 : 3)) return malformed(ctx, program);
        const next = hasNew ? base58Encode(data.subarray(3, 35)) : null;
        const typeName = TOKEN_AUTHORITY_TYPES[type] ?? `authority type ${type}`;
        const findings: PartialFinding[] = [];
        if (next === null) {
          findings.push({
            severity: 'warn',
            code: 'token-authority-removed',
            message: `This permanently removes the "${typeName}" authority on ${lab(ctx, 0)}.`,
          });
        } else if (type === 2) {
          findings.push({
            severity: 'danger',
            code: 'token-account-ownership-transfer',
            message: `This transfers OWNERSHIP of token account ${lab(ctx, 0)} to ${describeKey(next)}. The new owner controls the tokens in it.`,
          });
        } else if (type === 3) {
          findings.push({
            severity: 'danger',
            code: 'token-close-authority-change',
            message: `This lets ${describeKey(next)} close token account ${lab(ctx, 0)} and collect its rent.`,
          });
        } else {
          findings.push({
            severity: 'warn',
            code: 'token-authority-change',
            message: `This changes the "${typeName}" authority on ${lab(ctx, 0)} to ${describeKey(next)}.`,
          });
        }
        return {
          kind: 'token.setAuthority',
          summary: `${program}: set ${typeName} authority of ${lab(ctx, 0)} to ${next === null ? 'NONE (removed)' : describeKey(next)}`,
          decoded: true,
          findings,
        };
      }
      case 7:
      case 14: {
        const checked = tag === 14;
        const amount = readU64(data, 1);
        return {
          kind: checked ? 'token.mintToChecked' : 'token.mintTo',
          summary: `${program}: mint ${amountText(amount, checked ? data[9] : null)} of ${lab(ctx, 0)} to ${lab(ctx, 1)}`,
          decoded: true,
          findings: [],
        };
      }
      case 8:
      case 15: {
        const checked = tag === 15;
        const amount = readU64(data, 1);
        return {
          kind: checked ? 'token.burnChecked' : 'token.burn',
          summary: `${program}: burn ${amountText(amount, checked ? data[9] : null)} from ${lab(ctx, 0)}`,
          decoded: true,
          findings: [],
        };
      }
      case 9: {
        const dest = ctx.accounts[1];
        const findings: PartialFinding[] = [];
        if (dest && !dest.signer) {
          findings.push({
            severity: 'warn',
            code: 'close-account-destination',
            message: `Closing ${lab(ctx, 0)} sends its remaining SOL to ${lab(ctx, 1)}, which is not a signer of this transaction.`,
          });
        }
        return {
          kind: 'token.closeAccount',
          summary: `${program}: close token account ${lab(ctx, 0)} and send its remaining SOL to ${lab(ctx, 1)}`,
          decoded: true,
          findings,
        };
      }
      default:
        return undecoded(ctx, program, tag);
    }
  } catch {
    return malformed(ctx, program);
  }
}

function decodeComputeBudget(ctx: DecodeContext): DecodeResult {
  const { data } = ctx;
  if (data.length < 1) return malformed(ctx, 'Compute Budget');
  const tag = data[0];
  try {
    switch (tag) {
      case 1:
        return {
          kind: 'computeBudget.requestHeapFrame',
          summary: `Request a ${readU32(data, 1)}-byte heap`,
          decoded: true,
          findings: [],
        };
      case 2:
        return {
          kind: 'computeBudget.setComputeUnitLimit',
          summary: `Set compute unit limit to ${readU32(data, 1)}`,
          decoded: true,
          findings: [],
        };
      case 3:
        return {
          kind: 'computeBudget.setComputeUnitPrice',
          summary: `Set priority fee to ${readU64(data, 1)} micro-lamports per compute unit`,
          decoded: true,
          findings: [],
        };
      case 4:
        return {
          kind: 'computeBudget.setLoadedAccountsDataSizeLimit',
          summary: `Limit loaded account data to ${readU32(data, 1)} bytes`,
          decoded: true,
          findings: [],
        };
      default:
        return undecoded(ctx, 'Compute Budget', tag);
    }
  } catch {
    return malformed(ctx, 'Compute Budget');
  }
}

function decodeMemo(ctx: DecodeContext): DecodeResult {
  // Memos are free text written by whoever built the transaction: show them, but never trust them.
  const text = new TextDecoder('utf-8', { fatal: false })
    .decode(ctx.data)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .slice(0, 200);
  return {
    kind: 'memo',
    summary: `Attach a public memo: "${text}"`,
    decoded: true,
    findings: [],
  };
}

function decodeAssociatedToken(ctx: DecodeContext): DecodeResult {
  const tag = ctx.data.length === 0 ? 0 : ctx.data[0];
  if (tag === 0 || tag === 1) {
    return {
      kind: tag === 0 ? 'ata.create' : 'ata.createIdempotent',
      summary: `Create token account ${lab(ctx, 1)} for wallet ${lab(ctx, 2)} (mint ${lab(ctx, 3)}), rent paid by ${lab(ctx, 0)}`,
      decoded: true,
      findings: [],
    };
  }
  return undecoded(ctx, 'Associated Token Account Program', tag);
}

/** Explain one instruction. Returns null when the program is not decoded by this tool. */
export function decodeInstruction(ctx: DecodeContext): DecodeResult | null {
  switch (ctx.programId) {
    case SYSTEM_PROGRAM:
      return safely(ctx, 'System Program', decodeSystem);
    case TOKEN_PROGRAM:
    case TOKEN_2022_PROGRAM:
      return decodeToken(ctx);
    case COMPUTE_BUDGET_PROGRAM:
      return decodeComputeBudget(ctx);
    case MEMO_PROGRAM:
    case MEMO_V1_PROGRAM:
      return decodeMemo(ctx);
    case ASSOCIATED_TOKEN_PROGRAM:
      return decodeAssociatedToken(ctx);
    default:
      return null;
  }
}

function safely(ctx: DecodeContext, what: string, fn: (c: DecodeContext) => DecodeResult): DecodeResult {
  try {
    return fn(ctx);
  } catch {
    return malformed(ctx, what);
  }
}
