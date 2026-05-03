FROM node:22-alpine AS base
# Native deps (utf-8-validate / bufferutil) need python+make+g++ to compile
# from source — prebuilds aren't always available for this node/alpine combo.
# Install in base so both `deps` and `build` stages can run pnpm install.
RUN apk add --no-cache python3 make g++ && \
    corepack enable && corepack prepare pnpm@latest --activate

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY patches/ patches/
COPY apps/acp-decoder/package.json apps/acp-decoder/
COPY packages/common/package.json packages/common/
COPY packages/db/package.json packages/db/
COPY packages/decode/package.json packages/decode/
RUN pnpm install --frozen-lockfile

FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/acp-decoder/node_modules ./apps/acp-decoder/node_modules
COPY --from=deps /app/packages/common/node_modules ./packages/common/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=deps /app/packages/decode/node_modules ./packages/decode/node_modules
COPY . .
RUN pnpm --filter @chainward/acp-decoder build && \
    pnpm --filter @chainward/acp-decoder deploy /prod --prod

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
# Install Claude Code CLI for OAuth-backed report-writer
RUN npm install -g @anthropic-ai/claude-code
COPY --from=build /prod .

CMD ["node", "dist/index.js"]
