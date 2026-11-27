// Tests for the hook scripts. Run with `pnpm test:hooks` (Node's built-in test runner).
// Each test starts a script the way Claude Code does: JSON on stdin, then exit code and output.
/* oxlint-disable typescript/no-floating-promises -- node:test's describe() and it() return promises that the test runner itself awaits */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
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

const tempDirs: string[] = [];
after(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

/** A new git repository on `branch`, with a node_modules folder unless `installed` is false. */
function tempRepo(branch: string, { changed = true, installed = true } = {}): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'hook-test-'));
  tempDirs.push(dir);
  const init = spawnSync('git', ['init', '--quiet', '--initial-branch', branch], { cwd: dir });
  assert.equal(init.status, 0, String(init.stderr));
  writeFileSync(path.join(dir, '.git', 'info', 'exclude'), 'node_modules/\n');
  if (installed) mkdirSync(path.join(dir, 'node_modules'));
  if (changed) writeFileSync(path.join(dir, 'changed.txt'), 'changed\n');
  return dir;
}

const PASS = 'node -e "process.exit(0)"';
const FAIL = `node -e "console.error('boom'); process.exit(1)"`;

const editOf = (filePath: string) => ({
  hook_event_name: 'PostToolUse',
  tool_name: 'Edit',
  cwd: root,
  tool_input: { file_path: filePath },
});

describe('check-edited-file', () => {
  it('passes a clean TypeScript file', () => {
    assert.deepEqual(runHook('check-edited-file.ts', editOf('apps/api/src/yoga.ts')), SILENT);
  });

  it('ignores files that are not .ts or .tsx', () => {
    assert.deepEqual(runHook('check-edited-file.ts', editOf('README.md')), SILENT);
  });

  it('ignores a file that no longer exists', () => {
    assert.deepEqual(runHook('check-edited-file.ts', editOf('apps/api/src/gone.ts')), SILENT);
  });

  it('ignores input that is not JSON', () => {
    assert.deepEqual(runHook('check-edited-file.ts', 'not json'), SILENT);
  });

  it('formats the edited file', () => {
    const file = path.join(root, `packages/shared/src/hook-test-format-${process.pid}.ts`);
    writeFileSync(file, 'export const a = {b:1}\n');
    try {
      assert.deepEqual(runHook('check-edited-file.ts', editOf(file)), SILENT);
      assert.equal(readFileSync(file, 'utf8'), 'export const a = { b: 1 };\n');
    } finally {
      rmSync(file, { force: true });
    }
  });

  it('reports lint problems to Claude with exit code 2', () => {
    const relativePath = `packages/shared/src/hook-test-${process.pid}.ts`;
    const file = path.join(root, relativePath);
    writeFileSync(file, 'debugger;\n');
    try {
      const { status, stderr } = runHook('check-edited-file.ts', editOf(file));
      assert.equal(status, 2);
      assert.ok(stderr.includes(`Oxlint found problems in ${relativePath}`), stderr);
      assert.match(stderr, /no-debugger/);
    } finally {
      rmSync(file, { force: true });
    }
  });
});

const stopInput = (cwd: string, stopHookActive = false) => ({
  hook_event_name: 'Stop',
  cwd,
  stop_hook_active: stopHookActive,
});

const stopChecks = (...checks: string[]) => ({ STOP_HOOK_CHECKS: JSON.stringify(checks) });

