import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { main } from '../src/cli.js';
import { capture, tmpDir } from './helpers.js';
import { parseSince } from '../src/discover.js';

async function run(args) {
  const out = capture();
  const err = capture();
  const code = await main(args, { stdout: out.stream, stderr: err.stream });
  return { code, out: out.text(), err: err.text() };
}

test('--demo prints the stuck moments and learned fixes', async () => {
  const r = await run(['--demo', '--no-color']);
  assert.equal(r.code, 0);
  assert.match(r.out, /WHERE YOUR AGENT GOT STUCK/);
  assert.match(r.out, /retry loop/);
  assert.match(r.out, /LEARNED FIXES/);
  assert.match(r.out, /npm test.*pnpm test/);
  assert.ok(!r.out.includes('\u001b['), 'no ANSI when --no-color');
});

test('--json is valid and redacted of home directory', async () => {
  const r = await run(['--demo', '--json']);
  const j = JSON.parse(r.out);
  assert.equal(j.stats.sessions, 6);
  assert.ok(j.findings.length > 5);
  assert.ok(j.patterns.learnedFixes.length === 2);
});

test('suggest prints a marked block; --append is idempotent and preserves content', async () => {
  const dir = tmpDir();
  const f = path.join(dir, 'AGENTS.md');
  fs.writeFileSync(f, '# My rules\n\nBe kind.\n');
  assert.equal((await run(['--demo', 'suggest', '--append', f])).code, 0);
  const once = fs.readFileSync(f, 'utf8');
  assert.match(once, /^# My rules\n\nBe kind\./);
  assert.match(once, /unstuck:start/);
  assert.match(once, /pnpm test/);
  await run(['--demo', 'suggest', '--append', f]);
  assert.equal(fs.readFileSync(f, 'utf8'), once, 'second run changes nothing');
});

test('report writes a self-contained HTML file with no scripts', async () => {
  const dir = tmpDir();
  const f = path.join(dir, 'r.html');
  const r = await run(['--demo', 'report', '-o', f]);
  assert.equal(r.code, 0);
  const html = fs.readFileSync(f, 'utf8');
  assert.match(html, /<title>unstuck report<\/title>/);
  assert.doesNotMatch(html, /<script|https?:\/\/(?!www\.w3)/i);
  assert.match(html, /pnpm test/);
});

test('report escapes hostile content from logs', async () => {
  const dir = tmpDir();
  const row = (o) => JSON.stringify({ sessionId: 's', cwd: '/w/<img src=x onerror=alert(1)>', timestamp: '2026-09-01T10:00:00Z', ...o });
  const rows = [];
  for (let i = 0; i < 3; i++) {
    rows.push(row({ type: 'assistant', message: { content: [{ type: 'tool_use', id: `t${i}`, name: 'Bash', input: { command: '<script>alert(1)</script>' } }] } }));
    rows.push(row({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: `t${i}`, content: '<b>bad</b>', is_error: true }] } }));
  }
  fs.writeFileSync(path.join(dir, 'x.jsonl'), `${rows.join('\n')}\n`);
  const out = path.join(dir, 'o.html');
  await run(['--path', dir, 'report', '-o', out, '--since', '2000-01-01']);
  const html = fs.readFileSync(out, 'utf8');
  assert.doesNotMatch(html, /<script>alert|<img src=x|<b>bad/);
  assert.match(html, /&lt;script&gt;/);
});

test('exit codes and messages for bad input', async () => {
  assert.equal((await run(['bogus'])).code, 2);
  assert.equal((await run(['--top', '0'])).code, 2);
  assert.equal((await run(['--since', 'yesterdayish'])).code, 2);
  assert.equal((await run(['--nope'])).code, 2);
  const missing = await run(['--path', '/definitely/not/here']);
  assert.equal(missing.code, 1);
  assert.match(missing.err, /path not found/);
  assert.match((await run(['--help'])).out, /Usage/);
  assert.match((await run(['--version'])).out, /^\d+\.\d+\.\d+/);
});

test('empty directory gives a helpful message, not a crash', async () => {
  const r = await run(['--path', tmpDir(), '--no-color']);
  assert.equal(r.code, 0);
  assert.match(r.out, /No agent sessions found/);
});

test('parseSince', () => {
  const now = Date.UTC(2026, 8, 30);
  assert.equal(parseSince('2d', now), now - 2 * 86400e3);
  assert.equal(parseSince('12h', now), now - 12 * 3600e3);
  assert.equal(parseSince('2026-09-01'), Date.UTC(2026, 8, 1));
  assert.throws(() => parseSince('soon'), /--since/);
});
