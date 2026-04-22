# docker/sandbox/Dockerfile
# Multi-language dev sandbox for web-ide
# Runs on Ubuntu 24.04 to match your host OS — same glibc, no surprises

# FROM ubuntu:24.04

# ENV DEBIAN_FRONTEND=noninteractive
# ENV TZ=UTC
# ENV HOME=/home/devuser

# # ── System base ───────────────────────────────────────────────────────────────
# RUN apt-get update && apt-get install -y \
#     curl wget git bash vim nano \
#     build-essential pkg-config ca-certificates gnupg \
#     software-properties-common apt-transport-https \
#     lsof net-tools iputils-ping \
#     jq tree ripgrep unzip zip \
#     && rm -rf /var/lib/apt/lists/*

# # ── C / C++ ───────────────────────────────────────────────────────────────────
# RUN apt-get update && apt-get install -y \
#     gcc g++ gdb \
#     cmake make ninja-build \
#     clang clang-format clang-tidy \
#     valgrind \
#     && rm -rf /var/lib/apt/lists/*

# # ── Java 21 ───────────────────────────────────────────────────────────────────
# RUN apt-get update && apt-get install -y \
#     openjdk-21-jdk maven gradle \
#     && rm -rf /var/lib/apt/lists/*

# # ── Python 3 ─────────────────────────────────────────────────────────────────
# RUN apt-get update && apt-get install -y \
#     python3 python3-pip python3-venv python3-dev \
#     && rm -rf /var/lib/apt/lists/*
# RUN pip3 install --no-cache-dir --break-system-packages --ignore-installed \
#     numpy pandas requests flask fastapi pytest \
#     black mypy ruff

# # ── Node.js 20 ────────────────────────────────────────────────────────────────
# RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
#     && apt-get install -y nodejs \
#     && rm -rf /var/lib/apt/lists/*
# RUN npm install -g \
#     typescript ts-node tsx \
#     pnpm \
#     eslint prettier \
#     nodemon

# # ── Go 1.22 ───────────────────────────────────────────────────────────────────
# RUN wget -q https://go.dev/dl/go1.22.0.linux-amd64.tar.gz \
#     && tar -C /usr/local -xzf go1.22.0.linux-amd64.tar.gz \
#     && rm go1.22.0.linux-amd64.tar.gz
# ENV PATH=$PATH:/usr/local/go/bin
# ENV GOPATH=/home/devuser/go
# ENV PATH=$PATH:/home/devuser/go/bin

# # ── Rust ─────────────────────────────────────────────────────────────────────
# RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | \
#     sh -s -- -y --default-toolchain stable --no-modify-path
# ENV PATH=$PATH:/root/.cargo/bin

# # ── Create non-root devuser ───────────────────────────────────────────────────
# # All user code runs as devuser, not root
# # This prevents container escape via file permission tricks
# RUN useradd -m -s /bin/bash devuser \
#     && mkdir -p /home/devuser/.cargo \
#     && cp -r /root/.cargo/bin /home/devuser/.cargo/ 2>/dev/null || true \
#     && chown -R devuser:devuser /home/devuser

# # Rust for devuser
# RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | \
#     su devuser -c "sh -s -- -y --default-toolchain stable --no-modify-path"
# ENV PATH=$PATH:/home/devuser/.cargo/bin

# # ── Workspace ─────────────────────────────────────────────────────────────────
# RUN mkdir -p /workspace && chown devuser:devuser /workspace
# WORKDIR /workspace
# USER devuser
# RUN npm config set cache /home/devuser/.npm-cache && \
#     mkdir -p /home/devuser/.npm-cache && \
#     npm install --prefer-offline 2>/dev/null || true

# ENV NPM_CONFIG_CACHE=/home/devuser/.npm-cache
# ENV NPM_CONFIG_PREFIX=/home/devuser/.npm-global
# ENV PATH=$PATH:/home/devuser/.npm-global/bin

# RUN npm install -g \
#     typescript ts-node tsx \
#     pnpm \
#     eslint prettier \
#     nodemon \
#     typescript-language-server \
#     vscode-langservers-extracted \
#     pyright

# # Verify key tools are available
# RUN node --version && \
#     python3 --version && \
#     java --version && \
#     gcc --version | head -1 && \
#     go version

# CMD ["bash", "--login"]

# docker/sandbox/Dockerfile
# Multi-language dev sandbox for web-ide

# FROM ubuntu:24.04

# ENV DEBIAN_FRONTEND=noninteractive
# ENV TZ=UTC
# ENV HOME=/home/devuser

# # ── 1. Install all apt packages in ONE layer to maximize caching ─────────────
# RUN apt-get update && apt-get install -y \
#     # System base
#     curl wget git bash vim nano build-essential pkg-config ca-certificates gnupg \
#     software-properties-common apt-transport-https lsof net-tools iputils-ping \
#     jq tree ripgrep unzip zip \
#     # C / C++
#     gcc g++ gdb cmake make ninja-build clang clang-format clang-tidy valgrind \
#     # Java 21
#     openjdk-21-jdk maven gradle \
#     # Python 3
#     python3 python3-pip python3-venv python3-dev \
#     && rm -rf /var/lib/apt/lists/*

# # ── 2. Python Setup ──────────────────────────────────────────────────────────
# RUN pip3 install --no-cache-dir --break-system-packages --ignore-installed \
#     numpy pandas requests flask fastapi pytest black mypy ruff

# # ── 3. Node.js 20 Setup ──────────────────────────────────────────────────────
# RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
#     && apt-get install -y nodejs \
#     && rm -rf /var/lib/apt/lists/*

