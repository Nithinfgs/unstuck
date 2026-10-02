const CODES = { reset: 0, bold: 1, dim: 2, red: 31, green: 32, yellow: 33, blue: 34, magenta: 35, cyan: 36, gray: 90 };

/**
 * Tiny ANSI helper. Honors NO_COLOR and non-TTY output.
 * @param {boolean} enabled
 */
export function painter(enabled) {
  /** @type {Record<string, (s: string) => string>} */
  const p = {};
  for (const [name, code] of Object.entries(CODES)) {
    p[name] = enabled ? (s) => `\u001b[${code}m${s}\u001b[0m` : (s) => s;
  }
  return p;
}

/** @param {{noColor?: boolean, force?: boolean}} flags */
export function shouldColor({ noColor = false, force = false } = {}) {
  if (noColor || process.env.NO_COLOR) return false;
  if (force || process.env.FORCE_COLOR) return true;
  return Boolean(process.stdout.isTTY);
}

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\u001b\[[0-9;]*m/g;
export const stripAnsi = (s) => s.replace(ANSI_RE, '');
