import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Build a Session from compact call specs. */
export function mkSession(calls, prompts = [], extra = {}) {
  return {
    id: extra.id ?? 's1',
    agent: 'test',
    project: extra.project ?? 'proj',
    cwd: extra.cwd ?? '/work/proj',
    file: 'x.jsonl',
    start: 1_790_000_000_000,
    end: 1_790_000_100_000,
    badLines: 0,
    prompts: prompts.map((p) => (typeof p === 'string' ? { ts: 0, text: p, interrupt: false } : { ts: 0, interrupt: false, ...p })),
    calls: calls.map((c, index) => ({
      index,
      id: `c${index}`,
      ts: 1_790_000_000_000 + index * 1000,
      tool: c.tool ?? (c.command ? 'Bash' : c.kind === 'edit' ? 'Edit' : 'Read'),
      kind: c.kind ?? (c.command ? 'shell' : 'read'),
      ok: true,
      rejected: false,
      outChars: 0,
      ...c,
    })),
  };
}

export const sh = (command, over = {}) => ({ kind: 'shell', command, ...over });
export const failSh = (command, error = 'boom', over = {}) => sh(command, { ok: false, error, ...over });
export const rd = (p, over = {}) => ({ kind: 'read', path: p, ...over });
export const ed = (p, oldText, newText, over = {}) => ({ kind: 'edit', path: p, oldText, newText, ...over });

export function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'unstuck-test-'));
}

export function writeJsonl(file, rows) {
  fs.writeFileSync(file, `${rows.map((r) => (typeof r === 'string' ? r : JSON.stringify(r))).join('\n')}\n`);
}

/** Capture CLI output. */
export function capture() {
  let buf = '';
  return { stream: { write: (s) => { buf += s; return true; } }, text: () => buf };
}