# # ── 4. Go 1.22 Setup ─────────────────────────────────────────────────────────
# RUN wget -q https://go.dev/dl/go1.22.0.linux-amd64.tar.gz \
#     && tar -C /usr/local -xzf go1.22.0.linux-amd64.tar.gz \
#     && rm go1.22.0.linux-amd64.tar.gz
# ENV PATH=$PATH:/usr/local/go/bin
# ENV GOPATH=/home/devuser/go
# ENV PATH=$PATH:/home/devuser/go/bin

# # ── 5. Create devuser ────────────────────────────────────────────────────────
# RUN useradd -m -s /bin/bash devuser \
#     && mkdir -p /workspace \
#     && chown -R devuser:devuser /workspace /home/devuser

# # ── 6. Switch to devuser for user-specific tools ─────────────────────────────
# USER devuser
# WORKDIR /workspace

# # Install Rust ONLY for devuser
# RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | \
#     sh -s -- -y --default-toolchain stable --no-modify-path
# ENV PATH=$PATH:/home/devuser/.cargo/bin

# # Setup NPM for devuser
# ENV NPM_CONFIG_CACHE=/home/devuser/.npm-cache
# ENV NPM_CONFIG_PREFIX=/home/devuser/.npm-global
# ENV PATH=$PATH:/home/devuser/.npm-global/bin

# RUN mkdir -p /home/devuser/.npm-cache

# # Install all global NPM tools (Combined your original + newly added list)
# RUN npm install -g \
#     typescript ts-node tsx \
#     pnpm eslint prettier nodemon \
#     typescript-language-server \
#     vscode-langservers-extracted \
#     pyright

# # Verify key tools are available
# RUN node --version && \
#     python3 --version && \
#     java --version && \
#     gcc --version | head -1 && \
#     go version

# CMD ["bash", "--login"]


# docker/sandbox/Dockerfile
# COMPLETE REWRITE — slimmed down to fullstack web only
# No C++, Java, Rust — those add 2GB+ and slow build time
# Placeholder architecture: when user selects project type on project creation,
# we provision from the matching base image. For now, one lean web image.
#
# FUTURE: Create variant images per stack
#   web-ide-sandbox-nextjs  (this file)
#   web-ide-sandbox-python  (add Python, FastAPI)
#   web-ide-sandbox-go      (add Go)
# Selected at container provision time based on user's project type choice.
# See: src/server/sandbox/sandbox-manager.ts getImageForProjectType()

FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=UTC

# ── System base ───────────────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y \
    curl wget git bash vim nano \
    build-essential ca-certificates gnupg \
    software-properties-common apt-transport-https \
    lsof net-tools \
    jq tree ripgrep unzip zip \
    && rm -rf /var/lib/apt/lists/*

# ── Node.js 20 (installed as root so binaries land in /usr/local/bin) ─────────
# Installing as root = binaries in /usr/local/bin = always in PATH for docker exec
# This is the key fix for "command not found" during docker exec without login shell
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install global npm tools as root → /usr/local/bin (always in PATH)
RUN npm install -g \
    typescript \
    ts-node \
    tsx \
    pnpm \
    eslint \
    prettier \
    nodemon \
    typescript-language-server \
    vscode-langservers-extracted \
    pyright

# Verify they landed in /usr/local/bin
RUN which typescript-language-server && \
    which pyright-langserver && \
    which tsx && \
    node --version && \
    npm --version

# ── Python 3 (lightweight — for fullstack projects that need it) ──────────────
RUN apt-get update && apt-get install -y \
    python3 python3-pip python3-venv python3-dev \
    && rm -rf /var/lib/apt/lists/*
# RUN pip3 install --no-cache-dir --break-system-packages \
#     requests flask fastapi pytest black ruff

# ── Create non-root devuser ───────────────────────────────────────────────────
RUN useradd -m -s /bin/bash devuser \
    && chown -R devuser:devuser /home/devuser

# ── Pre-create config directories that CLIs try to write to ──────────────────
# This is the EACCES fix — CLIs like create-next-app, eslint, prettier
# all try to write to ~/.config. Pre-create with correct ownership.
RUN mkdir -p \
    /home/devuser/.config \
    /home/devuser/.config/configstore \
    /home/devuser/.npm-cache \
    /home/devuser/.npm-global \
    /home/devuser/.npm-global/bin \
    /home/devuser/.local \
    /home/devuser/.local/share \
    /tmp/config \
    /tmp/npm-global \
    && chown -R devuser:devuser \
    /home/devuser/.config \
    /home/devuser/.npm-cache \
    /home/devuser/.npm-global \
    /home/devuser/.local \
    /tmp/config \
    /tmp/npm-global

# ── Workspace ─────────────────────────────────────────────────────────────────
RUN mkdir -p /workspace && chown devuser:devuser /workspace

WORKDIR /workspace
USER devuser

# ── Environment for devuser ───────────────────────────────────────────────────
# XDG_CONFIG_HOME=/tmp/config → CLIs write config to /tmp (always writable)
# HOME=/home/devuser → explicit, some docker exec invocations lose this
# NPM_CONFIG_CACHE → npm cache in devuser home
# NPM_CONFIG_PREFIX → user-level global installs (separate from root globals)
# PATH includes both root globals (/usr/local/bin) and user globals
ENV HOME=/home/devuser
ENV XDG_CONFIG_HOME=/tmp/config
ENV NPM_CONFIG_CACHE=/home/devuser/.npm-cache
ENV NPM_CONFIG_PREFIX=/home/devuser/.npm-global
ENV PATH=$PATH:/home/devuser/.npm-global/bin:/usr/local/bin

# Verify devuser can see root-installed globals
RUN which typescript-language-server && \
    which tsx && \
    node --version

CMD ["bash", "--login"]