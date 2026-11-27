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

// Tests, the helpers they share, and the configs that decide which tests run.
const TEST_FILES = [
  /\.test\.tsx?$/i,
  /^apps\/web\/e2e\//i,
  /(^|\/)src\/test\//i,
  /(^|\/)vitest[^/]*\.config\.ts$/i,
  /(^|\/)playwright\.config\.ts$/i,
];

/** The lock's branch: '' when the file is empty or unreadable, which still locks. */
function readLock(file: string): string {
  try {
    return readFileSync(file, 'utf8').trim();
  } catch {
    return '';
  }
}

/** `file` with symlinks resolved, as git resolves the top folder. A new file doesn't exist yet, so its nearest existing folder is resolved. */
function resolvePath(file: string, root: string): string {
  let existing = path.resolve(root, file);
  const rest: string[] = [];
  while (!existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) return path.resolve(root, file);
    rest.unshift(path.basename(existing));
    existing = parent;
  }
  return path.join(realpathSync.native(existing), ...rest);
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

  const relativePath = relativeToRoot(resolvePath(filePath, root), root);
  if (relativePath === undefined) return undefined;

  const lockedOn = branch === '' ? 'an empty lock' : `branch \`${branch}\``;
  // Otherwise Claude could unlock itself by writing another branch name into the lock.
  if (relativePath.toLowerCase() === LOCK) {
    return `\`${LOCK}\` can't be changed while it exists (${lockedOn}). Delete it with \`rm ${LOCK}\` once the fix passes its test.`;
  }
  if (!TEST_FILES.some((pattern) => pattern.test(relativePath))) return undefined;

  return (
    `\`${relativePath}\` is a test file, and test files are locked while you fix a bug (\`${LOCK}\`, ${lockedOn}). ` +
    `Fix the code, not the test. If the test itself is wrong, stop and ask the user; don't remove the lock to get around this. ` +
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
