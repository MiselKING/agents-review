// PreToolUse hook for Edit, Write and NotebookEdit: while `.test-lock` exists, Claude fixes the code, not the test.
// The fix-bug skill creates and removes the lock. Bash can still change files; review is the backstop for that.
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

import {
  currentBranch,
  editedFilePath,
  projectRoot,
  readHookInput,
  relativeToRoot,
  repoRoot,
  workingDir,
} from './lib.ts';

const LOCK = '.test-lock';

// Tests, the helpers they share, and the configs and scripts that decide which tests run.
const LOCKED_FILES = [
  /\.test\.tsx?$/i,
  /^apps\/web\/e2e\//i,
  /(^|\/)src\/test\//i,
  /(^|\/)vitest[^/]*\.config\.ts$/i,
  /(^|\/)playwright\.config\.ts$/i,
  /(^|\/)package\.json$/i,
  /^turbo\.json$/i,
];

/** The lock's branch: '' when the file is empty or unreadable, which still locks. */
function readLock(file: string): string {
  try {
    return readFileSync(file, 'utf8').trim();
  } catch {
    return '';
  }
}

/**
 * `file` relative to the checkout, as Claude named it. git resolves symlinks in the top folder (macOS's
 * /var is one), so the nearest folder above `file` that resolves to `root` is where the path starts.
 */
function pathInCheckout(file: string, root: string): string | undefined {
  for (let dir = path.dirname(file); ; dir = path.dirname(dir)) {
    if (existsSync(dir) && realpathSync.native(dir) === root) return relativeToRoot(file, dir);
    if (path.dirname(dir) === dir) return undefined;
  }
}

/** Why the edit is refused, or undefined to let it through. */
async function denyReason(): Promise<string | undefined> {
  const input = await readHookInput();
  if (input === undefined || (input.hook_event_name ?? 'PreToolUse') !== 'PreToolUse') {
    return undefined;
  }
  const filePath = editedFilePath(input);
  if (filePath === undefined) return undefined;

  // The checkout's top folder, also when Claude's shell is in a package folder or a worktree.
  const root = realpathSync.native(repoRoot(workingDir(input, projectRoot(input))));
  const lockFile = path.join(root, LOCK);
  if (!existsSync(lockFile)) return undefined;

  // A lock left behind on another branch doesn't block later work. In detached HEAD (a rebase or bisect) it still locks.
  const branch = readLock(lockFile);
  const head = currentBranch(root);
  if (branch !== '' && head !== '' && branch !== head) return undefined;

  const relativePath = pathInCheckout(path.resolve(root, filePath), root);
  if (relativePath === undefined) return undefined;

  const lockedOn = branch === '' ? 'an empty lock' : `branch \`${branch}\``;
  // Otherwise Claude could unlock itself by writing another branch name into the lock.
  if (relativePath.toLowerCase() === LOCK) {
    return `\`${LOCK}\` can't be changed while it exists (${lockedOn}). Delete it with \`rm ${LOCK}\` once the fix passes its test.`;
  }
  if (!LOCKED_FILES.some((pattern) => pattern.test(relativePath))) return undefined;

  return (
    `\`${relativePath}\` is locked while you fix a bug (\`${LOCK}\`, ${lockedOn}): tests, their helpers and the configs and scripts that run them can't change. ` +
    `Fix the code, not the test. If the test itself is wrong, or the fix needs this file, stop and ask the user; don't remove the lock to get around this. ` +
    `To unlock, delete \`${LOCK}\` in the repo root.`
  );
}

const reason = await denyReason();
if (reason !== undefined) {
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }),
  );
}
