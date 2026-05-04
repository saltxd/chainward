FROM node:22-alpine AS base
# Native deps (utf-8-validate / bufferutil pulled in via socket transports)
# need python+make+g++ to compile when prebuilds aren't available for the
# node/alpine combo. Without these, pnpm install fails at node-gyp-build.
RUN apk add --no-cache python3 make g++ && \
    corepack enable && corepack prepare pnpm@latest --activate

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
# Workspace root has pnpm.patchedDependencies pointing at patches/ —
# pnpm install fails ENOENT without these even if the running app
# doesn't import the patched packages.
COPY patches/ patches/
COPY apps/web/package.json apps/web/
COPY packages/common/package.json packages/common/
RUN pnpm install --frozen-lockfile

FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/common/node_modules ./packages/common/node_modules
COPY . .
ARG API_INTERNAL_URL=http://api:8000
ENV API_INTERNAL_URL=${API_INTERNAL_URL}
ARG NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=""
ENV NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=${NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID}
RUN pnpm --filter @chainward/common build && \
    pnpm --filter @chainward/web build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV API_INTERNAL_URL=http://api:8000
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public

EXPOSE 3000
ENV PORT=3000
CMD ["node", "apps/web/server.js"]
