# Same Ubuntu as CI (ubuntu-26.04). Pinned by the multi-arch index digest (amd64 + arm64),
# so Apple Silicon runs it natively.
FROM mcr.microsoft.com/devcontainers/base:ubuntu26.04@sha256:b1e3b08610ae0b2599f57c3a492eebc93d1d26dbaefb4a0bad0caa7149e4ec95

# Tools for the firewall script.
RUN apt-get update \
  && apt-get install -y --no-install-recommends iptables ipset iproute2 dnsutils aggregate jq curl \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

# The base image gives vscode passwordless sudo for everything, which would let anything
# inside turn the firewall off. Allow sudo for the firewall script only.
COPY init-firewall.sh /usr/local/bin/init-firewall.sh
RUN chmod 755 /usr/local/bin/init-firewall.sh \
  && rm -f /etc/sudoers.d/vscode \
  && echo "vscode ALL=(root) NOPASSWD: /usr/local/bin/init-firewall.sh" > /etc/sudoers.d/vscode-firewall \
  && chmod 0440 /etc/sudoers.d/vscode-firewall

# Claude Code from Anthropic's native installer, pinned, with auto-update off.
# ~/.claude is created here so the named volume mounted over it is owned by vscode.
ARG CLAUDE_CODE_VERSION
USER vscode
RUN mkdir -p /home/vscode/.claude \
  && curl -fsSL https://claude.ai/install.sh | bash -s "${CLAUDE_CODE_VERSION}"
ENV PATH="/home/vscode/.local/bin:${PATH}" \
  DISABLE_AUTOUPDATER=1
USER root
