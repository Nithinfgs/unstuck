#!/usr/bin/env node
/**
 * Renders the real CLI output on the bundled demo sessions into an SVG
 * terminal screenshot for the README:
 *
 *   node scripts/render-svg.js
 *
 * The text is produced by the same renderer the CLI uses, so the image
 * cannot drift from what users actually see.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scan } from '../src/scan.js';
import { renderTerminal } from '../src/render/terminal.js';
import { renderSuggest } from '../src/render/suggest.js';
import { DEMO_DIR } from '../src/cli.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

const COLORS = { 31: '#ff7b72', 32: '#7ee787', 33: '#e3b341', 34: '#79c0ff', 35: '#d2a8ff', 36: '#56d4dd', 90: '#8b949e' };
const FG = '#e6edf3';
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* eslint-disable no-control-regex -- ANSI escape sequences are the input format here */
/** @param {string} line */
function spans(line) {
  const out = [];
  let fill = FG;
  let bold = false;
  let dim = false;
  for (const part of line.split(/(\u001b\[\d+m)/)) {
    const m = /^\u001b\[(\d+)m$/.exec(part);
    if (m) {
      const code = Number(m[1]);
      if (code === 0) [fill, bold, dim] = [FG, false, false];
      else if (code === 1) bold = true;
      else if (code === 2) dim = true;
      else if (COLORS[code]) fill = COLORS[code];
    } else if (part) {
      out.push(`<tspan fill="${fill}"${bold ? ' font-weight="700"' : ''}${dim ? ' opacity=".7"' : ''}>${esc(part)}</tspan>`);
    }
  }
  return out.join('');
}

/* eslint-enable no-control-regex */

function svg(title, command, text, cols) {
  const lines = text.replace(/^\n+|\n+$/g, '').split('\n');
  const lh = 20;
  const cw = 8.4;
  const padX = 24;
  const top = 58;
  const width = Math.round(cols * cw + padX * 2);
  const height = top + (lines.length + 2) * lh + 22;
  const body = lines.map((l, i) => `<text x="${padX}" y="${top + (i + 2) * lh}" xml:space="preserve">${spans(l)}</text>`).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(title)}">
<title>${esc(title)}</title>
<rect width="${width}" height="${height}" rx="12" fill="#0d1117"/>
<rect width="${width}" height="36" rx="12" fill="#161b22"/><rect y="24" width="${width}" height="12" fill="#161b22"/>
<circle cx="22" cy="18" r="6" fill="#ff5f56"/><circle cx="42" cy="18" r="6" fill="#ffbd2e"/><circle cx="62" cy="18" r="6" fill="#27c93f"/>
<text x="${width / 2}" y="22" fill="#8b949e" font-size="12" text-anchor="middle" font-family="system-ui,sans-serif">${esc(title)}</text>
<g font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,'DejaVu Sans Mono',monospace" font-size="14">
<text x="${padX}" y="${top}" fill="${FG}"><tspan fill="#7ee787">$</tspan> ${esc(command)}</text>
${body}
</g></svg>
`;
}

const result = await scan({ roots: [DEMO_DIR] });
const cols = 100;
const demo = renderTerminal(result, { color: true, top: 5, version: PKG.version, width: cols, demo: true });
fs.mkdirSync(path.join(ROOT, 'docs', 'assets'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'docs', 'assets', 'demo.svg'), svg('unstuck: demo', 'npx unstuck --demo', demo, cols));

const suggest = renderSuggest(result).replace(/\n$/, '').split('\n').map((l) => (l.startsWith('<!--') ? `\u001b[90m${l}\u001b[0m` : l.startsWith('##') ? `\u001b[1m${l}\u001b[0m` : l.startsWith('- ') ? l.replace(/`([^`]+)`/g, '\u001b[36m$1\u001b[0m') : l)).join('\n');
fs.writeFileSync(path.join(ROOT, 'docs', 'assets', 'suggest.svg'), svg('unstuck suggest', 'npx unstuck suggest', suggest, 118));
console.log('wrote docs/assets/demo.svg and suggest.svg');