describe('check-before-stop', () => {
  it('lets Claude stop when every check passes', () => {
    const result = runHook(
      'check-before-stop.ts',
      stopInput(tempRepo('feat/1-x')),
      stopChecks(PASS, PASS),
    );
    assert.deepEqual(result, SILENT);
  });

  it('blocks with the failing output when a check fails', () => {
    const { status, stderr } = runHook(
      'check-before-stop.ts',
      stopInput(tempRepo('feat/1-x')),
      stopChecks(PASS, FAIL),
    );
    assert.equal(status, 2);
    assert.match(stderr, /failed\. Fix the problems below/);
    assert.match(stderr, /boom/);
  });

  it('releases with a warning when the check still fails in the forced round', () => {
    const { status, stdout, stderr } = runHook(
      'check-before-stop.ts',
      stopInput(tempRepo('feat/1-x'), true),
      stopChecks(FAIL),
    );
    assert.equal(status, 0);
    assert.equal(stderr, '');
    assert.match(String(parseObject(stdout).systemMessage), /still fails/);
  });

  it('runs the checks from the top of the checkout when Claude is in a package folder', () => {
    const cwd = tempRepo('feat/1-x');
    const packageDir = path.join(cwd, 'apps', 'web');
    mkdirSync(packageDir, { recursive: true });
    const cwdFile = path.join(cwd, '.git', 'check-cwd.txt');
    const writeCwd = `node -e "require('fs').writeFileSync(process.env.CWD_FILE, process.cwd())"`;
    const result = runHook('check-before-stop.ts', stopInput(packageDir), {
      ...stopChecks(writeCwd),
      CWD_FILE: cwdFile,
    });
    assert.deepEqual(result, SILENT);
    assert.equal(realpathSync(readFileSync(cwdFile, 'utf8')), realpathSync(cwd));
  });

  it('skips the checks when nothing changed', () => {
    const cwd = tempRepo('feat/1-x', { changed: false });
    assert.deepEqual(runHook('check-before-stop.ts', stopInput(cwd), stopChecks(FAIL)), SILENT);
  });

  it('skips the checks before pnpm install', () => {
    const cwd = tempRepo('feat/1-x', { installed: false });
    assert.deepEqual(runHook('check-before-stop.ts', stopInput(cwd), stopChecks(FAIL)), SILENT);
  });

  it('ignores other events and input that is not JSON', () => {
    const other = { hook_event_name: 'SubagentStop', cwd: tempRepo('feat/1-x') };
    assert.deepEqual(runHook('check-before-stop.ts', other, stopChecks(FAIL)), SILENT);
    assert.deepEqual(runHook('check-before-stop.ts', 'not json', stopChecks(FAIL)), SILENT);
  });
});

const BRANCH = 'fix/1-x';

/** A checkout on BRANCH, with `.test-lock` holding `lock`, or no lock when it's undefined. */
function lockedRepo(lock?: string): string {
  const dir = tempRepo(BRANCH, { changed: false });
  if (lock !== undefined) writeFileSync(path.join(dir, '.test-lock'), lock);
  return dir;
}

const editIn = (cwd: string, file: string, tool = 'Edit') => ({
  hook_event_name: 'PreToolUse',
  tool_name: tool,
  cwd,
  tool_input: { [tool === 'NotebookEdit' ? 'notebook_path' : 'file_path']: path.join(cwd, file) },
});

/** The reason the hook denied the edit; fails the test if it didn't. */
function denied(result: HookResult): string {
  assert.equal(result.status, 0, result.stderr);
  const output = parseObject(result.stdout).hookSpecificOutput;
  assert.ok(isRecord(output), result.stdout);
  assert.equal(output.hookEventName, 'PreToolUse');
  assert.equal(output.permissionDecision, 'deny');
  return String(output.permissionDecisionReason);
}

