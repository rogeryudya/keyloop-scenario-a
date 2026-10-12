# syntax=docker/dockerfile:1
# Multi-stage build. Stages: deps → build → runtime (API image) and tools (migrations + seed).
# Docs: docs/local-dev/docker-compose.md#dockerfile-multi-stage

ARG NODE_IMAGE=node:24.21.0-alpine3.24

# ---------- base: Node + pnpm (version from package.json "packageManager") ----------
FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

# ---------- deps: all dependencies (dev included) ----------
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
# Scripts are skipped: postinstall (prisma generate) needs the schema and runs in `build`.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts

# ---------- build: Prisma client + nest build ----------
FROM deps AS build
COPY . .
RUN pnpm db:generate && pnpm build

# ---------- tools: full source + dev deps, for the one-shot migrate/seed job ----------
FROM build AS tools
ENV NODE_ENV=production
USER node
CMD ["sh", "-c", "pnpm db:migrate && pnpm db:seed"]

# ---------- prod-deps: production dependencies only ----------
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --ignore-scripts

# ---------- runtime: compiled app + prod deps, non-root ----------
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
    CMD wget -qO- "http://127.0.0.1:${PORT}/health" > /dev/null || exit 1
CMD ["node", "dist/main"]
