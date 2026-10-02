/**
 * Normalized session model shared by every adapter and detector.
 *
 * @typedef {'shell'|'read'|'edit'|'write'|'search'|'web'|'other'} CallKind
 *
 * @typedef {object} Call
 * @property {number} index        Position within the session (0-based)
 * @property {string} id
 * @property {number} ts           Epoch ms, 0 if unknown
 * @property {string} tool         Tool name as the agent reported it
 * @property {CallKind} kind
 * @property {string} [command]    Shell command (kind === 'shell')
 * @property {string} [path]       Target file (read/edit/write)
 * @property {string} [oldText]    Edit: text being replaced
 * @property {string} [newText]    Edit: replacement text
 * @property {boolean} ok          False if the tool reported an error
 * @property {boolean} rejected    True if the user declined the call
 * @property {string} [error]      First line of the error output
 * @property {number} outChars     Size of the tool result in characters
 * @property {number} [durMs]      Time between call and result
 *
 * @typedef {object} Prompt
 * @property {number} ts
 * @property {string} text
 * @property {boolean} interrupt   User pressed Esc / interrupted the agent
 *
 * @typedef {object} Session
 * @property {string} id
 * @property {string} agent
 * @property {string} project      Short project name (basename of cwd)
 * @property {string} cwd
 * @property {string} file
 * @property {number} start
 * @property {number} end
 * @property {Call[]} calls
 * @property {Prompt[]} prompts
 * @property {number} badLines     Lines that could not be parsed
 */

/** @type {Record<string, CallKind>} */
const KIND_BY_TOOL = {
  bash: 'shell',
  shell: 'shell',
  exec_command: 'shell',
  run_shell_command: 'shell',
  read: 'read',
  view: 'read',
  read_file: 'read',
  edit: 'edit',
  multiedit: 'edit',
  notebookedit: 'edit',
  str_replace_editor: 'edit',
  str_replace: 'edit',
  write: 'write',
  write_file: 'write',
  grep: 'search',
  glob: 'search',
  ls: 'search',
  webfetch: 'web',
  websearch: 'web',
};

/** @param {string} tool @returns {CallKind} */
export function kindOf(tool) {
  return KIND_BY_TOOL[String(tool).toLowerCase()] ?? 'other';
}

/** Rough token estimate: ~4 characters per token. */
export function approxTokens(chars) {
  return Math.round(chars / 4);
}

/**
 * Reduce a shell command to a stable signature so that retries that differ
 * only in volatile details (cd prefix, numbers, output trimming) group together.
 * @param {string} cmd
 */
export function normalizeCommand(cmd) {
  let c = String(cmd).trim();
  c = c.replace(/^cd\s+("[^"]*"|'[^']*'|\S+)\s*(?:&&|;|\n)\s*/, '');
  c = c.replace(/\s*2>&1/g, '');
  c = c.replace(/\s*\|\s*(tail|head)\b[^|]*$/, '');
  c = c.replace(/\s+/g, ' ');
  c = c.replace(/\b\d{6,}\b/g, 'N');
  return c.length > 140 ? `${c.slice(0, 140)}…` : c;
}

/**
 * Stable key for "the same action".
 * @param {Call} call
 */
export function signature(call) {
  switch (call.kind) {
    case 'shell':
      return `sh:${normalizeCommand(call.command ?? '')}`;
    case 'read':
    case 'edit':
    case 'write':
      return `${call.kind}:${call.path ?? ''}`;
    default:
      return `${call.tool}`;
  }
}

/** First word(s) of a command, ignoring env assignments, for display/grouping. */
export function commandHead(cmd) {
  const toks = normalizeCommand(cmd).split(' ').filter((t) => !/^\w+=/.test(t));
  const [first = '', second = ''] = toks;
  const isSubcommand = second && !/^-|[/.:=~]/.test(second);
  return isSubcommand ? `${first} ${second}` : first;
}

/** Basename that works for both POSIX and Windows paths. */
export function baseName(p) {
  const parts = String(p).split(/[\\/]+/).filter(Boolean);
  return parts[parts.length - 1] ?? '';
}

/** First two whitespace-separated tokens of a command, flags included (e.g. "rm -rf"). */
export function commandPrefix(cmd) {
  return normalizeCommand(cmd).split(' ').slice(0, 2).join(' ');
}
