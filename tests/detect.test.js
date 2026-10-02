import test from 'node:test';
import assert from 'node:assert/strict';
import { mkSession, sh, failSh, rd, ed } from './helpers.js';
import { detectRetries } from '../src/detect/retry.js';
import { detectThrash } from '../src/detect/thrash.js';
import { detectRereads } from '../src/detect/rereads.js';
import { detectFloods } from '../src/detect/floods.js';
import { detectCorrections, looksLikeCorrection } from '../src/detect/corrections.js';
import { detectRejections } from '../src/detect/rejections.js';
import { analyzeSession } from '../src/detect/index.js';

test('retry-loop: same command failing 3+ times is flagged, 2 is not', () => {
  const three = mkSession([failSh('npm test'), failSh('npm test'), failSh('npm test')]);
  const f = detectRetries(three);
  assert.equal(f.length, 1);
  assert.equal(f[0].kind, 'retry-loop');
  assert.equal(f[0].wastedCalls, 2);
  assert.equal(detectRetries(mkSession([failSh('npm test'), failSh('npm test')])).length, 0);
});

test('retry-loop: cd prefix and tail pipes do not split a group', () => {
  const s = mkSession([failSh('cd /a && npm test 2>&1 | tail -5'), failSh('npm test'), failSh('cd /a; npm test | tail -20')]);
  assert.equal(detectRetries(s).length, 1);
});

test('retry-loop: declined calls are not failures', () => {
  const s = mkSession([sh('rm x', { ok: false, rejected: true }), sh('rm x', { ok: false, rejected: true }), sh('rm x', { ok: false, rejected: true })]);
  assert.equal(detectRetries(s).length, 0);
});

test('flailing: different failing calls in a row', () => {
  const s = mkSession([failSh('a'), failSh('b'), failSh('c'), failSh('d')]);
  const f = detectRetries(s);
  assert.equal(f.length, 1);
  assert.equal(f[0].kind, 'flailing');
  assert.equal(f[0].wastedCalls, 4);
});

test('edit-thrash: undone edits are detected', () => {
  const A = 'const limit = 100; // original';
  const B = 'const limit = 50; // tuned value';
  const s = mkSession([ed('/p/a.ts', A, B), ed('/p/a.ts', B, A), ed('/p/a.ts', A, B), ed('/p/a.ts', B, A)]);
  const f = detectThrash(s);
  assert.equal(f.length, 1);
  assert.match(f[0].title, /a\.ts/);
  assert.match(f[0].title, /undone/);
});

test('edit-thrash: many edits with no failures is normal work', () => {
  const calls = Array.from({ length: 12 }, (_, i) => ed('/p/feature.ts', `old line number ${i}`, `new line number ${i}`));
  assert.equal(detectThrash(mkSession(calls)).length, 0);
});

test('edit-thrash: edit, fail, edit cycles are detected', () => {
  const calls = [];
  for (let i = 0; i < 6; i++) calls.push(ed('/p/b.ts', `x${i}`, `y${i}`), failSh('pnpm test'));
  const f = detectThrash(mkSession(calls));
  assert.equal(f.length, 1);
  assert.match(f[0].title, /after a failing command/);
});

test('re-read: unchanged file read 3+ times', () => {
  const s = mkSession([rd('/p/c.ts', { outChars: 4000 }), rd('/p/c.ts', { outChars: 4000 }), rd('/p/c.ts', { outChars: 4000 })]);
  const f = detectRereads(s);
  assert.equal(f.length, 1);
  assert.equal(f[0].wastedCalls, 2);
  assert.equal(f[0].wastedTokens, 2000);
});

test('re-read: an edit in between resets the count', () => {
  const s = mkSession([rd('/p/c.ts'), ed('/p/c.ts', 'a', 'b'), rd('/p/c.ts'), ed('/p/c.ts', 'b', 'c'), rd('/p/c.ts')]);
  assert.equal(detectRereads(s).length, 0);
});

test('output-flood: large shell output flagged, normal output not', () => {
  assert.equal(detectFloods(mkSession([sh('pnpm test', { outChars: 31_000 })])).length, 1);
  assert.equal(detectFloods(mkSession([sh('pnpm test', { outChars: 5_000 })])).length, 0);
  assert.equal(detectFloods(mkSession([rd('/p/big.md', { outChars: 40_000 })])).length, 0, 'reads have a higher bar');
});

test('corrections: pattern matching', () => {
  for (const yes of ["no, use pnpm", "that's wrong", 'you forgot the migration', 'I said per API key', 'undo that']) {
    assert.ok(looksLikeCorrection(yes), yes);
  }
  for (const no of ['no i just sent this', 'do not stop till I say', 'add a login page', 'nope'.repeat(120)]) {
    assert.ok(!looksLikeCorrection(no), no.slice(0, 20));
  }
});

test('corrections: needs 3 in a session; first prompt never counts', () => {
  const s = mkSession([], ["no, use pnpm", "that's wrong", 'you forgot X']);
  assert.equal(detectCorrections(s).length, 0, 'first prompt is the task');
  const s2 = mkSession([], ['task', 'no, use pnpm', "that's wrong", 'you forgot X']);
  assert.equal(detectCorrections(s2)[0].kind, 'corrections');
});

test('interrupts: 3 or more', () => {
  const s = mkSession([], ['task', { text: '[Request interrupted by user]', interrupt: true }, { text: 'x', interrupt: true }, { text: 'y', interrupt: true }]);
  assert.equal(detectCorrections(s).find((f) => f.kind === 'interrupts')?.wastedCalls, 3);
});

test('rejections: grouped by command head', () => {
  const rej = (c) => sh(c, { ok: false, rejected: true });
  const f = detectRejections(mkSession([rej('rm -rf dist'), rej('rm -rf build')]));
  assert.equal(f.length, 1);
  assert.match(f[0].title, /rm -rf/);
  assert.equal(detectRejections(mkSession([rej('rm -rf dist')])).length, 0);
});

test('analyzeSession ranks by impact and tags sessions', () => {
  const s = mkSession([failSh('a'), failSh('a'), failSh('a'), failSh('a'), failSh('a'), sh('big', { outChars: 31_000 })], [], { id: 'abc', project: 'demo' });
  const all = analyzeSession(s);
  assert.ok(all.length >= 2);
  assert.ok(all.every((f) => f.sessionId === 'abc' && f.project === 'demo'));
  assert.equal(all[0].kind, 'retry-loop');
});
