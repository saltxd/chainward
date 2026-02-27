FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/indexer/package.json packages/indexer/
COPY packages/common/package.json packages/common/
COPY packages/db/package.json packages/db/
RUN pnpm install --frozen-lockfile

FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/indexer/node_modules ./packages/indexer/node_modules
COPY --from=deps /app/packages/common/node_modules ./packages/common/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY . .
RUN pnpm --filter @agentguard/common build && \
    pnpm --filter @agentguard/db build && \
    pnpm --filter @agentguard/indexer build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/packages/indexer/dist ./packages/indexer/dist
COPY --from=build /app/packages/indexer/package.json ./packages/indexer/
COPY --from=build /app/packages/common/dist ./packages/common/dist
COPY --from=build /app/packages/common/package.json ./packages/common/
COPY --from=build /app/packages/db/dist ./packages/db/dist
COPY --from=build /app/packages/db/package.json ./packages/db/
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./

CMD ["node", "packages/indexer/dist/index.js"]
