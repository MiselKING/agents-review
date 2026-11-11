// PreToolUse hook for Edit and Write: asks before agent config is edited.
// In a session the user gets a prompt; in a `claude -p` run nobody can answer, so the edit
// is denied and Claude reads the reason. Overlaps the `ask` rules in settings.json on
// purpose, as a second layer.
import { editedFilePath, projectRoot, readHookInput, relativeToRoot } from './lib.ts';

/** True for AGENTS.md and CLAUDE.md at any depth, the root REVIEW.md, and anything in .claude/. */
function isProtected(relativePath: string): boolean {
  // Windows and default macOS file systems ignore case, so match that way everywhere.
  const lower = relativePath.toLowerCase();
  const name = lower.slice(lower.lastIndexOf('/') + 1);
  return (
    name === 'agents.md' ||
    name === 'claude.md' ||
    lower === 'review.md' ||
    lower.startsWith('.claude/')
  );
}

const input = await readHookInput();
const filePath = editedFilePath(input);

if (filePath !== undefined) {
  const relativePath = relativeToRoot(filePath, projectRoot(input));
  if (relativePath !== undefined && isProtected(relativePath)) {
    console.log(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'ask',
          permissionDecisionReason: `${relativePath} is agent config. Edit it only when the user asked for this change.`,
        },
      }),
    );
  }
}
