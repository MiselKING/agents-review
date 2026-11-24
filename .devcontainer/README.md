# Dev container

Use it when Claude should work on its own, without you approving each step, for example a long task or a batch of test runs. Claude then works in a sealed-off container:
- it sees only a separate copy of the repo, not your working copy or other files;
- it can only reach GitHub, npm, Anthropic and the VS Code Marketplace;
- it has only the tokens you paste in, not your own logins.

For everyday development you don't need it, and the normal setup in the [root README](../README.md#run-it) stays as it is.

Works on Windows (WSL 2) + Docker Desktop, macOS (Intel and Apple Silicon) + Docker Desktop, and Linux + Docker Engine. Podman and rootless Docker are untested.

Every command here runs in **a terminal on your computer**: on Windows, the **Ubuntu (WSL)** terminal (not PowerShell, except where noted); on macOS and Linux, your usual terminal.

## One-time setup

Once per machine, for each developer.

1. **Docker**
   - Windows: install Docker Desktop. In Settings → Resources → WSL integration, turn on Ubuntu. In the Ubuntu terminal, `docker version` must show a Server section.
   - macOS: install Docker Desktop.
   - Linux: install Docker Engine with the Compose plugin.
2. **Node, pnpm and the devcontainer CLI** in that terminal.
   - macOS/Linux, if you already did the normal project setup: just run `pnpm add -g @devcontainers/cli`.
   - Windows (Ubuntu usually has none of them):
     ```bash
     curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.41.0/install.sh | bash
     ```
     Close and reopen the Ubuntu terminal, then:
     ```bash
     nvm install 26
     
     curl -fsSL https://get.pnpm.io/install.sh | env PNPM_VERSION=12.18.0 sh -
     ```
     Close and reopen it again, then:
     ```bash
     pnpm add -g @devcontainers/cli
     ```
   - Check: `devcontainer --version` prints a version.
3. **Claude token.** You need the `claude` command once, in any terminal; you don't need to be logged in first.
   - Install it if needed. Windows (PowerShell): `irm https://claude.ai/install.ps1 | iex`. macOS/Linux: `curl -fsSL https://claude.ai/install.sh | bash`.
   - Run `claude setup-token`. It opens your browser to sign in, then prints a token that's valid for a year.
   - Windows: if PowerShell says `claude` is not recognized, run `& "$env:USERPROFILE\.local\bin\claude.exe" setup-token`.
4. **GitHub token** (optional; only needed if a run should push a branch or open a PR): github.com → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.
   - Repository access: Only select repositories → `agents-review`.
   - Permissions: Contents and Pull requests, both Read and write.

Keep both tokens in a password manager. They're never saved on your computer or in the container; you paste them into each new terminal ([Start](#start), step 2). Each developer uses their own.

## Start

1. Once: clone a separate copy. Never use your everyday checkout: its `node_modules` has binaries for your computer, and the agent must not touch your working copy.
   ```bash
   git clone https://github.com/MiselKING/agents-review.git ~/agents-review
   ```
2. Paste your tokens. They stay in this terminal only and are never saved, so paste them again in each new terminal. Skip the GitHub one if runs don't need to push.
   ```bash
   read -rsp "Claude token: " CLAUDE_CODE_OAUTH_TOKEN && export CLAUDE_CODE_OAUTH_TOKEN
   
   read -rsp "GitHub token: " GH_TOKEN && export GH_TOKEN
   ```
3. Start the container:
   ```bash
   devcontainer up --workspace-folder ~/agents-review
   ```
   The first start builds the image and sets up the project (about 5 minutes). Later starts take seconds.

## Run Claude

In the same terminal, so it gets the tokens:

```bash
devcontainer exec --workspace-folder ~/agents-review claude -p "Summarize what apps/api does" --max-turns 10
```

`-p` runs can run the project checks (`pnpm lint`, `pnpm test` and the others in AGENTS.md) without prompts. Anything that would need your approval is denied.

For a shell inside the container: `devcontainer exec --workspace-folder ~/agents-review bash` (`exit` to leave). Only `devcontainer exec` from a terminal with the tokens passes them in; VS Code terminals don't get them.

## Check that it works

