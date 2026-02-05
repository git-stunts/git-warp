FROM node:22-slim
RUN apt-get update && apt-get install -y \
    bats \
    git \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# Copy git-warp
COPY git-warp/package*.json ./
COPY git-warp/scripts ./scripts
COPY git-warp/patches ./patches
RUN npm install
COPY git-warp .
RUN git init -q \
  && git config user.email "container@git-warp.local" \
  && git config user.name "Git Warp Container" \
  && git add -A \
  && git commit --allow-empty -m "seed git-warp" >/dev/null
RUN printf '%s\n' '#!/usr/bin/env bash' 'exec node /app/bin/warp-graph.js "$@"' > /usr/local/bin/warp-graph
RUN chmod +x /usr/local/bin/warp-graph \
  && install -m 0755 /app/bin/git-warp /usr/local/bin/git-warp
ENV GIT_STUNTS_DOCKER=1
# Default to tests, but can be overridden for benchmark
CMD ["npm", "test"]
