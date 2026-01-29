FROM node:22-slim

# Install git and build tools (needed for roaring bitmap native module)
RUN apt-get update && apt-get install -y \
    git \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Configure git
RUN git config --global init.defaultBranch main

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source
COPY . .

# Create demo directory (git repo will live here)
RUN mkdir -p /demo

WORKDIR /demo

# Scripts are run from /app/examples/ via the mounted volume

# Default command drops into bash
CMD ["bash"]
