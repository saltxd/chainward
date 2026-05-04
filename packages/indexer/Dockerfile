FROM node:22-alpine AS base
RUN apk add --no-cache python3 make g++ && \
    corepack enable && corepack prepare pnpm@latest --activate

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
RUN pnpm --filter @chainward/indexer build && \
    pnpm --filter @chainward/indexer deploy /prod --prod

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /prod .

CMD ["node", "dist/index.js"]
