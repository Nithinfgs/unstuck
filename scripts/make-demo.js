#!/usr/bin/env node
/**
 * Generates examples/sessions/*.jsonl: synthetic Claude Code transcripts for a
 * fictional project ("acme-api"). Deterministic, so output is reproducible:
 *
 *   node scripts/make-demo.js
 *
 * No real session data is used. The goal is to exercise every detector in a
 * story a developer would recognise.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'examples', 'sessions');
const CWD = '/home/dev/acme-api';

function testLog(lines, failures = 0) {
  const out = [];
  for (let i = 0; i < lines; i++) {
    out.push(` ✓ src/modules/m${String(i % 40).padStart(2, '0')}/case-${i}.test.ts (${(i % 9) + 3} tests) ${20 + (i % 70)}ms`);
  }
  if (failures) out.push(`\n FAIL  src/orders/limiter.test.ts > limits per API key\nAssertionError: expected 429 to be 200`);
  return out.join('\n');
}

class Session {
  constructor(id, startIso) {
    this.id = id;
    this.t = Date.parse(startIso);
    this.n = 0;
    this.rows = [];
    this.parent = null;
  }
  stamp(secs = 4) {
    this.t += secs * 1000;
    return new Date(this.t).toISOString();
  }
  uid(prefix) {
    this.n++;
    return `${prefix}_${this.id}_${String(this.n).padStart(4, '0')}`;
  }
  base(type, extra) {
    const uuid = this.uid('u');
    const row = {
      parentUuid: this.parent,
      isSidechain: false,
      type,
      uuid,
      timestamp: this.stamp(),
      cwd: CWD,
      sessionId: this.id,
      version: '2.1.0',
      gitBranch: 'main',
      ...extra,
    };
    this.parent = uuid;
    this.rows.push(row);
  }
  prompt(text) {
    this.base('user', { message: { role: 'user', content: text } });
  }
  interrupt() {
    this.base('user', { message: { role: 'user', content: [{ type: 'text', text: '[Request interrupted by user]' }] } });
  }
  say(text) {
    this.base('assistant', { message: { role: 'assistant', model: 'demo', content: [{ type: 'text', text }] } });
  }
  call(name, input, { out = 'ok', error = false } = {}) {
    const id = this.uid('toolu');
    this.base('assistant', { message: { role: 'assistant', model: 'demo', content: [{ type: 'tool_use', id, name, input }] } });
    this.t += 3000;
    this.base('user', {
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: out, is_error: error }] },
    });
  }
  sh(command, opts) {
    this.call('Bash', { command }, opts);
  }
  fail(command, err) {
    this.call('Bash', { command }, { out: `Exit code 1\n${err}`, error: true });
  }
  decline(command) {
    this.call('Bash', { command }, { out: "The user doesn't want to proceed with this tool use. The tool use was rejected.", error: true });
  }
  read(file, out = 'file contents') {
    this.call('Read', { file_path: `${CWD}/${file}` }, { out });
  }
  edit(file, oldS, newS) {
    this.call('Edit', { file_path: `${CWD}/${file}`, old_string: oldS, new_string: newS }, { out: 'The file has been updated.' });
  }
  save() {
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, `${this.id}.jsonl`), `${this.rows.map((r) => JSON.stringify(r)).join('\n')}\n`);
  }
}

const NPM_ERR = 'sh: 1: vitest: not found';
const LIMIT_OLD = 'const WINDOW_MS = 60_000;\nconst MAX_PER_WINDOW = 100;';
const LIMIT_NEW = 'const WINDOW_MS = 30_000;\nconst MAX_PER_WINDOW = 50;';

// 1. Package manager mix-up, first sighting
{
  const s = new Session('demo-s1-rate-limit', '2026-09-14T09:12:00Z');
  s.prompt('Add rate limiting to POST /orders');
  s.read('src/orders/routes.ts');
  s.read('package.json');
  s.edit('src/orders/limiter.ts', 'export {};', 'export function limiter() { return 1; }');
  s.fail('npm test', NPM_ERR);
  s.say('That failed; checking how tests run.');
  s.sh('pnpm test', { out: testLog(12) });
  s.prompt('no, use pnpm not npm in this repo');
  s.sh('git status --short');
  s.save();
}

// 2. Docker mix-up, big test output
{
  const s = new Session('demo-s2-db-migration', '2026-09-16T14:02:00Z');
  s.prompt('Write a migration that adds orders.idempotency_key and run it');
  s.fail('docker compose up -d db', 'no configuration file provided: not found');
  s.sh('docker compose -f deploy/compose.dev.yml up -d db');
  s.read('db/migrations/0042_orders.sql');
  s.sh('pnpm test', { out: testLog(780) });
  s.sh('pnpm test', { out: testLog(780) });
  s.sh('git diff --stat');
  s.save();
}

// 3. Server not up: retry loop, edit thrash with an undo
{
  const s = new Session('demo-s3-limiter-tuning', '2026-09-19T10:30:00Z');
  s.prompt('The limiter is too strict, tune it and verify against the running API');
  s.read('src/orders/limiter.ts');
  s.edit('src/orders/limiter.ts', LIMIT_OLD, LIMIT_NEW);
  s.fail('curl -s localhost:3000/health', 'curl: (7) Failed to connect to localhost port 3000: Connection refused');
  s.fail('curl -s localhost:3000/health', 'curl: (7) Failed to connect to localhost port 3000: Connection refused');
  s.edit('src/orders/limiter.ts', LIMIT_NEW, LIMIT_OLD);
  s.fail('curl -s localhost:3000/health', 'curl: (7) Failed to connect to localhost port 3000: Connection refused');
  s.edit('src/orders/limiter.ts', LIMIT_OLD, LIMIT_NEW);
  s.fail('curl -s localhost:3000/health', 'curl: (7) Failed to connect to localhost port 3000: Connection refused');
  s.edit('src/orders/limiter.ts', LIMIT_NEW, LIMIT_OLD);
  s.fail('curl -s localhost:3000/health', 'curl: (7) Failed to connect to localhost port 3000: Connection refused');
  s.edit('src/orders/limiter.ts', LIMIT_OLD, LIMIT_NEW);
  s.fail('curl -s localhost:3000/health', 'curl: (7) Failed to connect to localhost port 3000: Connection refused');
  s.edit('src/orders/limiter.ts', LIMIT_NEW, LIMIT_OLD);
  s.sh('pnpm dev &', { out: 'ready on :3000' });
  s.sh('curl -s localhost:3000/health', { out: '{"ok":true}' });
  s.save();
}

// 4. Same mistakes again, plus re-reading an unchanged file
{
  const s = new Session('demo-s4-webhooks', '2026-09-22T16:45:00Z');
  s.prompt('Add webhook retries with exponential backoff');
  s.read('src/config.ts');
  s.fail('npm test', NPM_ERR);
  s.sh('pnpm test', { out: testLog(790) });
  s.read('src/config.ts');
  s.edit('src/webhooks/retry.ts', 'const base = 1;', 'const base = 2;');
  s.read('src/config.ts');
  s.sh('pnpm test', { out: testLog(790) });
  s.read('src/config.ts');
  s.prompt('no, use pnpm not npm in this repo');
  s.sh('git diff --stat');
  s.save();
}

// 5. The user keeps correcting the agent
{
  const s = new Session('demo-s5-auth-scopes', '2026-09-25T11:00:00Z');
  s.prompt('Scope API keys per customer');
  s.read('src/auth/keys.ts');
  s.edit('src/auth/keys.ts', 'scope: string', 'scope: string[]');
  s.prompt("that's wrong, the limiter must be per API key, not per IP");
  s.edit('src/orders/limiter.ts', 'key = req.ip', 'key = req.apiKey');
  s.prompt('you forgot the migration for the new column');
  s.fail('docker compose up -d db', 'no configuration file provided: not found');
  s.sh('docker compose -f deploy/compose.dev.yml up -d db');
  s.prompt("no, don't touch the public types in sdk/");
  s.sh('git checkout sdk/');
  s.save();
}

// 6. Declined commands and interruptions
{
  const s = new Session('demo-s6-cleanup', '2026-09-29T08:20:00Z');
  s.prompt('Free up disk space in the repo');
  s.decline('rm -rf node_modules dist .next');
  s.interrupt();
  s.decline('rm -rf node_modules dist .next --force');
  s.interrupt();
  s.sh('du -sh node_modules dist', { out: '1.2G node_modules\n40M dist' });
  s.interrupt();
  s.sh('pnpm store prune', { out: 'Removed 211 packages' });
  s.save();
}

console.log(`wrote 6 demo sessions to ${path.relative(process.cwd(), OUT)}`);
