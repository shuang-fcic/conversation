# Base: OS and IBM i ODBC driver
FROM node:24-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d AS base

RUN apt-get update && apt-get install -y \
    ca-certificates \
    libodbc2 \
    unixodbc \
    curl \
    gnupg \
    procps \
    nano \
    && rm -rf /var/lib/apt/lists/*

# nano: the interactive template-authoring CLI opens $EDITOR (in the container)
# for multi-line content. In base so every target inherits it — dev (`deps`) and
# prod (`runner`) alike. Folded into the apt line above to avoid an extra layer.
ENV EDITOR=nano

RUN curl -o /etc/apt/sources.list.d/ibmi-acs-1.1.0.list \
    https://public.dhe.ibm.com/software/ibmi/products/odbc/debs/dists/1.1.0/ibmi-acs-1.1.0.list \
    && apt-get update && apt-get install -y ibm-iaccess \
    && rm -rf /var/lib/apt/lists/*

# Share the corepack cache with non-root CI/runtime users whose HOME is /tmp.
ENV COREPACK_HOME=/opt/corepack
RUN mkdir -p /opt/corepack && chmod 777 /opt/corepack && corepack enable

# Development dependencies and native build tools
FROM base AS deps

WORKDIR /app

RUN apt-get update && apt-get install -y \
    python3 make g++ unixodbc-dev \
    && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN pnpm install --frozen-lockfile
RUN pnpm rebuild odbc

# CI test image; tests mock DB2 but need the native odbc addon to load.
FROM deps AS tester

WORKDIR /app

COPY . .

CMD ["pnpm", "run", "test:ci"]

# Production builder
FROM deps AS builder

COPY . .

RUN pnpm run build

RUN pnpm prune --prod

# Production runtime
FROM base AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json

USER node
EXPOSE 3000
CMD ["node", "dist/main"]
