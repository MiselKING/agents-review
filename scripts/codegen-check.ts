// Fails when the generated GraphQL code doesn't match what `pnpm codegen` produces
// from the current schema and queries. Compares the working tree before and after
// a fresh codegen run, so it works locally (uncommitted edits) and in CI (clean checkout).
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const GENERATED_DIRS = ['apps/api/src/generated', 'apps/web/src/gql'];

function snapshot(): Map<string, string> {
  const files = new Map<string, string>();
  for (const dir of GENERATED_DIRS) {
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const path = relative('.', join(entry.parentPath, entry.name)).replaceAll('\\', '/');
      files.set(path, createHash('sha256').update(readFileSync(path)).digest('hex'));
    }
  }
  return files;
}

const before = snapshot();

// A fixed command string through the shell, so `pnpm` resolves to pnpm.cmd on Windows too.
const run = spawnSync('pnpm run codegen', { stdio: 'inherit', shell: true });
if (run.status !== 0) {
  console.error('codegen:check: `pnpm codegen` failed.');
  process.exit(run.status ?? 1);
}

const after = snapshot();
const changed = [...new Set([...before.keys(), ...after.keys()])]
  .filter((path) => before.get(path) !== after.get(path))
  .toSorted();

if (changed.length > 0) {
  console.error('\ncodegen:check: generated code was out of date. These files changed:');
  for (const path of changed) console.error(`  ${path}`);
  console.error('They are now regenerated. Review and commit them.');
  process.exit(1);
}

console.log('codegen:check: generated code is up to date.');
