# Writing an adapter

An adapter turns one agent's log format into unstuck's normalized `Session`
(see `src/model.js`). Two ways to add one:

## Option A: convert to "unstuck JSONL" (no code in this repo)

Write a small script that emits one JSON object per line. unstuck sniffs the format
automatically.

```jsonl
{"type":"session","id":"s1","agent":"my-agent","cwd":"/work/app"}
{"type":"prompt","ts":"2026-09-01T10:00:00Z","text":"fix the build"}
{"type":"call","ts":"2026-09-01T10:00:01Z","tool":"Bash","input":{"command":"npm test"},"ok":false,"error":"Missing script: test","outChars":120}
{"type":"call","ts":"2026-09-01T10:00:09Z","tool":"Edit","input":{"file_path":"/work/app/a.ts","old_string":"a","new_string":"b"},"ok":true,"outChars":30}
```

| Field | Meaning |
| --- | --- |
| `session.cwd` | Project directory; its basename becomes the project name |
| `prompt.interrupt` | `true` if the user interrupted the agent |
| `call.tool` | Tool name. `Bash`/`shell`/`exec_command` are treated as shell, `Read`, `Edit`, `Write`, `Grep`… are recognised (see `kindOf`) |
| `call.ok` | `false` if the tool reported an error |
| `call.rejected` | `true` if the user declined the call |
| `call.error` | First line of the error text |
| `call.outChars` | Size of the tool result in characters |

Then run `unstuck --path ./converted`.

## Option B: native adapter

Create `src/adapters/<agent>.js` exporting:

```js
export function sniff(firstLines /* string[] */) { /* true if this is your format */ }
export async function parse(file) { /* → Session */ }
```

and register it in `src/adapters/index.js`. Guidelines:

- Stream the file line by line; transcripts can be hundreds of MB.
- Never keep tool output; store only its length.
- Tolerate unknown and corrupt lines (count them in `badLines`).
- Keep `sniff` strict so adapters do not claim each other's files.
- Add a fixture under `tests/` with a handful of lines, never a real transcript.

Wanted next: Codex CLI, OpenCode, Gemini CLI, Aider.
