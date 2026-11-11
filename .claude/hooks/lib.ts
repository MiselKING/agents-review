// Shared helpers for the Claude Code hook scripts in this folder.
// Plain Node (no bash, jq or PowerShell), so the hooks run the same on Windows, macOS and Linux.
import { existsSync } from 'node:fs';
import path from 'node:path';

export type HookInput = Record<string, unknown>;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Reads the hook's JSON input from stdin. Returns undefined when it isn't a JSON object. */
export async function readHookInput(): Promise<HookInput | undefined> {
  let raw = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) raw += String(chunk);
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/** The file an Edit or Write call targets, if the input has one. */
export function editedFilePath(input: HookInput | undefined): string | undefined {
  const toolInput = input?.tool_input;
  if (!isRecord(toolInput)) return undefined;
  return typeof toolInput.file_path === 'string' ? toolInput.file_path : undefined;
}

/** The project root: where the Claude Code session started. */
export function projectRoot(input: HookInput | undefined): string {
  const cwd = typeof input?.cwd === 'string' ? input.cwd : undefined;
  return path.resolve(process.env.CLAUDE_PROJECT_DIR || cwd || process.cwd());
}

/**
 * The folder to run checks in. Inside a worktree the hook input's `cwd` points at the
 * worktree while the project root stays at the main checkout, so `cwd` wins when it exists.
 */
export function workingDir(input: HookInput | undefined, root: string): string {
  const cwd = input?.cwd;
  return typeof cwd === 'string' && existsSync(cwd) ? path.resolve(cwd) : root;
}

/**
 * `filePath` relative to `root`, with forward slashes on every OS.
 * Returns undefined for a path outside the root.
 */
export function relativeToRoot(filePath: string, root: string): string | undefined {
  const relative = path.relative(root, path.resolve(root, filePath));
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) return undefined;
  return relative.split(path.sep).join('/');
}
