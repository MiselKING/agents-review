// Tests for the git hooks. Run with `pnpm test:hooks` (Node's built-in test runner).
// Each test runs real git in a new repository that uses these hooks, with a fake `pnpm` first on PATH.
/* oxlint-disable typescript/no-floating-promises -- node:test's describe() and it() return promises that the test runner itself awaits */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const hooksDir = path.dirname(fileURLToPath(import.meta.url));

const tempDirs: string[] = [];
after(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'githooks-test-'));
  tempDirs.push(dir);
  return dir;
}

// Prints the check it was asked to run, and fails for the checks listed in FAIL_CHECKS.
const fakeBin = tempDir();
writeFileSync(
  path.join(fakeBin, 'pnpm'),
  '#!/bin/sh\necho "fake pnpm $1"\ncase " $FAIL_CHECKS " in *" $1 "*) echo "boom in $1" >&2; exit 1 ;; esac\n',
);
chmodSync(path.join(fakeBin, 'pnpm'), 0o755);

// Windows names the variable `Path`; setting a second `PATH` beside it would be ambiguous.
const pathKey = Object.keys(process.env).find((key) => key.toUpperCase() === 'PATH') ?? 'PATH';

type GitResult = { status: number | null; output: string };

function git(cwd: string, args: string[], failChecks = ''): GitResult {
  const result = spawnSync(
    'git',
    ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args],
    {
      cwd,
      encoding: 'utf8',
      env: {
        ...process.env,
        [pathKey]: `${fakeBin}${path.delimiter}${process.env[pathKey] ?? ''}`,
        FAIL_CHECKS: failChecks,
      },
    },
  );
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

/** A new repository on `branch` that uses these hooks, with one staged file. */
function repo(branch: string): string {
  const dir = tempDir();
  assert.equal(git(dir, ['init', '--quiet', '--initial-branch', branch]).status, 0);
  assert.equal(git(dir, ['config', 'core.hooksPath', hooksDir]).status, 0);
  writeFileSync(path.join(dir, 'file.txt'), 'change\n');
  assert.equal(git(dir, ['add', 'file.txt']).status, 0);
  return dir;
}

const commit = (cwd: string, failChecks = '') =>
  git(cwd, ['commit', '--quiet', '-m', 'x'], failChecks);
const commitCount = (cwd: string) => git(cwd, ['rev-list', '--all', '--count']).output.trim();

describe('pre-commit', () => {
  it('refuses a commit on main', () => {
    const cwd = repo('main');
    const { status, output } = commit(cwd);
    assert.notEqual(status, 0);
    assert.match(output, /no commits on main/);
    assert.equal(commitCount(cwd), '0');
  });

  it('commits on a branch when every check passes', () => {
    const cwd = repo('feat/1-x');
    assert.equal(commit(cwd).status, 0);
    assert.equal(commitCount(cwd), '1');
  });

  it('refuses with the failing output when a check fails', () => {
    const cwd = repo('feat/1-x');
    const { status, output } = commit(cwd, 'typecheck');
    assert.notEqual(status, 0);
    assert.match(output, /boom in typecheck/);
    assert.match(output, /`pnpm typecheck` failed, so nothing was committed/);
    assert.equal(commitCount(cwd), '0');
  });

  it('names the command that fixes generated code or formatting', () => {
    assert.match(commit(repo('feat/1-x'), 'codegen:check').output, /Run `pnpm codegen`/);
    assert.match(commit(repo('feat/1-x'), 'format:check').output, /Run `pnpm format`/);
  });

  it('runs however the commit is started, such as with git -C from another folder', () => {
    const target = repo('feat/1-x');
    const { status, output } = git(tempDir(), ['-C', target, 'commit', '-m', 'x'], 'lint');
    assert.notEqual(status, 0);
    assert.match(output, /`pnpm lint` failed/);
    assert.equal(commitCount(target), '0');
  });
});

/** A repository on a branch with one commit, and a bare repository as its `origin`. */
function repoWithRemote(): string {
  const remote = tempDir();
  assert.equal(git(remote, ['init', '--quiet', '--bare']).status, 0);
  const cwd = repo('feat/1-x');
  assert.equal(commit(cwd).status, 0);
  assert.equal(git(cwd, ['remote', 'add', 'origin', remote]).status, 0);
  return cwd;
}

describe('pre-push', () => {
  it('refuses a push to main', () => {
    const { status, output } = git(repoWithRemote(), ['push', 'origin', 'HEAD:main']);
    assert.notEqual(status, 0);
    assert.match(output, /no pushes to main/);
  });

  it('pushes a branch', () => {
    const result = git(repoWithRemote(), ['push', '--quiet', 'origin', 'HEAD:refs/heads/feat/1-x']);
    assert.equal(result.status, 0, result.output);
  });
});
