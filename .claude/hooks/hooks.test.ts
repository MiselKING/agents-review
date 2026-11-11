// Tests for the hook scripts. Run with `pnpm test:hooks` (Node's built-in test runner).
// Each test starts a script the way Claude Code does: JSON on stdin, then exit code and output.
/* oxlint-disable typescript/no-floating-promises -- node:test's describe() and it() return promises that the test runner itself awaits */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { isRecord } from './lib.ts';

const hooksDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(hooksDir, '../..');

type HookResult = { status: number | null; stdout: string; stderr: string };
const SILENT: HookResult = { status: 0, stdout: '', stderr: '' };

function runHook(script: string, input: unknown, env: Record<string, string> = {}): HookResult {
  const result = spawnSync(process.execPath, [path.join(hooksDir, script)], {
    input: typeof input === 'string' ? input : JSON.stringify(input),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: root, ...env },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function parseObject(json: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(json);
  assert.ok(isRecord(parsed), `expected a JSON object, got: ${json}`);
  return parsed;
}

const editOf = (filePath: string) => ({
  hook_event_name: 'PreToolUse',
  tool_name: 'Edit',
  cwd: root,
  tool_input: { file_path: filePath },
});

describe('protect-files', () => {
  const protectedPaths = [
    'AGENTS.md',
    'apps/web/CLAUDE.md',
    'REVIEW.md',
    '.claude/settings.json',
    'agents.md',
    // Absolute, in this OS's own format (backslashes on Windows).
    path.join(root, 'apps', 'web', 'AGENTS.md'),
    // Absolute with forward slashes, as some tools send on Windows too.
    `${root.split(path.sep).join('/')}/.claude/hooks/lib.ts`,
  ];

  for (const filePath of protectedPaths) {
    it(`asks before an edit to ${filePath}`, () => {
      const { status, stdout } = runHook('protect-files.ts', editOf(filePath));
      assert.equal(status, 0);
      const output = parseObject(stdout).hookSpecificOutput;
      assert.ok(isRecord(output));
      assert.equal(output.hookEventName, 'PreToolUse');
      assert.equal(output.permissionDecision, 'ask');
      assert.match(String(output.permissionDecisionReason), /agent config/);
    });
  }

  const otherInputs: Record<string, unknown> = {
    'a source file': editOf('apps/api/src/yoga.ts'),
    'a REVIEW.md below the root': editOf('docs/REVIEW.md'),
    'a file outside the project': editOf(path.resolve(root, '..', 'AGENTS.md')),
    'input with no file path': { hook_event_name: 'PreToolUse', tool_input: {} },
    'empty input': '',
    'input that is not JSON': 'not json',
  };

  for (const [name, input] of Object.entries(otherInputs)) {
    it(`stays silent for ${name}`, () => {
      assert.deepEqual(runHook('protect-files.ts', input), SILENT);
    });
  }
});

describe('lint-edited-file', () => {
  it('passes a clean TypeScript file', () => {
    assert.deepEqual(runHook('lint-edited-file.ts', editOf('apps/api/src/yoga.ts')), SILENT);
  });

  it('ignores files that are not .ts or .tsx', () => {
    assert.deepEqual(runHook('lint-edited-file.ts', editOf('README.md')), SILENT);
  });

  it('ignores a file that no longer exists', () => {
    assert.deepEqual(runHook('lint-edited-file.ts', editOf('apps/api/src/gone.ts')), SILENT);
  });

  it('ignores input that is not JSON', () => {
    assert.deepEqual(runHook('lint-edited-file.ts', 'not json'), SILENT);
  });

  it('reports lint problems to Claude with exit code 2', () => {
    const relativePath = `packages/shared/src/hook-test-${process.pid}.ts`;
    const file = path.join(root, relativePath);
    writeFileSync(file, 'debugger;\n');
    try {
      const { status, stderr } = runHook('lint-edited-file.ts', editOf(file));
      assert.equal(status, 2);
      assert.ok(stderr.includes(`Oxlint found problems in ${relativePath}`), stderr);
      assert.match(stderr, /no-debugger/);
    } finally {
      rmSync(file, { force: true });
    }
  });
});

const PASS = 'node -e "process.exit(0)"';
const FAIL = `node -e "console.error('boom'); process.exit(1)"`;

const stopInput = (stopHookActive: boolean) => ({
  hook_event_name: 'Stop',
  cwd: root,
  stop_hook_active: stopHookActive,
});

const withChecks = (...checks: string[]) => ({ STOP_HOOK_CHECKS: JSON.stringify(checks) });

describe('check-before-stop', () => {
  it('lets Claude stop when every check passes', () => {
    const result = runHook('check-before-stop.ts', stopInput(false), withChecks(PASS, PASS));
    assert.deepEqual(result, SILENT);
  });

  it('blocks with the failing output when a check fails', () => {
    const { status, stderr } = runHook(
      'check-before-stop.ts',
      stopInput(false),
      withChecks(PASS, FAIL),
    );
    assert.equal(status, 2);
    assert.match(stderr, /failed\. Fix the problems below/);
    assert.match(stderr, /boom/);
  });

  it('releases with a warning when the check still fails in the forced round', () => {
    const { status, stdout, stderr } = runHook(
      'check-before-stop.ts',
      stopInput(true),
      withChecks(FAIL),
    );
    assert.equal(status, 0);
    assert.equal(stderr, '');
    assert.match(String(parseObject(stdout).systemMessage), /still fails/);
  });

  it('ignores other events and input that is not JSON', () => {
    const other = { hook_event_name: 'SubagentStop', cwd: root };
    assert.deepEqual(runHook('check-before-stop.ts', other, withChecks(FAIL)), SILENT);
    assert.deepEqual(runHook('check-before-stop.ts', 'not json', withChecks(FAIL)), SILENT);
  });
});
