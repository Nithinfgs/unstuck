import fs from 'node:fs';
import readline from 'node:readline';
import path from 'node:path';
import { kindOf, baseName } from '../model.js';

const REJECTED_RE = /user (doesn't|does not) want to proceed|tool use was rejected|permission to use .* has been denied|request interrupted by user for tool use/i;
const SYSTEM_BLOCK_RE = /<(system-reminder|command-[a-z-]+|local-command-[a-z-]+|task-notification|ide_[a-z_]+)[^>]*>[\s\S]*?<\/\1>/g;

/** @param {unknown} content */
function textOf(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => (b && typeof b === 'object' && typeof b.text === 'string' ? b.text : ''))
      .join('\n');
  }
  return '';
}

/** @param {unknown} content */
function charsOf(content) {
  if (typeof content === 'string') return content.length;
  if (Array.isArray(content)) {
    let n = 0;
    for (const b of content) {
      if (b && typeof b === 'object' && typeof b.text === 'string') n += b.text.length;
    }
    return n;
  }
  return 0;
}

function firstLine(text) {
  for (const line of String(text).split('\n')) {
    const t = line.trim();
    if (t && !/^exit code \d+$/i.test(t)) return t.slice(0, 240);
  }
  return String(text).trim().slice(0, 240);
}

/**
 * Cheap check on the first lines of a file: is this a Claude Code transcript?
 * @param {string[]} lines
 */
export function sniff(lines) {
  return lines.some((l) => {
    try {
      const d = JSON.parse(l);
      return typeof d.sessionId === 'string' && ['user', 'assistant', 'attachment', 'queue-operation', 'summary'].includes(d.type);
    } catch {
      return false;
    }
  });
}

/**
 * Parse one Claude Code JSONL transcript into the normalized model.
 * Streams line by line so very large transcripts stay cheap.
 * @param {string} file
 * @returns {Promise<import('../model.js').Session>}
 */
export async function parse(file) {
  /** @type {import('../model.js').Session} */
  const session = {
    id: path.basename(file, '.jsonl'),
    agent: 'claude-code',
    project: '',
    cwd: '',
    file,
    start: 0,
    end: 0,
    calls: [],
    prompts: [],
    badLines: 0,
  };
  /** @type {Map<string, import('../model.js').Call>} */
  const pending = new Map();
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
    const ts = d.timestamp ? Date.parse(d.timestamp) || 0 : 0;
    if (ts) {
      if (!session.start || ts < session.start) session.start = ts;
      if (ts > session.end) session.end = ts;
    }
    if (!session.cwd && typeof d.cwd === 'string') session.cwd = d.cwd;
    if (typeof d.sessionId === 'string' && d.type !== 'agent-name') session.id = d.sessionId;

    const msg = d.message;
    if (!msg || typeof msg !== 'object') continue;

    if (d.type === 'assistant' && Array.isArray(msg.content)) {
      for (const b of msg.content) {
        if (b?.type !== 'tool_use') continue;
        const input = b.input && typeof b.input === 'object' ? b.input : {};
        const kind = kindOf(b.name);
        /** @type {import('../model.js').Call} */
        const call = {
          index: session.calls.length,
          id: String(b.id),
          ts,
          tool: String(b.name),
          kind,
          ok: true,
          rejected: false,
          outChars: 0,
        };
        if (kind === 'shell' && typeof input.command === 'string') call.command = input.command;
        const p = input.file_path ?? input.path ?? input.notebook_path;
        if (typeof p === 'string') call.path = p;
        if (kind === 'edit') {
          if (typeof input.old_string === 'string') call.oldText = input.old_string;
          if (typeof input.new_string === 'string') call.newText = input.new_string;
        }
        session.calls.push(call);
        pending.set(call.id, call);
      }
    } else if (d.type === 'user') {
      if (Array.isArray(msg.content) && msg.content.some((b) => b?.type === 'tool_result')) {
        for (const b of msg.content) {
          if (b?.type !== 'tool_result') continue;
          const call = pending.get(b.tool_use_id);
          if (!call) continue;
          pending.delete(b.tool_use_id);
          const text = textOf(b.content);
          call.outChars = charsOf(b.content);
          if (ts && call.ts) call.durMs = Math.max(0, ts - call.ts);
          if (b.is_error === true) {
            call.ok = false;
            if (REJECTED_RE.test(text.slice(0, 400))) call.rejected = true;
            else call.error = firstLine(text);
          }
        }
        continue;
      }
      if (d.isMeta === true) continue;
      const raw = textOf(msg.content);
      if (/^\s*\[Request interrupted by user/.test(raw)) {
        session.prompts.push({ ts, text: raw.trim(), interrupt: true });
        continue;
      }
      const text = raw.replace(SYSTEM_BLOCK_RE, '').trim();
      if (!text || /^Caveat:/.test(text)) continue;
      session.prompts.push({ ts, text, interrupt: false });
    }
  }

  session.project = baseName(session.cwd) || baseName(path.dirname(file));
  return session;
}
