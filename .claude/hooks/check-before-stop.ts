// Stop hook: Claude can't finish a turn while lint or typecheck fails.
// Stateless, with one forced fix round, so it can never loop:
//   - checks fail, first time: exit 2 with the errors, and Claude keeps working
//   - checks still fail in that forced round (`stop_hook_active`): let Claude stop, with a warning
// Tests and codegen don't run here: Stop fires after every reply, also mid-task, when a failing test
// can be on purpose. check-git-command.ts runs them before a commit, and CI runs them on every PR.
import { existsSync } from 'node:fs';
import path from 'node:path';

import { findFailure, hasChanges, projectRoot, readChecks, readHookInput, workingDir } from './lib.ts';

const input = await readHookInput();
const isStopEvent = input !== undefined && (input.hook_event_name ?? 'Stop') === 'Stop';
const cwd = workingDir(input, projectRoot(input));

// Nothing to check for other events, before `pnpm install`, or when nothing changed.
const failure =
  isStopEvent && existsSync(path.join(cwd, 'node_modules')) && hasChanges(cwd)
    ? findFailure(readChecks('STOP_HOOK_CHECKS', ['pnpm lint', 'pnpm typecheck']), cwd)
    : undefined;

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
