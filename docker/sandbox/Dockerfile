# docker/sandbox/Dockerfile
# Multi-language dev sandbox for web-ide
# Runs on Ubuntu 24.04 to match your host OS — same glibc, no surprises

FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=UTC
ENV HOME=/home/devuser

# ── System base ───────────────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y \
    curl wget git bash vim nano \
    build-essential pkg-config ca-certificates gnupg \
    software-properties-common apt-transport-https \
    lsof net-tools iputils-ping \
    jq tree ripgrep unzip zip \
    && rm -rf /var/lib/apt/lists/*

# ── C / C++ ───────────────────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y \
    gcc g++ gdb \
    cmake make ninja-build \
    clang clang-format clang-tidy \
    valgrind \
    && rm -rf /var/lib/apt/lists/*

# ── Java 21 ───────────────────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y \
    openjdk-21-jdk maven gradle \
    && rm -rf /var/lib/apt/lists/*

# ── Python 3 ─────────────────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y \
    python3 python3-pip python3-venv python3-dev \
    && rm -rf /var/lib/apt/lists/*
RUN pip3 install --no-cache-dir --break-system-packages --ignore-installed \
    numpy pandas requests flask fastapi pytest \
    black mypy ruff

# ── Node.js 20 ────────────────────────────────────────────────────────────────
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*
RUN npm install -g \
    typescript ts-node tsx \
    pnpm \
    eslint prettier \
    nodemon

# ── Go 1.22 ───────────────────────────────────────────────────────────────────
RUN wget -q https://go.dev/dl/go1.22.0.linux-amd64.tar.gz \
    && tar -C /usr/local -xzf go1.22.0.linux-amd64.tar.gz \
    && rm go1.22.0.linux-amd64.tar.gz
ENV PATH=$PATH:/usr/local/go/bin
ENV GOPATH=/home/devuser/go
ENV PATH=$PATH:/home/devuser/go/bin

# ── Rust ─────────────────────────────────────────────────────────────────────
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | \
    sh -s -- -y --default-toolchain stable --no-modify-path
ENV PATH=$PATH:/root/.cargo/bin

# ── Create non-root devuser ───────────────────────────────────────────────────
# All user code runs as devuser, not root
# This prevents container escape via file permission tricks
RUN useradd -m -s /bin/bash devuser \
    && mkdir -p /home/devuser/.cargo \
    && cp -r /root/.cargo/bin /home/devuser/.cargo/ 2>/dev/null || true \
    && chown -R devuser:devuser /home/devuser

# Rust for devuser
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | \
    su devuser -c "sh -s -- -y --default-toolchain stable --no-modify-path"
ENV PATH=$PATH:/home/devuser/.cargo/bin

# ── Workspace ─────────────────────────────────────────────────────────────────
RUN mkdir -p /workspace && chown devuser:devuser /workspace
WORKDIR /workspace
USER devuser
RUN npm config set cache /home/devuser/.npm-cache && \
    mkdir -p /home/devuser/.npm-cache && \
    npm install --prefer-offline 2>/dev/null || true

ENV NPM_CONFIG_CACHE=/home/devuser/.npm-cache
ENV NPM_CONFIG_PREFIX=/home/devuser/.npm-global
ENV PATH=$PATH:/home/devuser/.npm-global/bin

# Verify key tools are available
RUN node --version && \
    python3 --version && \
    java --version && \
    gcc --version | head -1 && \
    go version

CMD ["bash", "--login"]