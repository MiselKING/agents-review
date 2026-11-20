// Tests for the hook scripts. Run with `pnpm test:hooks` (Node's built-in test runner).
// Each test starts a script the way Claude Code does: JSON on stdin, then exit code and output.
/* oxlint-disable typescript/no-floating-promises -- node:test's describe() and it() return promises that the test runner itself awaits */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { gitSubcommands, isRecord } from './lib.ts';

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

  it('skips the checks when nothing changed', () => {
    const cwd = tempRepo('feat/1-x', { changed: false });
    assert.deepEqual(runHook('check-before-stop.ts', stopInput(cwd), stopChecks(FAIL)), SILENT);
  });

  it('ignores other events and input that is not JSON', () => {
    const other = { hook_event_name: 'SubagentStop', cwd: tempRepo('feat/1-x') };
    assert.deepEqual(runHook('check-before-stop.ts', other, stopChecks(FAIL)), SILENT);
    assert.deepEqual(runHook('check-before-stop.ts', 'not json', stopChecks(FAIL)), SILENT);
  });
});

describe('gitSubcommands', () => {
  it('finds the subcommand after git options, prefixes and other commands', () => {
    assert.deepEqual(gitSubcommands('git commit -m "x"'), ['commit']);
    assert.deepEqual(gitSubcommands('pnpm test && git -C apps/web -c a=b commit -m x'), ['commit']);
    assert.deepEqual(gitSubcommands('git status; git --no-pager push origin HEAD'), [
      'status',
      'push',
    ]);
    assert.deepEqual(gitSubcommands('GIT_EDITOR=true git commit --amend'), ['commit']);
    assert.deepEqual(gitSubcommands('(cd x && git push)'), ['push']);
    assert.deepEqual(gitSubcommands('& git.exe commit -m x'), ['commit']);
  });

  it('ignores git as an argument or inside another name', () => {
    assert.deepEqual(gitSubcommands('echo git commit'), []);
    assert.deepEqual(gitSubcommands('gitk --all'), []);
  });
});

const bashCall = (command: string, cwd: string) => ({
  hook_event_name: 'PreToolUse',
  tool_name: 'Bash',
  cwd,
  tool_input: { command },
});

const commitChecks = (...checks: string[]) => ({ COMMIT_HOOK_CHECKS: JSON.stringify(checks) });

describe('check-git-command', () => {
  it('blocks a commit or a push on main', () => {
    const cwd = tempRepo('main');
    for (const command of ['git commit -m x', 'git push origin HEAD']) {
      const { status, stderr } = runHook(
        'check-git-command.ts',
        bashCall(command, cwd),
        commitChecks(PASS),
      );
      assert.equal(status, 2, command);
      assert.match(stderr, /You are on `main`/);
    }
  });

  it('allows other commands on main', () => {
    const cwd = tempRepo('main');
    for (const command of ['git status', 'pnpm test', 'echo git commit']) {
      const result = runHook('check-git-command.ts', bashCall(command, cwd), commitChecks(FAIL));
      assert.deepEqual(result, SILENT, command);
    }
  });

  it('allows a commit on a branch when every check passes', () => {
    const call = bashCall('git commit -m x', tempRepo('feat/1-x'));
    assert.deepEqual(runHook('check-git-command.ts', call, commitChecks(PASS, PASS)), SILENT);
  });

  it('blocks a commit with the failing output when a check fails', () => {
    const call = bashCall('git add -A && git commit -m x', tempRepo('feat/1-x'));
    const { status, stderr } = runHook('check-git-command.ts', call, commitChecks(PASS, FAIL));
    assert.equal(status, 2);
    assert.match(stderr, /Commit blocked: `node -e .*` failed/);
    assert.match(stderr, /boom/);
  });

  it('blocks a commit before pnpm install', () => {
    const call = bashCall('git commit -m x', tempRepo('feat/1-x', { installed: false }));
    const { status, stderr } = runHook('check-git-command.ts', call, commitChecks(PASS));
    assert.equal(status, 2);
    assert.match(stderr, /pnpm install/);
  });

  it('allows a push from a branch without running the checks', () => {
    const call = bashCall('git push -u origin HEAD', tempRepo('feat/1-x'));
    assert.deepEqual(runHook('check-git-command.ts', call, commitChecks(FAIL)), SILENT);
  });

  it('ignores input without a command and input that is not JSON', () => {
    const edit = { hook_event_name: 'PreToolUse', tool_name: 'Edit', cwd: tempRepo('main') };
    assert.deepEqual(runHook('check-git-command.ts', edit, commitChecks(FAIL)), SILENT);
    assert.deepEqual(runHook('check-git-command.ts', 'not json', commitChecks(FAIL)), SILENT);
  });
});
