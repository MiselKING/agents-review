// PostToolUse hook for Edit and Write: lints the edited .ts or .tsx file with Oxlint and
// reports problems back to Claude. Exit code 2 is how a PostToolUse hook shows stderr to Claude.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { editedFilePath, projectRoot, readHookInput, relativeToRoot, workingDir } from './lib.ts';

const OXLINT_ENTRY = 'node_modules/oxlint/bin/oxlint';

/** Oxlint's output when the edited file has problems, or undefined when there's nothing to report. */
async function lintEditedFile(): Promise<string | undefined> {
  const input = await readHookInput();
  const filePath = editedFilePath(input);
  if (filePath === undefined) return undefined;

  const root = projectRoot(input);
  const relativePath = relativeToRoot(filePath, root);
  if (relativePath === undefined || !/\.tsx?$/i.test(relativePath)) return undefined;

  const file = path.resolve(root, relativePath);
  if (!existsSync(file)) return undefined;

  // Same Oxlint as `pnpm lint`. Skip quietly before `pnpm install`: a fresh clone must stay editable.
  const cwd = workingDir(input, root);
  const oxlint = [cwd, root]
    .map((dir) => path.join(dir, OXLINT_ENTRY))
    .find((entry) => existsSync(entry));
  if (oxlint === undefined) return undefined;

  // Started through Node with no shell, so there's no .cmd shim or quoting difference on Windows.
  const result = spawnSync(process.execPath, [oxlint, file], { cwd, encoding: 'utf8' });
  if (result.error !== undefined || result.status === null || result.status === 0) return undefined;

  return `Oxlint found problems in ${relativePath}. Fix them before moving on.\n\n${result.stdout}${result.stderr}`;
}

const problems = await lintEditedFile();
if (problems !== undefined) {
  process.stderr.write(problems);
  process.exitCode = 2;
}
