# Dev container: one-time setup and checks

How to start, stop and remove the container is in the [root README](../README.md#dev-container-optional). This page covers what each developer does once per machine, how to check that everything works, and what to do when it doesn't.

"Your computer" means: on Windows, the Ubuntu (WSL) terminal; on macOS and Linux, your usual terminal. "The container" means a terminal inside the dev container (see the root README).

## One-time setup (your computer)

1. **Docker**
   - Windows: install Docker Desktop. In Settings → Resources → WSL integration, turn on Ubuntu. Check it in the Ubuntu terminal: `docker version` shows a Server section.
   - macOS: install Docker Desktop.
   - Linux: install Docker Engine with the Compose plugin.
2. **VS Code:** install the **Dev Containers** extension. On Windows, also the **WSL** extension.
   Without VS Code, you need the devcontainer CLI instead: install Node 26 and pnpm in that terminal, then `pnpm add -g @devcontainers/cli`.
3. **Claude token:** in a terminal where you're logged in to Claude Code, run `claude setup-token` and keep the token it prints somewhere safe, like a password manager.
4. **GitHub token:** github.com → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.
   - Repository access: Only select repositories → `agents-review`.
   - Permissions: Contents and Pull requests, both Read and write.
   - Keep it with the Claude token. Each developer uses their own tokens.

## Check that it works (the container)

After the first start, run these in the container:

```bash
echo "claude ${#CLAUDE_CODE_OAUTH_TOKEN}, github ${#GH_TOKEN}"   # token lengths only: both above 0
claude --version                                                 # the pinned version
claude -p "hi"                                                   # Claude answers
gh auth status                                                   # logged in to github.com
curl -s -m 5 https://example.com || echo blocked                 # prints: blocked
```

In VS Code, the Extensions view should also show **Oxc** as installed in the container.

To check that pushing works, push an empty test branch and delete it again:

```bash
git switch -c test/devcontainer-push
git commit --allow-empty -m "test: push from dev container"
git push -u origin test/devcontainer-push
git push origin --delete test/devcontainer-push
git switch - && git branch -D test/devcontainer-push
```

## Codespaces (not tested yet)

1. github.com → Settings → Codespaces → Secrets → New secret: name `CLAUDE_CODE_OAUTH_TOKEN`, repository access `agents-review`. Codespaces brings its own GitHub token.
2. On the repo page: Code → Codespaces → ⋯ → New with options → pick the branch → Create codespace.
3. Open "View creation log" and look for `Firewall configuration complete`. Then run the checks above.
4. When you're done, delete it under github.com → Your codespaces, so it stops using your free hours.

## If something fails

- **A token length is 0:** the token didn't reach the container. Close all VS Code windows (on Windows, also run `wsl --shutdown` in PowerShell), then repeat Start steps 2 and 3 in the root README and run "Dev Containers: Rebuild Container".
- **`git commit` says "Please tell me who you are":** in the container, run `git config --global user.name "Your Name"` and `git config --global user.email "you@example.com"`.
- **An extension or website is blocked:** run "Dev Containers: Show Container Log" to see which host failed. The allowed hosts are listed in `.devcontainer/init-firewall.sh`.
- **Start fails, or something is broken:** remove everything (root README) and start again.
