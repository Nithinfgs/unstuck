import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { scan } from './scan.js';
import { defaultRoots, parseSince } from './discover.js';
import { shouldColor } from './ansi.js';
import { renderTerminal } from './render/terminal.js';
import { renderHtml } from './render/html.js';
import { renderJson } from './render/json.js';
import { renderSuggest, appendBlock } from './render/suggest.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'package.json'), 'utf8'));
export const DEMO_DIR = path.join(HERE, '..', 'examples', 'sessions');

const HELP = `unstuck ${PKG.version}: find where your coding agent got stuck

Usage
  unstuck [scan]            Summarize stuck moments in recent sessions (default)
  unstuck suggest           Print AGENTS.md / CLAUDE.md lines learned from recurring problems
  unstuck report            Write a self-contained HTML report (default: unstuck-report.html)

Options
  --demo                    Use the bundled sample sessions instead of your own logs
  --path <dir|file>         Transcript location (repeatable). Default: ~/.claude/projects
  --since <window>          30d (default), 12h, 2w or a date like 2026-09-01
  --project <text>          Only sessions whose project path contains <text>
  --top <n>                 Findings to list (default 8)
  --json                    Machine-readable output
  -o, --out <file>          Output file for "report"
  --append <file>           For "suggest": insert/update the block in a markdown file
  --no-color                Disable colors (also honors NO_COLOR)
  -v, --version             Print version
  -h, --help                Show this help

unstuck reads files only. It never writes to your logs and makes no network calls.
`;

const errMessage = (e) => (e instanceof Error ? e.message : String(e));

/**
 * @param {string[]} argv
 * @param {{stdout?: {write(s: string): unknown}, stderr?: {write(s: string): unknown}}} [io]
 * @returns {Promise<number>} exit code
 */
export async function main(argv, io = {}) {
  const out = io.stdout ?? process.stdout;
  const err = io.stderr ?? process.stderr;

  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        demo: { type: 'boolean' },
        path: { type: 'string', multiple: true },
        since: { type: 'string', default: '30d' },
        project: { type: 'string' },
        top: { type: 'string', default: '8' },
        json: { type: 'boolean' },
        out: { type: 'string', short: 'o' },
        append: { type: 'string' },
        'no-color': { type: 'boolean' },
        version: { type: 'boolean', short: 'v' },
        help: { type: 'boolean', short: 'h' },
      },
    });
  } catch (e) {
    err.write(`unstuck: ${errMessage(e)}\n\n${HELP}`);
    return 2;
  }
  const { values, positionals } = parsed;
  if (values.help) {
    out.write(HELP);
    return 0;
  }
  if (values.version) {
    out.write(`${PKG.version}\n`);
    return 0;
  }

  const command = positionals[0] ?? 'scan';
  if (!['scan', 'suggest', 'report'].includes(command)) {
    err.write(`unstuck: unknown command "${command}"\n\n${HELP}`);
    return 2;
  }
  const top = Number.parseInt(values.top, 10);
  if (!Number.isInteger(top) || top < 1) {
    err.write('unstuck: --top must be a positive integer\n');
    return 2;
  }

  let sinceMs;
  try {
    sinceMs = values.demo ? 0 : parseSince(values.since);
  } catch (e) {
    err.write(`unstuck: ${errMessage(e)}\n`);
    return 2;
  }

  const roots = values.demo ? [DEMO_DIR] : (values.path ?? defaultRoots());
  if (!values.demo && roots.length === 0) {
    err.write('unstuck: no Claude Code logs found at ~/.claude/projects.\nUse --path <dir> to point at transcripts, or try --demo to see it on sample data.\n');
    return 1;
  }
  for (const r of roots) {
    if (!fs.existsSync(r)) {
      err.write(`unstuck: path not found: ${r}\n`);
      return 1;
    }
  }

  const result = await scan({ roots, sinceMs, project: values.project });
  const sinceLabel = values.demo ? '' : `last ${values.since}`;

  if (values.json) {
    out.write(renderJson(result, { version: PKG.version }));
    return 0;
  }

  if (command === 'suggest') {
    const block = renderSuggest(result);
    if (values.append) {
      if (!block.startsWith('<!--')) {
        out.write(block);
        return 0;
      }
      appendBlock(values.append, block);
      out.write(`Updated ${values.append}. Review the diff before committing.\n`);
    } else {
      out.write(block);
    }
    return 0;
  }

  if (command === 'report') {
    const file = values.out ?? 'unstuck-report.html';
    fs.writeFileSync(file, renderHtml(result, { version: PKG.version, sinceLabel, generated: new Date().toISOString().slice(0, 10) }));
    out.write(`Wrote ${file} (${result.findings.length} findings, ${result.sessions.length} sessions). Open it in a browser; it has no scripts and loads nothing.\n`);
    return 0;
  }

  const color = shouldColor({ noColor: values['no-color'] });
  out.write(renderTerminal(result, { color, top, version: PKG.version, sinceLabel, width: process.stdout.columns || 100, demo: Boolean(values.demo) }));
  return 0;
}