describe('test-lock', () => {
  const lockedFiles = [
    'packages/shared/src/audience-filter.test.ts',
    'apps/web/src/audiences/AudienceListPage.test.tsx',
    'apps/api/src/sync-runs.db.test.ts',
    'apps/web/e2e/audiences.spec.ts',
    'apps/api/src/test/graphql.ts',
    'apps/api/vitest.db.config.ts',
    'apps/web/playwright.config.ts',
    'apps/api/package.json',
    'package.json',
    'turbo.json',
  ];

  for (const file of lockedFiles) {
    it(`denies an edit to ${file} while locked`, () => {
      const reason = denied(runHook('test-lock.ts', editIn(lockedRepo(BRANCH), file)));
      assert.ok(reason.includes(file), reason);
      assert.ok(reason.includes(`branch \`${BRANCH}\``), reason);
      assert.match(reason, /delete `\.test-lock`/);
    });
  }

  it('denies a Write and a NotebookEdit too', () => {
    const cwd = lockedRepo(BRANCH);
    denied(runHook('test-lock.ts', editIn(cwd, 'src/foo.test.ts', 'Write')));
    denied(runHook('test-lock.ts', editIn(cwd, 'apps/api/src/test/notes.ipynb', 'NotebookEdit')));
  });

  it('denies a change to the lock itself while it exists', () => {
    const reason = denied(runHook('test-lock.ts', editIn(lockedRepo(BRANCH), '.test-lock', 'Write')));
    assert.match(reason, /rm \.test-lock/);
  });

  it('allows creating the lock', () => {
    assert.deepEqual(runHook('test-lock.ts', editIn(lockedRepo(), '.test-lock', 'Write')), SILENT);
  });

  it('allows edits to code while locked', () => {
    const cwd = lockedRepo(BRANCH);
    assert.deepEqual(runHook('test-lock.ts', editIn(cwd, 'apps/api/src/sync-runs.ts')), SILENT);
    assert.deepEqual(runHook('test-lock.ts', editIn(cwd, 'README.md')), SILENT);
  });

  it('allows edits to tests without a lock', () => {
    const result = runHook('test-lock.ts', editIn(lockedRepo(), 'src/foo.test.ts'));
    assert.deepEqual(result, SILENT);
  });

  it('ignores a lock left on another branch', () => {
    const result = runHook('test-lock.ts', editIn(lockedRepo('fix/2-other'), 'src/foo.test.ts'));
    assert.deepEqual(result, SILENT);
  });

  it('treats an empty lock as locked', () => {
    const reason = denied(runHook('test-lock.ts', editIn(lockedRepo('\n'), 'src/foo.test.ts')));
    assert.match(reason, /an empty lock/);
  });

  it('finds the lock from a package folder', () => {
    const cwd = lockedRepo(BRANCH);
    const packageDir = path.join(cwd, 'apps', 'web');
    mkdirSync(packageDir, { recursive: true });
    const input = { ...editIn(cwd, 'apps/web/src/foo.test.ts'), cwd: packageDir };
    denied(runHook('test-lock.ts', input));
  });

  it('still locks in detached HEAD', () => {
    const cwd = lockedRepo(BRANCH);
    const git = (...args: string[]) => {
      const result = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd });
      assert.equal(result.status, 0, String(result.stderr));
    };
    git('commit', '--quiet', '--allow-empty', '-m', 'x');
    git('checkout', '--quiet', '--detach');
    denied(runHook('test-lock.ts', editIn(cwd, 'src/foo.test.ts')));
  });

  it('denies an edit through a symlink to the checkout', () => {
    const linkDir = mkdtempSync(path.join(os.tmpdir(), 'hook-link-'));
    tempDirs.push(linkDir);
    const link = path.join(linkDir, 'repo');
    symlinkSync(lockedRepo(BRANCH), link, 'junction');
    denied(runHook('test-lock.ts', editIn(link, 'src/foo.test.ts')));
  });

  it('denies an edit to a test path that is a symlink to other code', () => {
    const cwd = lockedRepo(BRANCH);
    const fixtures = path.join(cwd, 'packages', 'shared', 'fixtures');
    mkdirSync(fixtures, { recursive: true });
    mkdirSync(path.join(cwd, 'apps', 'api', 'src'), { recursive: true });
    symlinkSync(fixtures, path.join(cwd, 'apps', 'api', 'src', 'test'), 'junction');
    const reason = denied(runHook('test-lock.ts', editIn(cwd, 'apps/api/src/test/graphql.ts')));
    assert.ok(reason.includes('apps/api/src/test/graphql.ts'), reason);
  });

  it('denies an edit through a symlink into a test folder', () => {
    const cwd = lockedRepo(BRANCH);
    mkdirSync(path.join(cwd, 'src', 'test'), { recursive: true });
    symlinkSync(path.join(cwd, 'src', 'test'), path.join(cwd, 'src', 'alias'), 'junction');
    denied(runHook('test-lock.ts', editIn(cwd, 'src/alias/helper.ts')));
  });

  it('ignores files outside the checkout, other events and input that is not JSON', () => {
    const cwd = lockedRepo(BRANCH);
    const outside = { ...editIn(cwd, 'x'), tool_input: { file_path: path.join(os.tmpdir(), 'a.test.ts') } };
    assert.deepEqual(runHook('test-lock.ts', outside), SILENT);
    const other = { ...editIn(cwd, 'src/foo.test.ts'), hook_event_name: 'PostToolUse' };
    assert.deepEqual(runHook('test-lock.ts', other), SILENT);
    assert.deepEqual(runHook('test-lock.ts', 'not json'), SILENT);
  });
});
