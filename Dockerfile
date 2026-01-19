FROM node:22-slim
RUN apt-get update && apt-get install -y \
    git \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
ENV GIT_STUNTS_DOCKER=1
# Default to tests, but can be overridden for benchmark
CMD ["npm", "test"]
