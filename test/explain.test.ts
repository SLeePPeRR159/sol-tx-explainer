import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { base58Decode, base58Encode } from '../src/base58.ts';
import { explainTransaction } from '../src/explain.ts';
import { ParseError } from '../src/reader.ts';
import {
  buildTx,
  computeLimit,
  computePrice,
  fakeKey,
  memo,
  systemAssign,
  systemTransfer,
  toBase64,
  tokenApprove,
  tokenSetAuthority,
  tokenTransferChecked,
} from './helpers.ts';

const alice = fakeKey(1);
const bob = fakeKey(2);
const mallory = fakeKey(3);
const tokenAcc = fakeKey(4);
const mint = fakeKey(5);
const otherProgram = fakeKey(6);

const codes = (tx: Uint8Array) => explainTransaction(tx).findings.map((f) => f.code);

test('base58 round trip and system program address', () => {
  const zeros = new Uint8Array(32);
  assert.equal(base58Encode(zeros), '1'.repeat(32));
  assert.deepEqual(base58Decode('1'.repeat(32)), zeros);
  const bytes = Uint8Array.from({ length: 32 }, (_, i) => i * 7 + 1);
  assert.deepEqual(base58Decode(base58Encode(bytes)), bytes);
});

test('SOL transfer is explained and rated ok', () => {
  const tx = buildTx({ payer: alice, instructions: [systemTransfer(alice, bob, 1_500_000_000n)] });
  const e = explainTransaction(tx);
  assert.equal(e.version, 'legacy');
  assert.equal(e.riskLevel, 'ok');
  assert.match(e.instructions[0].summary, /Transfer 1\.5 SOL/);
  assert.equal(e.feePayer, alice);
  assert.equal(e.baseFeeLamports, '5000');
  assert.equal(e.priorityFeeLamports, '0');
  assert.deepEqual(e.signers, [{ key: alice, signed: false }]);
});

test('signed transactions are reported as signed', () => {
  const tx = buildTx({ payer: alice, signed: true, instructions: [systemTransfer(alice, bob, 1n)] });
  assert.equal(explainTransaction(tx).signers[0].signed, true);
});

test('unlimited token approval is a DANGER', () => {
  const tx = buildTx({
    payer: alice,
    instructions: [tokenApprove(tokenAcc, mallory, alice, 18446744073709551615n)],
  });
  const e = explainTransaction(tx);
  assert.equal(e.riskLevel, 'danger');
  assert.ok(codes(tx).includes('unlimited-token-approval'));
  assert.match(e.instructions[0].summary, /UNLIMITED/);
});

test('limited token approval is a warning, zero approval is not', () => {
  const limited = buildTx({ payer: alice, instructions: [tokenApprove(tokenAcc, mallory, alice, 1000n)] });
  assert.equal(explainTransaction(limited).riskLevel, 'caution');
  assert.ok(codes(limited).includes('token-delegate-approval'));
  const zero = buildTx({ payer: alice, instructions: [tokenApprove(tokenAcc, mallory, alice, 0n)] });
  assert.equal(explainTransaction(zero).riskLevel, 'ok');
});

test('token transferChecked formats the amount with decimals', () => {
  const tx = buildTx({
    payer: alice,
    instructions: [tokenTransferChecked(tokenAcc, mint, fakeKey(7), alice, 2_500_000n, 6)],
  });
  const e = explainTransaction(tx);
  assert.equal(e.riskLevel, 'ok');
  assert.match(e.instructions[0].summary, /transfer 2\.5 \(2500000 raw units\)/);
});

test('changing token account owner is a DANGER; removing an authority is a warning', () => {
  const owner = buildTx({ payer: alice, instructions: [tokenSetAuthority(tokenAcc, alice, 2, mallory)] });
  assert.equal(explainTransaction(owner).riskLevel, 'danger');
  assert.ok(codes(owner).includes('token-account-ownership-transfer'));
  const removed = buildTx({ payer: alice, instructions: [tokenSetAuthority(tokenAcc, alice, 0, null)] });
  assert.ok(codes(removed).includes('token-authority-removed'));
});

