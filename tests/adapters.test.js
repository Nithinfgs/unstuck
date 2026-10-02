import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { tmpDir, writeJsonl } from './helpers.js';
import { parseSession } from '../src/adapters/index.js';
import { DEMO_DIR } from '../src/cli.js';

const base = { sessionId: 'sess-1', cwd: '/work/app', timestamp: '2026-09-01T10:00:00.000Z' };
const use = (id, name, input, ts) => ({ ...base, type: 'assistant', timestamp: ts ?? base.timestamp, message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input }] } });
const result = (id, content, is_error = false, ts) => ({ ...base, type: 'user', timestamp: ts ?? base.timestamp, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content, is_error }] } });

test('claude adapter: pairs tool_use with tool_result and captures failures', async () => {
  const dir = tmpDir();
  const f = path.join(dir, 'a.jsonl');
  writeJsonl(f, [
    { ...base, type: 'user', message: { role: 'user', content: 'fix the build' } },
    use('t1', 'Bash', { command: 'npm test' }, '2026-09-01T10:00:01.000Z'),
    result('t1', 'Exit code 1\nMissing script: "test"\nmore', true, '2026-09-01T10:00:04.000Z'),
    use('t2', 'Read', { file_path: '/work/app/a.ts' }),
    result('t2', [{ type: 'text', text: 'x'.repeat(500) }]),
  ]);
  const s = await parseSession(f);
  assert.equal(s.agent, 'claude-code');
  assert.equal(s.id, 'sess-1');
  assert.equal(s.project, 'app');
  assert.equal(s.calls.length, 2);
  assert.equal(s.calls[0].ok, false);
  assert.equal(s.calls[0].error, 'Missing script: "test"');
  assert.equal(s.calls[0].durMs, 3000);
  assert.equal(s.calls[1].outChars, 500);
  assert.deepEqual(s.prompts.map((p) => p.text), ['fix the build']);
});

test('claude adapter: recognises declined tool calls and interrupts', async () => {
  const dir = tmpDir();
  const f = path.join(dir, 'b.jsonl');
  writeJsonl(f, [
    use('t1', 'Bash', { command: 'rm -rf x' }),
    result('t1', "The user doesn't want to proceed with this tool use. The tool use was rejected.", true),
    { ...base, type: 'user', message: { role: 'user', content: [{ type: 'text', text: '[Request interrupted by user for tool use]' }] } },
  ]);
  const s = await parseSession(f);
  assert.equal(s.calls[0].rejected, true);
  assert.equal(s.calls[0].error, undefined);
  assert.equal(s.prompts[0].interrupt, true);
});

test('claude adapter: strips system reminders and skips meta messages', async () => {
  const dir = tmpDir();
  const f = path.join(dir, 'c.jsonl');
  writeJsonl(f, [
    { ...base, type: 'user', message: { role: 'user', content: '<system-reminder>ignore me</system-reminder>real prompt' } },
    { ...base, type: 'user', isMeta: true, message: { role: 'user', content: 'meta' } },
    { ...base, type: 'user', message: { role: 'user', content: '<system-reminder>only reminder</system-reminder>' } },
    use('t1', 'Bash', { command: 'ls' }),
  ]);
  const s = await parseSession(f);
  assert.deepEqual(s.prompts.map((p) => p.text), ['real prompt']);
});

test('adapters tolerate corrupt lines and unknown formats', async () => {
  const dir = tmpDir();
  const f = path.join(dir, 'd.jsonl');
  writeJsonl(f, [use('t1', 'Bash', { command: 'ls' }), '{not json', result('t1', 'ok')]);
  const s = await parseSession(f);
  assert.equal(s.badLines, 1);
  assert.equal(s.calls.length, 1);

  const other = path.join(dir, 'e.jsonl');
  writeJsonl(other, [{ hello: 'world' }]);
  assert.equal(await parseSession(other), null);
  assert.equal(await parseSession(path.join(dir, 'missing.jsonl')), null);
});

test('generic adapter: unstuck JSONL', async () => {
  const dir = tmpDir();
  const f = path.join(dir, 'g.jsonl');
  writeJsonl(f, [
    { type: 'session', id: 'g1', agent: 'my-agent', cwd: '/srv/api' },
    { type: 'prompt', ts: '2026-09-01T10:00:00Z', text: 'hello' },
    { type: 'call', ts: '2026-09-01T10:00:01Z', tool: 'Bash', input: { command: 'make' }, ok: false, error: 'No rule to make target', outChars: 40 },
  ]);
  const s = await parseSession(f);
  assert.equal(s.agent, 'my-agent');
  assert.equal(s.project, 'api');
  assert.equal(s.calls[0].command, 'make');
  assert.equal(s.calls[0].ok, false);
});

test('bundled demo sessions parse and look like the story', async () => {
  const s = await parseSession(path.join(DEMO_DIR, 'demo-s3-limiter-tuning.jsonl'));
  assert.equal(s.project, 'acme-api');
  assert.ok(s.calls.filter((c) => !c.ok).length >= 6);
});
