FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends git jq coreutils \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /consumer-tools
RUN printf '{"name":"git-warp-release-tools","private":true,"type":"module"}\n' > package.json \
  && npm install --ignore-scripts --no-audit --no-fund --save-exact \
  --registry=https://registry.npmjs.org --fetch-retries=0 --fetch-timeout=15000 \
  @git-stunts/docker-guard@0.1.0
COPY RequireDockerTests.ts ./
COPY consumer.sh budget.sh ./release-closure/
COPY npm.json /evidence/npm.json
ENTRYPOINT ["bash", "/consumer-tools/release-closure/consumer.sh", "/evidence"]