test('assigning a signing account to another program is a DANGER', () => {
  const tx = buildTx({ payer: alice, instructions: [systemAssign(alice, otherProgram)] });
  assert.ok(codes(tx).includes('account-assigned-to-program'));
  assert.equal(explainTransaction(tx).riskLevel, 'danger');
});

test('unknown program is flagged', () => {
  const tx = buildTx({
    payer: alice,
    instructions: [
      { programId: otherProgram, keys: [{ pubkey: bob, isSigner: false, isWritable: true }], data: Uint8Array.of(1, 2, 3) },
    ],
  });
  const e = explainTransaction(tx);
  assert.ok(codes(tx).includes('unknown-program'));
  assert.equal(e.riskLevel, 'caution');
  assert.equal(e.instructions[0].known, false);
});

test('priority fee is estimated and extreme fees are flagged', () => {
  const normal = buildTx({
    payer: alice,
    instructions: [computeLimit(200_000), computePrice(1000n), systemTransfer(alice, bob, 1n)],
  });
  const n = explainTransaction(normal);
  assert.equal(n.priorityFeeLamports, '200'); // 1000 micro-lamports x 200k units = 200 lamports
  assert.equal(n.riskLevel, 'ok');

  const extreme = buildTx({
    payer: alice,
    instructions: [computeLimit(1_400_000), computePrice(1_000_000_000n), systemTransfer(alice, bob, 1n)],
  });
  const x = explainTransaction(extreme);
  assert.ok(x.findings.some((f) => f.code === 'excessive-priority-fee'));
  assert.equal(x.riskLevel, 'danger');
});

test('memo text is shown with control characters removed', () => {
  const tx = buildTx({ payer: alice, instructions: [memo('hello\nworld')] });
  assert.match(explainTransaction(tx).instructions[0].summary, /"hello world"/);
});

test('v0 transaction with lookup tables keeps unresolved accounts visible', () => {
  const ix = systemTransfer(alice, bob, 5n);
  const tx = buildTx({
    payer: alice,
    instructions: [ix],
    lookups: [{ accountKey: fakeKey(8), writableIndexes: [3], readonlyIndexes: [] }],
    extraAccountIndexes: [0],
  });
  const e = explainTransaction(tx);
  assert.equal(e.version, 0);
  assert.ok(e.findings.some((f) => f.code === 'lookup-table-unresolved'));
  assert.ok(e.instructions[0].accounts.some((a) => a.unresolved));
});

test('malformed input raises a clear ParseError', () => {
  assert.throws(() => explainTransaction(Uint8Array.of(1, 2, 3)), ParseError);
  assert.throws(() => explainTransaction('not a transaction!'), ParseError);
  const tx = buildTx({ payer: alice, instructions: [systemTransfer(alice, bob, 1n)] });
  assert.throws(() => explainTransaction(tx.subarray(0, tx.length - 5)), ParseError);
  assert.throws(() => explainTransaction(Uint8Array.from([...tx, 0])), /trailing/);
});

test('base64 and base58 string inputs both work', () => {
  const tx = buildTx({ payer: alice, instructions: [systemTransfer(alice, bob, 42n)] });
  assert.equal(explainTransaction(toBase64(tx)).instructions[0].kind, 'system.transfer');
  assert.equal(explainTransaction(base58Encode(tx)).instructions[0].kind, 'system.transfer');
});

test('CLI exit codes: 0 for ok, 2 for danger, 1 for bad input', () => {
  const run = (arg: string) => spawnSync('node', [fileURLToPath(new URL('../src/cli.ts', import.meta.url)), arg, '--json'], { encoding: 'utf8' });
  const ok = run(toBase64(buildTx({ payer: alice, instructions: [systemTransfer(alice, bob, 1n)] })));
  assert.equal(ok.status, 0);
  assert.equal(JSON.parse(ok.stdout).riskLevel, 'ok');
  const bad = run(toBase64(buildTx({ payer: alice, instructions: [tokenApprove(tokenAcc, mallory, alice, 18446744073709551615n)] })));
  assert.equal(bad.status, 2);
  assert.equal(JSON.parse(bad.stdout).riskLevel, 'danger');
  const err = run('@@@');
  assert.equal(err.status, 1);
  assert.match(err.stderr, /error:/);
});
