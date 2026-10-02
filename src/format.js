const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Sep 28" in UTC so output is stable across machines. */
export function shortDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export function num(n) {
  return Math.round(n).toLocaleString('en-US');
}

export function plural(n, word) {
  return `${num(n)} ${word}${n === 1 ? '' : 's'}`;
}

/** Compact token count: 1.2k, 38k, 1.4M. */
export function compact(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e4) return `${Math.round(n / 1e3)}k`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(Math.round(n));
}

export function pad(s, n) {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}
