import fs from 'node:fs';
import readline from 'node:readline';
import path from 'node:path';
import { kindOf, baseName } from '../model.js';

/**
 * The "unstuck JSONL" format: one JSON object per line, so any agent's logs can
 * be converted with a few lines of code. See docs/adapters.md.
 *
 *   {"type":"session","id":"s1","agent":"my-agent","cwd":"/work/app"}
 *   {"type":"prompt","ts":"2026-09-01T10:00:00Z","text":"fix the build"}
 *   {"type":"call","ts":"...","tool":"Bash","input":{"command":"npm test"},
 *    "ok":false,"error":"Missing script: test","outChars":120}
 */

/** @param {string[]} lines */
export function sniff(lines) {
  return lines.some((l) => {
    try {
      const d = JSON.parse(l);
      return d.type === 'session' || d.type === 'call' || d.type === 'prompt';
    } catch {
      return false;
    }
  });
}

/**
 * @param {string} file
 * @returns {Promise<import('../model.js').Session>}
 */
export async function parse(file) {
  /** @type {import('../model.js').Session} */
  const session = {
    id: path.basename(file, '.jsonl'),
    agent: 'generic',
    project: '',
    cwd: '',
    file,
    start: 0,
    end: 0,
    calls: [],
    prompts: [],
    badLines: 0,
  };
  const rl = readline.createInterface({ input: fs.createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let d;
    try {
      d = JSON.parse(line);
    } catch {
      session.badLines++;
      continue;
    }
    const ts = d.ts ? Date.parse(d.ts) || 0 : 0;
    if (ts) {
      if (!session.start || ts < session.start) session.start = ts;
      if (ts > session.end) session.end = ts;
    }
    if (d.type === 'session') {
      if (typeof d.id === 'string') session.id = d.id;
      if (typeof d.agent === 'string') session.agent = d.agent;
      if (typeof d.cwd === 'string') session.cwd = d.cwd;
    } else if (d.type === 'prompt' && typeof d.text === 'string') {
      session.prompts.push({ ts, text: d.text, interrupt: d.interrupt === true });
    } else if (d.type === 'call' && typeof d.tool === 'string') {
      const input = d.input && typeof d.input === 'object' ? d.input : {};
      const kind = kindOf(d.tool);
      /** @type {import('../model.js').Call} */
      const call = {
        index: session.calls.length,
        id: String(d.id ?? session.calls.length),
        ts,
        tool: d.tool,
        kind,
        ok: d.ok !== false,
        rejected: d.rejected === true,
        outChars: Number(d.outChars) || 0,
      };
      if (kind === 'shell' && typeof input.command === 'string') call.command = input.command;
      const p = input.file_path ?? input.path;
      if (typeof p === 'string') call.path = p;
      if (typeof input.old_string === 'string') call.oldText = input.old_string;
      if (typeof input.new_string === 'string') call.newText = input.new_string;
      if (typeof d.error === 'string') call.error = d.error.slice(0, 240);
      session.calls.push(call);
    }
  }
  session.project = baseName(session.cwd) || baseName(path.dirname(file));
  return session;
}
