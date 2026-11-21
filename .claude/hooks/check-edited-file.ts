// PostToolUse hook for Edit and Write: formats the edited file with oxfmt, then lints a .ts or .tsx
// file with Oxlint. One script, because hooks for the same event run in parallel.
// Exit code 2 is how a PostToolUse hook shows stderr to Claude.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { editedFilePath, projectRoot, readHookInput, relativeToRoot, workingDir } from './lib.ts';

/** A tool's entry script from node_modules, looked up in the working folder, then the root. */
function findTool(entry: string, dirs: string[]): string | undefined {
  return dirs.map((dir) => path.join(dir, 'node_modules', entry)).find((file) => existsSync(file));
}

/** Oxlint's output when the edited file has problems, or undefined when there's nothing to report. */
async function checkEditedFile(): Promise<string | undefined> {
  const input = await readHookInput();
  const filePath = editedFilePath(input);
  if (filePath === undefined) return undefined;

  const root = projectRoot(input);
  const relativePath = relativeToRoot(filePath, root);
  if (relativePath === undefined) return undefined;

  const file = path.resolve(root, relativePath);
  if (!existsSync(file)) return undefined;

  // Same tools as `pnpm format` and `pnpm lint`. Skip quietly before `pnpm install`: a fresh clone must stay editable.
  // Started through Node with no shell, so there's no .cmd shim or quoting difference on Windows.
  const cwd = workingDir(input, root);
  const oxfmt = findTool('oxfmt/bin/oxfmt', [cwd, root]);
  // oxfmt skips ignored and unknown files itself; a file it can't parse is left to lint and the checks.
  if (oxfmt !== undefined) {
    spawnSync(process.execPath, [oxfmt, '--no-error-on-unmatched-pattern', file], { cwd });
  }

  if (!/\.tsx?$/i.test(relativePath)) return undefined;
  const oxlint = findTool('oxlint/bin/oxlint', [cwd, root]);
  if (oxlint === undefined) return undefined;

  const result = spawnSync(process.execPath, [oxlint, file], { cwd, encoding: 'utf8' });
  if (result.error !== undefined || result.status === null || result.status === 0) return undefined;

  return `Oxlint found problems in ${relativePath}. Fix them before moving on.\n\n${result.stdout}${result.stderr}`;
}

const problems = await checkEditedFile();
if (problems !== undefined) {
  process.stderr.write(problems);
  process.exitCode = 2;
}
