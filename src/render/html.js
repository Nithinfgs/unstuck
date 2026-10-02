import { shortDate, num, plural, compact } from '../format.js';
import { suggestionLines } from './suggest.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
/** Escape, then turn `backticks` into <code>. Escaping first keeps it injection-safe. */
const rich = (s) => esc(s).replace(/`([^`]+)`/g, '<code class="inline">$1</code>');

const LABELS = {
  'retry-loop': 'Retry loop',
  flailing: 'Flailing',
  'edit-thrash': 'Edit thrash',
  're-read': 'Re-read',
  'output-flood': 'Output flood',
  corrections: 'Corrections',
  interrupts: 'Interrupts',
  rejected: 'Declined',
};

/**
 * Self-contained HTML report: no scripts, no network, safe to email.
 * Every string is already redacted by the detectors; we only escape here.
 * @param {import('../scan.js').ScanResult} result
 * @param {{version?: string, sinceLabel?: string, generated?: string}} opts
 */
export function renderHtml(result, { version = '', sinceLabel = '', generated = '' } = {}) {
  const { sessions, findings, patterns, stats } = result;
  const byKind = new Map();
  for (const f of findings) byKind.set(f.kind, (byKind.get(f.kind) ?? 0) + 1);
  const maxKind = Math.max(1, ...byKind.values());
  const suggestions = suggestionLines(result);
  const tokens = findings.reduce((n, f) => n + f.wastedTokens, 0);
  const calls = findings.reduce((n, f) => n + f.wastedCalls, 0);

  const rows = findings
    .slice(0, 60)
    .map(
      (f) => `<tr><td><span class="tag k-${esc(f.kind)}">${esc(LABELS[f.kind] ?? f.kind)}</span></td>
<td><strong>${rich(f.title)}</strong>${f.detail ? `<div class="sub">${rich(f.detail)}</div>` : ''}${f.evidence.filter((e) => e !== f.detail).length ? `<div class="ev">${f.evidence.filter((e) => e !== f.detail).map((e) => `<code>${esc(e)}</code>`).join('')}</div>` : ''}</td>
<td class="meta">${esc(f.project)}<br>${esc(shortDate(f.ts))}</td></tr>`,
    )
    .join('\n');

  const bars = [...byKind.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `<div class="bar"><span>${esc(LABELS[k] ?? k)}</span><i class="k-${esc(k)}" style="width:${Math.round((n / maxKind) * 100)}%"></i><b>${n}</b></div>`)
    .join('\n');

  const fixes = patterns.learnedFixes
    .slice(0, 10)
    .map((f) => `<tr><td><code class="bad">${esc(f.failed)}</code></td><td><code class="good">${esc(f.worked)}</code></td><td class="meta">${f.count}× in ${plural(f.sessions, 'session')}</td></tr>`)
    .join('\n');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>unstuck report</title>
<style>
:root{--bg:#fff;--fg:#1c1b22;--mut:#6b6a76;--line:#e6e4ee;--card:#f7f6fb;--red:#c2362c;--grn:#18794e;--ylw:#a86a00;--blu:#2f5fd0;--mag:#9a3fb0;--cyn:#0e7a8a}
@media (prefers-color-scheme:dark){:root{--bg:#14131a;--fg:#ecebf3;--mut:#9b9aa8;--line:#2a2833;--card:#1c1b25;--red:#ff7a70;--grn:#58d39a;--ylw:#f0b44c;--blu:#8aa8ff;--mag:#d58bea;--cyn:#59cfe0}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:980px;margin:0 auto;padding:32px 16px 64px}
h1{font-size:28px;margin:0}h2{font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--mut);margin:36px 0 10px}
.lead{color:var(--mut);margin:4px 0 24px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px}.card b{display:block;font-size:24px}.card span{color:var(--mut);font-size:13px}
table{width:100%;border-collapse:collapse}td{padding:10px 8px;border-top:1px solid var(--line);vertical-align:top}
.meta{color:var(--mut);font-size:13px;white-space:nowrap}.sub{color:var(--mut);font-size:13px}
.ev code,td>code{display:block;font:12.5px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--mut);overflow-wrap:anywhere;margin-top:3px}
code.inline{display:inline;font:12.5px ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--card);border:1px solid var(--line);border-radius:4px;padding:0 4px;color:inherit;margin:0}
code.bad{color:var(--red)}code.good{color:var(--grn)}
.tag{font-size:12px;font-weight:600;padding:2px 8px;border-radius:99px;border:1px solid currentColor;white-space:nowrap}
.k-retry-loop,.k-flailing{color:var(--red)}.k-edit-thrash{color:var(--ylw)}.k-re-read{color:var(--cyn)}.k-output-flood{color:var(--mag)}.k-corrections,.k-interrupts,.k-rejected{color:var(--blu)}
.bar{display:grid;grid-template-columns:120px 1fr 32px;align-items:center;gap:10px;margin:6px 0;font-size:13px}.bar i{height:10px;border-radius:5px;background:currentColor;display:block}.bar b{text-align:right}
pre{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px;overflow:auto;font-size:13px;white-space:pre-wrap}
footer{margin-top:40px;color:var(--mut);font-size:13px}
</style></head><body><main>
<h1>unstuck report</h1>
<p class="lead">${esc(plural(sessions.length, 'session'))} · ${esc(plural(stats.calls, 'tool call'))}${sinceLabel ? ` · ${esc(sinceLabel)}` : ''}. Generated locally; nothing was uploaded.</p>
<div class="cards">
<div class="card"><b>${num(findings.length)}</b><span>stuck moments</span></div>
<div class="card"><b>~${num(calls)}</b><span>tool calls involved</span></div>
<div class="card"><b>~${esc(compact(tokens))}</b><span>tokens of tool output involved</span></div>
<div class="card"><b>${num(patterns.learnedFixes.length)}</b><span>recurring fixes</span></div>
</div>
${bars ? `<h2>By kind</h2>${bars}` : ''}
<h2>Where the agent got stuck</h2>
${rows ? `<table>${rows}</table>` : '<p class="lead">Nothing found. Thresholds are conservative.</p>'}
${fixes ? `<h2>Learned fixes</h2><table><tr><td class="meta">Failed</td><td class="meta">Worked</td><td></td></tr>${fixes}</table>` : ''}
${suggestions.length ? `<h2>Suggested AGENTS.md lines</h2><pre>${esc(suggestions.join('\n'))}</pre>` : ''}
<footer>unstuck ${esc(version)} · token figures are rough estimates (4 characters ≈ 1 token) · ${esc(generated)}</footer>
</main></body></html>
`;
}
