FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/common/package.json packages/common/
COPY packages/db/package.json packages/db/
RUN pnpm install --frozen-lockfile

FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/common/node_modules ./packages/common/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY . .
RUN pnpm --filter @chainward/api build && \
    pnpm --filter @chainward/api deploy /prod --prod

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /prod .

EXPOSE 8000
CMD ["node", "dist/index.js"]