After [Start](#start), in the same terminal, open a shell inside the container:

```bash
devcontainer exec --workspace-folder ~/agents-review bash
```

The prompt changes to something like `vscode ➜ /workspace $`: you're inside. Run:

```bash
echo "claude ${#CLAUDE_CODE_OAUTH_TOKEN}, github ${#GH_TOKEN}"   # token lengths: above 0 (github 0 if you skipped it)
claude --version                                                 # the pinned version
claude -p "hi"                                                   # Claude answers
gh auth status                                                   # logged in (only with a GitHub token)
curl -s -m 5 https://example.com || echo blocked                 # prints: blocked
sudo -n true 2>/dev/null || echo "no sudo"                       # prints: no sudo
```

Optional, with a GitHub token: push an empty test branch and delete it again.

```bash
git config user.name "Your Name" && git config user.email "you@example.com"   # once per clone
git switch -c test/devcontainer-push
git commit --allow-empty -m "test: push from dev container"
git push -u origin test/devcontainer-push
git push origin --delete test/devcontainer-push
git switch - && git branch -D test/devcontainer-push
```

Type `exit` to leave the container. It keeps running.

## Stop and remove

**Stop:** `docker compose -p agents-review_devcontainer stop`. To start again, do [Start](#start) steps 2 and 3.

**Remove everything:** the containers, the database, the Claude config, the image, then the clone:
```bash
docker compose -p agents-review_devcontainer down -v --rmi local
rm -rf ~/agents-review
```
`agents-review_devcontainer` is the clone's folder name plus `_devcontainer`. Change it if your clone has another name.

## Upgrades

Chromium and Claude Code are built into the image. Renovate updates Playwright in its weekly PR: `@playwright/test`, the playwright feature's `version` in `.devcontainer/devcontainer.json` and the Playwright image in `.github/workflows/ci.yml`. For Claude Code, set `CLAUDE_CODE_VERSION` in `.devcontainer/compose.yaml` by hand. After either upgrade, rebuild: `devcontainer up --workspace-folder ~/agents-review --remove-existing-container`.

## Risks

- Anything inside can leave through the allowed hosts, e.g. by pushing to GitHub.
- The firewall looks up the allowed hosts' IPs only at startup. If one changes its IPs, restart the container.
- VS Code, while connected, passes your own Git login into the container. See [VS Code](#vs-code-optional) before using it.

## VS Code (optional)

For looking around and editing, not for agent runs: VS Code terminals don't get your tokens. While VS Code is connected, it also passes your own Git login into the container, so anything inside could push with your full GitHub access. Before using it, turn that off once in your VS Code user settings (Ctrl/Cmd+Shift+P → **Preferences: Open User Settings (JSON)**), and add:

```json
"dev.containers.copyGitConfig": false,
"dev.containers.gitCredentialHelperConfigLocation": "none",
"dev.containers.forwardWSLServices": false
```

On macOS and Linux, VS Code also forwards your SSH agent if one is running, so close VS Code before agent runs.

To open the container (start it with the CLI first):
- Windows: Ctrl+Shift+P → **WSL: Connect to WSL**. In the new window: File → Open Folder → `/home/<your Ubuntu user>/agents-review`. Check that the bottom-left corner says **"WSL: Ubuntu"**, then Ctrl+Shift+P → **Dev Containers: Reopen in Container**.
  Don't open the folder through its Windows path (`\\wsl.localhost\...`), for example from the recent folders list: VS Code then makes a container the CLI can't find (`Dev container not found`).
- macOS/Linux: File → Open Folder → your clone. Then Cmd/Ctrl+Shift+P → **Dev Containers: Reopen in Container**.

The bottom-left corner shows "Dev Container: agents-review" when you're in. Closing the window leaves the container running.

## Codespaces (optional)

The same container, but on GitHub's machines instead of yours, opened in the browser. Use it when you don't want to install Docker and the CLI, you're on another computer, or you want to keep your own machine free while an agent works. A personal account gets 120 core-hours a month for free: 60 hours on the default 2-core machine.

**Once:** github.com → your profile picture → Settings → Codespaces → Secrets → **New secret**: name `CLAUDE_CODE_OAUTH_TOKEN`, your Claude token as the value, repository access `agents-review`. You don't need a GitHub token: Codespaces gives each codespace its own token for this repo.

**Start:** on the repo page, pick the branch in the branch dropdown, then **Code** → **Codespaces** → **Create codespace on** _branch name_. It opens VS Code in the browser and builds (about 5 minutes the first time). For a bigger machine, use **⋯** → **New with options** instead.

**Check the build:** Ctrl+Shift+P → **Codespaces: View Creation Log**, and look for `Firewall configuration complete`.

**Use it:** Terminal → New Terminal. You're already inside the container, so run `claude -p "..."` and the checks above directly, without `devcontainer exec`.

**Stop or delete:** at https://github.com/codespaces, click **⋯** next to the codespace → **Stop codespace** or **Delete**. It also stops by itself after 30 minutes without activity. Delete it when you're done, so it stops using your storage quota.

## If something fails

- **A token length is 0:** that terminal doesn't have the tokens, or you opened the shell another way (VS Code, `docker exec`). Paste them again ([Start](#start), step 2) and use `devcontainer exec`.
- **`devcontainer exec` says "Dev container not found"** while the container runs: VS Code created it from a Windows path. Recreate it from the Ubuntu terminal (your database and Claude config are kept):
  ```bash
  docker compose -p agents-review_devcontainer down
  devcontainer up --workspace-folder ~/agents-review
  ```
- **`git commit` says "Please tell me who you are":** run the `git config user.name …` line above inside the container.
- **A website or extension is blocked:** the allowed hosts are in `.devcontainer/init-firewall.sh`.
- **Start fails or something is broken:** [remove everything](#stop-and-remove) and start again.
