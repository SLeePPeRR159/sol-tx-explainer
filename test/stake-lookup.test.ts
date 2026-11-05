import assert from 'node:assert/strict';
import { test } from 'node:test';
import { explainTransaction } from '../src/explain.ts';
import {
  buildTx,
  fakeKey,
  lookupTableClose,
  lookupTableExtend,
  stakeAuthorize,
  stakeDelegate,
  stakeWithdraw,
} from './helpers.ts';

const alice = fakeKey(1);
const mallory = fakeKey(3);
const stakeAcc = fakeKey(10);
const vote = fakeKey(11);
const table = fakeKey(12);

const codes = (tx: Uint8Array) => explainTransaction(tx).findings.map((f) => f.code);

test('delegating stake is explained and not flagged', () => {
  const e = explainTransaction(buildTx({ payer: alice, instructions: [stakeDelegate(stakeAcc, vote, alice)] }));
  assert.equal(e.riskLevel, 'ok');
  assert.equal(e.instructions[0].kind, 'stake.delegate');
  assert.match(e.instructions[0].summary, /delegate stake account/);
  assert.equal(e.instructions[0].known, true);
});

test('changing the stake withdrawer is a DANGER', () => {
  const tx = buildTx({ payer: alice, instructions: [stakeAuthorize(stakeAcc, alice, mallory, 1)] });
  const e = explainTransaction(tx);
  assert.equal(e.riskLevel, 'danger');
  assert.ok(codes(tx).includes('stake-withdrawer-change'));
  assert.match(e.instructions[0].summary, /withdrawer/);
});

test('changing only the staker is a warning', () => {
  const tx = buildTx({ payer: alice, instructions: [stakeAuthorize(stakeAcc, alice, mallory, 0)] });
  assert.equal(explainTransaction(tx).riskLevel, 'caution');
  assert.ok(codes(tx).includes('stake-staker-change'));
});

test('stake withdraw to a non-signer is a warning, to a signer is fine', () => {
  const other = buildTx({ payer: alice, instructions: [stakeWithdraw(stakeAcc, mallory, alice, 2_000_000_000n)] });
  const e = explainTransaction(other);
  assert.ok(codes(other).includes('stake-withdraw-to-other'));
  assert.match(e.instructions[0].summary, /withdraw 2 SOL/);
  const self = buildTx({ payer: alice, instructions: [stakeWithdraw(stakeAcc, alice, alice, 1n)] });
  assert.ok(!codes(self).includes('stake-withdraw-to-other'));
});

test('lookup table extend counts the added addresses', () => {
  const tx = buildTx({ payer: alice, instructions: [lookupTableExtend(table, alice, [fakeKey(20), fakeKey(21)])] });
  const e = explainTransaction(tx);
  assert.equal(e.riskLevel, 'ok');
  assert.match(e.instructions[0].summary, /add 2 addresses/);
});

test('closing a lookup table to a third party is a warning', () => {
  const tx = buildTx({ payer: alice, instructions: [lookupTableClose(table, alice, mallory)] });
  assert.ok(codes(tx).includes('lookup-table-close-recipient'));
});

test('truncated stake data is reported as malformed, not a crash', () => {
  const ix = stakeAuthorize(stakeAcc, alice, mallory, 1);
  const tx = buildTx({ payer: alice, instructions: [{ ...ix, data: ix.data.subarray(0, 10) }] });
  assert.ok(codes(tx).includes('malformed-instruction'));
});
