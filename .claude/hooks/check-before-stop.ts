// Stop hook: Claude can't finish a turn while lint or typecheck fails.
// Stateless, with one forced fix round, so it can never loop:
//   - checks fail, first time: exit 2 with the errors, and Claude keeps working
//   - checks still fail in that forced round (`stop_hook_active`): let Claude stop, with a warning
// The test suite is not run here; it would slow every turn. CI runs it.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { projectRoot, readHookInput, workingDir } from './lib.ts';

const DEFAULT_CHECKS = ['pnpm lint', 'pnpm typecheck'];
const MAX_OUTPUT_CHARS = 4000;

/** The hook tests replace the checks with fake commands through this variable. */
function readChecks(): string[] {
  const override = process.env.STOP_HOOK_CHECKS;
  if (!override) return DEFAULT_CHECKS;
  const checks: unknown = JSON.parse(override);
  if (!Array.isArray(checks)) throw new TypeError('STOP_HOOK_CHECKS must be a JSON array');
  return checks.map(String);
}

type Failure = { check: string; output: string };

/** Runs the checks in order and returns the first one that fails. */
function findFailure(cwd: string): Failure | undefined {
  for (const check of readChecks()) {
    // Fixed command strings, so running them through the platform's shell is safe. The shell
    // finds `pnpm` on Linux and macOS and `pnpm.cmd` on Windows.
    const result = spawnSync(check, { cwd, shell: true, encoding: 'utf8' });
    if (result.status !== 0) {
      const output = `${result.stdout}${result.stderr}${result.error?.message ?? ''}`;
      return { check, output: output.slice(-MAX_OUTPUT_CHARS) };
    }
  }
  return undefined;
}

const input = await readHookInput();
const isStopEvent = input !== undefined && (input.hook_event_name ?? 'Stop') === 'Stop';
const cwd = workingDir(input, projectRoot(input));

// Nothing to check for other events, or before `pnpm install`.
const failure =
  isStopEvent && existsSync(path.join(cwd, 'node_modules')) ? findFailure(cwd) : undefined;

if (failure !== undefined) {
  if (input?.stop_hook_active === true) {
    console.log(
      JSON.stringify({
        systemMessage: `\`${failure.check}\` still fails. Claude was sent back once to fix it and stopped without a passing run.`,
      }),
    );
  } else {
    process.stderr.write(
      `\`${failure.check}\` failed. Fix the problems below before finishing.\n\n${failure.output}`,
    );
    process.exitCode = 2;
  }
}
