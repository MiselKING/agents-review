// Run with `pnpm test:hooks`. Each test runs real git in a new repository that uses these hooks.
/* oxlint-disable typescript/no-floating-promises -- node:test's describe() and it() return promises that the test runner itself awaits */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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

type GitResult = { status: number | null; output: string };

function git(cwd: string, args: string[]): GitResult {
  const result = spawnSync(
    'git',
    ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args],
    { cwd, encoding: 'utf8' },
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

const commit = (cwd: string) => git(cwd, ['commit', '--quiet', '-m', 'x']);
const commitCount = (cwd: string) => git(cwd, ['rev-list', '--all', '--count']).output.trim();

describe('pre-commit', () => {
  it('refuses a commit on main', () => {
    const cwd = repo('main');
    const { status, output } = commit(cwd);
    assert.notEqual(status, 0);
    assert.match(output, /no commits on main/);
    assert.equal(commitCount(cwd), '0');
  });

  it('commits on a branch', () => {
    const cwd = repo('feat/1-x');
    assert.equal(commit(cwd).status, 0);
    assert.equal(commitCount(cwd), '1');
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
