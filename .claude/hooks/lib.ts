// Shared helpers for the Claude Code hook scripts in this folder.
// Plain Node (no bash, jq or PowerShell), so the hooks run the same on Windows, macOS and Linux.
import { spawnSync } from 'node:child_process';
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

/** The shell command of a Bash or PowerShell call, if the input has one. */
export function toolCommand(input: HookInput | undefined): string | undefined {
  const toolInput = input?.tool_input;
  if (!isRecord(toolInput)) return undefined;
  return typeof toolInput.command === 'string' ? toolInput.command : undefined;
}

const GIT_OPTIONS_WITH_VALUE = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace']);
const COMMAND_PREFIXES = new Set(['sudo', 'env', 'command', 'exec', 'time', 'nohup', '&']);

/**
 * The git subcommands a shell command runs, such as `commit` for `cd x && git -C y commit -m z`.
 * Best effort: it reads simple command lists, not every shell construct.
 */
export function gitSubcommands(command: string): string[] {
  const found: string[] = [];
  for (const segment of command.split(/&&|\|\||[;|\n]/)) {
    const words = segment
      .trim()
      .split(/\s+/)
      .map((word) => word.replace(/^[({`$]+|[)}`]+$/g, ''));
    const at = (index: number) => words[index] ?? '';
    let i = 0;
    while (COMMAND_PREFIXES.has(at(i)) || /^\w+=/.test(at(i))) i++;
    if (!/(^|[\\/])git(\.exe)?$/i.test(at(i))) continue;
    i++;
    while (at(i).startsWith('-')) i += GIT_OPTIONS_WITH_VALUE.has(at(i)) ? 2 : 1;
    if (at(i) !== '') found.push(at(i));
  }
  return found;
}

/** The checked-out branch, or undefined outside a repository or on a detached HEAD. */
export function currentBranch(cwd: string): string | undefined {
  const result = spawnSync('git', ['branch', '--show-current'], { cwd, encoding: 'utf8' });
  const branch = result.status === 0 ? result.stdout.trim() : '';
  return branch === '' ? undefined : branch;
}

/** Whether the working tree has changes. True when git can't tell, so checks still run. */
export function hasChanges(cwd: string): boolean {
  const result = spawnSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf8' });
  return result.status !== 0 || result.stdout.trim() !== '';
}

/** The checks to run: `defaults`, or a JSON array from `envName`, which the hook tests set. */
export function readChecks(envName: string, defaults: string[]): string[] {
  const override = process.env[envName];
  if (!override) return defaults;
  const checks: unknown = JSON.parse(override);
  if (!Array.isArray(checks)) throw new TypeError(`${envName} must be a JSON array`);
  return checks.map(String);
}

export type Failure = { check: string; output: string };

const MAX_OUTPUT_CHARS = 4000;

/** Runs the checks in order and returns the first one that fails, or that runs past `deadline`. */
export function findFailure(
  checks: string[],
  cwd: string,
  deadline = Number.POSITIVE_INFINITY,
): Failure | undefined {
  for (const check of checks) {
    const timeout = deadline - Date.now();
    if (timeout <= 0) return { check, output: 'Not run: the time for the checks ran out.' };
    // Fixed command strings, so running them through the platform's shell is safe. The shell
    // finds `pnpm` on Linux and macOS and `pnpm.cmd` on Windows.
    const result = spawnSync(check, {
      cwd,
      shell: true,
      encoding: 'utf8',
      timeout: Number.isFinite(timeout) ? timeout : undefined,
    });
    if (result.status !== 0) {
      const output = `${result.stdout}${result.stderr}${result.error?.message ?? ''}`;
      return { check, output: output.slice(-MAX_OUTPUT_CHARS) };
    }
  }
  return undefined;
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
