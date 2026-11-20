// PreToolUse hook: no commit or push on `main`, and a commit only when the definition of done passes.
// Best effort, since it reads simple command lists; GitHub's rulesets and CI enforce the same rules.
import { existsSync } from 'node:fs';
import path from 'node:path';

import {
  currentBranch,
  findFailure,
  gitSubcommands,
  type HookInput,
  projectRoot,
  readChecks,
  readHookInput,
  toolCommand,
  workingDir,
} from './lib.ts';

const COMMIT_CHECKS = [
  'pnpm lint',
  'pnpm typecheck',
  'pnpm test',
  'pnpm codegen:check',
  'pnpm format:check',
];
const FIXES: Record<string, string> = {
  'pnpm codegen:check': 'Run `pnpm codegen` and include the generated files.',
  'pnpm format:check': 'Run `pnpm format`.',
};
// Below the hook's 600-second timeout in settings.json, so a slow check denies with a reason.
const CHECKS_BUDGET_MS = 540_000;

/** Why the command must not run, or undefined when it may. */
function reasonToDeny(input: HookInput | undefined): string | undefined {
  const subcommands = gitSubcommands(toolCommand(input) ?? '');
  const commits = subcommands.includes('commit');
  if (!commits && !subcommands.includes('push')) return undefined;

  const cwd = workingDir(input, projectRoot(input));
  if (currentBranch(cwd) === 'main') {
    return 'You are on `main`. AGENTS.md: always work on a branch. Run `git switch -c <type>/<issue-number>-<slug>` as its own command first.';
  }
  if (!commits) return undefined;

  if (!existsSync(path.join(cwd, 'node_modules'))) {
    return 'The checks before a commit need dependencies. Run `pnpm install`, then commit again.';
  }
  const failure = findFailure(
    readChecks('COMMIT_HOOK_CHECKS', COMMIT_CHECKS),
    cwd,
    Date.now() + CHECKS_BUDGET_MS,
  );
  if (failure === undefined) return undefined;
  const fix = FIXES[failure.check] ?? 'Fix the problems below.';
  return `Commit blocked: \`${failure.check}\` failed. ${fix} Then commit again.\n\n${failure.output}`;
}

const reason = reasonToDeny(await readHookInput());
if (reason !== undefined) {
  process.stderr.write(reason);
  process.exitCode = 2;
}
