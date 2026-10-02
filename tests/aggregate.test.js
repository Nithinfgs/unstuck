import test from 'node:test';
import assert from 'node:assert/strict';
import { mkSession, sh, failSh, rd } from './helpers.js';
import { fixPairs, similarity, aggregate } from '../src/aggregate.js';
import { scan } from '../src/scan.js';
import { DEMO_DIR } from '../src/cli.js';

test('similarity: related commands score high, unrelated low', () => {
  assert.ok(similarity('npm test', 'pnpm test') >= 0.5);
  assert.ok(similarity('docker compose up -d db', 'docker compose -f x.yml up -d db') >= 0.5);
  assert.ok(similarity('git status', 'pnpm build') < 0.5);
});

test('fixPairs: failure followed by a close variant', () => {
  const s = mkSession([failSh('npm test', 'vitest: not found'), sh('pnpm test')]);
  assert.deepEqual(fixPairs(s), [{ failed: 'npm test', worked: 'pnpm test', error: 'vitest: not found' }]);
});

test('fixPairs: a plain retry of the same command is not a fix', () => {
  assert.equal(fixPairs(mkSession([failSh('make'), sh('make')])).length, 0);
});

test('fixPairs: unrelated success does not count', () => {
  assert.equal(fixPairs(mkSession([failSh('npm test'), sh('git status')])).length, 0);
});

test('aggregate: needs 2+ occurrences to call something a pattern', () => {
  const once = aggregate([mkSession([failSh('npm test'), sh('pnpm test')], [], { id: 'a' })]);
  assert.equal(once.learnedFixes.length, 0);
  const twice = aggregate([
    mkSession([failSh('npm test'), sh('pnpm test')], [], { id: 'a' }),
    mkSession([failSh('npm test'), sh('pnpm test')], [], { id: 'b' }),
  ]);
  assert.equal(twice.learnedFixes.length, 1);
  assert.equal(twice.learnedFixes[0].sessions, 2);
});

test('aggregate: repeated corrections and hot files', () => {
  const mk = (id) => mkSession([rd('/work/proj/src/core.ts')], ['task', 'no, use pnpm'], { id });
  const r = aggregate([mk('a'), mk('b'), mk('c')]);
  assert.equal(r.repeatedCorrections[0].count, 3);
  assert.equal(r.hotFiles[0].file, 'src/core.ts');
  assert.equal(r.hotFiles[0].sessions, 3);
});

test('scan over the bundled demo finds every detector kind', async () => {
  const r = await scan({ roots: [DEMO_DIR] });
  assert.equal(r.sessions.length, 6);
  const kinds = new Set(r.findings.map((f) => f.kind));
  for (const k of ['retry-loop', 'edit-thrash', 're-read', 'output-flood', 'corrections', 'interrupts', 'rejected']) {
    assert.ok(kinds.has(k), `missing ${k}`);
  }
  assert.equal(r.patterns.learnedFixes.length, 2);
});

test('scan --project filters sessions', async () => {
  assert.equal((await scan({ roots: [DEMO_DIR], project: 'nope' })).sessions.length, 0);
  assert.equal((await scan({ roots: [DEMO_DIR], project: 'acme' })).sessions.length, 6);
});
