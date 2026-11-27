---
name: fix-bug
description: Fix a reported bug test-first. Writes a test that reproduces the bug and shows it failing, locks the test files, then fixes the code until the test passes. Use when fixing a bug from an issue or a bug report.
---

# Fix a bug

## Steps

1. **Understand the bug.** Read the steps to reproduce and the expected behavior. If the expected behavior isn't clear, ask.
2. **Write a test that reproduces it.** Follow the `write-tests` skill to pick the kind of test and the file. Use only code that already exists, so the test fails because of the bug and not because of a missing import.
3. **See it fail.** Run that one file with the command from `write-tests`, and show the output. It must fail on an assertion that shows the bug. A compile error, an import error or "No test files found" doesn't count: fix the test and run it again.
4. **Lock the tests.** Write the output of `git branch --show-current` into `.test-lock` in the repo root, with the Write tool. While the lock exists, a hook refuses edits to test files, test helpers, test configs, the `package.json` and `turbo.json` files whose scripts run the tests, and the lock itself.
5. **Fix the code** until the test passes. Then run `pnpm test`, and `pnpm test:db` if a database test is involved. If another test fails, fix the code, not that test. If the new test turns out to be wrong, or the fix needs a change to a locked file that isn't a test, such as a dependency in `package.json`, stop and ask; never remove the lock to get around it.
6. **Unlock:** `rm .test-lock`.
7. **Finish** with the definition of done in AGENTS.md. Commit messages for the fix use the `fix` type: `fix(<package>): <what was wrong>`.

## In GitHub Actions

Runs there can't run commands, and hooks are off. Still write the test before the fix, and skip the lock. In your reply, name the test that reproduces the bug and say why it fails without the fix.
