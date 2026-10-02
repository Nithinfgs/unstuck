import { painter } from '../ansi.js';
import { stripAnsi } from '../ansi.js';
import { shortDate, num, plural, compact, pad } from '../format.js';

const LABELS = {
  'retry-loop': ['retry loop', 'red'],
  flailing: ['flailing', 'red'],
  'edit-thrash': ['edit thrash', 'yellow'],
  're-read': ['re-read', 'cyan'],
  'output-flood': ['output flood', 'magenta'],
  corrections: ['corrections', 'blue'],
  interrupts: ['interrupts', 'blue'],
  rejected: ['declined', 'blue'],
};

/** Shorten to `width` visible characters, ignoring ANSI codes. */
function fit(s, width) {
  const plain = stripAnsi(s);
  return plain.length <= width ? s : `${plain.slice(0, width - 1)}…`;
}

/**
 * @param {import('../scan.js').ScanResult} result
 * @param {{color?: boolean, top?: number, version?: string, sinceLabel?: string, width?: number, demo?: boolean}} opts
 */
export function renderTerminal(result, { color = false, top = 8, version = '', sinceLabel = '', width = 100, demo = false } = {}) {
  const c = painter(color);
  const { sessions, findings, patterns, stats } = result;
  const w = Math.max(60, Math.min(width, 110));
  const lines = [];
  const projects = new Set(sessions.map((s) => s.project));

  lines.push('');
  lines.push(`${c.bold('unstuck')} ${c.gray(version)}   ${plural(sessions.length, 'session')} · ${plural(stats.calls, 'tool call')} · ${plural(projects.size, 'project')}${sinceLabel ? ` · ${sinceLabel}` : ''}`);
  lines.push(c.gray(demo ? 'bundled demo data · read-only · nothing leaves your machine' : 'read-only · offline · nothing leaves your machine'));
  lines.push('');

  if (sessions.length === 0) {
    lines.push('No agent sessions found.');
    lines.push(c.gray('Point at logs with --path <dir>, widen the window with --since 90d, or try --demo.'));
    lines.push('');
    return lines.join('\n');
  }

  if (findings.length === 0) {
    lines.push(c.green('No stuck moments found in these sessions.'));
    lines.push(c.gray('Thresholds are conservative; see the README to tune them.'));
    lines.push('');
    return lines.join('\n');
  }

  lines.push(c.bold('WHERE YOUR AGENT GOT STUCK'));
  findings.slice(0, top).forEach((f, i) => {
    const [label, hue] = LABELS[f.kind] ?? [f.kind, 'gray'];
    const meta = `${f.project} · ${shortDate(f.ts)}`;
    const head = `${pad(String(i + 1), 2)} ${c[hue](pad(label, 13))}`;
    const room = w - 2 - 3 - 13 - meta.length - 2;
    lines.push(`${head} ${pad(fit(f.title, room), room)}  ${c.gray(meta)}`);
    const sub = f.detail || f.evidence.find((e) => e && !f.title.includes(e));
    if (sub) lines.push(`   ${c.gray('└')} ${c.gray(fit(sub, w - 6))}`);
  });
  if (findings.length > top) lines.push(c.gray(`   … ${findings.length - top} more (use --top ${findings.length} or --json)`));

  const calls = findings.reduce((n, f) => n + f.wastedCalls, 0);
  const tokens = findings.reduce((n, f) => n + f.wastedTokens, 0);
  lines.push('');
  lines.push(c.gray(`Flagged moments account for ~${num(calls)} tool calls and ~${compact(tokens)} tokens of tool output. Heuristic, not a bill.`));

  if (patterns.learnedFixes.length) {
    lines.push('');
    lines.push(c.bold('LEARNED FIXES') + c.gray('   failed, then a close variant worked, in 2+ places'));
    for (const f of patterns.learnedFixes.slice(0, 5)) {
      const where = f.sessions > 1 ? `${f.count}× in ${f.sessions} sessions` : `${f.count}× in 1 session`;
      const col = Math.floor((w - 12 - where.length) / 2);
      lines.push(`  ${c.red('✗')} ${pad(fit(f.failed, col), col)} ${c.gray('→')} ${c.green('✓')} ${pad(fit(f.worked, col), col)}  ${c.gray(where)}`);
    }
  }
  if (patterns.repeatedCorrections.length) {
    lines.push('');
    lines.push(c.bold('YOU KEEP SAYING') + c.gray('   candidates for a rule'));
    for (const r of patterns.repeatedCorrections.slice(0, 4)) {
      lines.push(`  “${fit(r.text, w - 24)}”  ${c.gray(`${r.count}×`)}`);
    }
  }
  if (patterns.outputHogs.length) {
    lines.push('');
    lines.push(c.bold('BIGGEST OUTPUT HOGS'));
    for (const h of patterns.outputHogs.slice(0, 3)) {
      lines.push(`  ${pad(fit(h.command, 30), 30)} ~${compact(h.tokens)} tokens over ${plural(h.calls, 'call')}`);
    }
  }

  lines.push('');
  lines.push(c.gray(`Next: ${c.cyan('unstuck suggest')} for AGENTS.md lines · ${c.cyan('unstuck report')} for a shareable HTML page`));
  lines.push('');
  return lines.join('\n');
}
