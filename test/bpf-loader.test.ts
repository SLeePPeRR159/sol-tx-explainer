import assert from 'node:assert/strict';
import { test } from 'node:test';
import { explainTransaction } from '../src/explain.ts';
import { bpfSetAuthority, bpfUpgrade, buildTx, fakeKey } from './helpers.ts';

const alice = fakeKey(1);
const programData = fakeKey(10);
const program = fakeKey(11);
const buffer = fakeKey(12);
const mallory = fakeKey(3);

const codes = (tx: Uint8Array) => explainTransaction(tx).findings.map((f) => f.code);

test('changing the upgrade authority to a third party is dangerous', () => {
  const tx = buildTx({ payer: alice, instructions: [bpfSetAuthority(programData, alice, mallory)] });
  assert.ok(codes(tx).includes('program-authority-change'));
  assert.equal(explainTransaction(tx).riskLevel, 'danger');
});

test('removing the upgrade authority is a permanent-action warning', () => {
  const tx = buildTx({ payer: alice, instructions: [bpfSetAuthority(programData, alice)] });
  assert.ok(codes(tx).includes('program-authority-removed'));
});

test('a program upgrade is flagged', () => {
  const tx = buildTx({ payer: alice, instructions: [bpfUpgrade(programData, program, buffer, alice, alice)] });
  const e = explainTransaction(tx);
  assert.ok(e.findings.some((f) => f.code === 'program-upgrade'));
  assert.match(e.instructions[0].summary, /upgrade program/);
});
