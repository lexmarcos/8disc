FROM node:22-alpine AS builder

WORKDIR /app

ARG PNPM_VERSION=10.22.0
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

ARG PUBLIC_SITE_URL
ENV PUBLIC_SITE_URL=$PUBLIC_SITE_URL

RUN pnpm build


FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=2000 \
    STATIC_DIR=/app/build

COPY --from=builder /app/build ./build
COPY --from=builder /app/scripts/serve-static.mjs ./scripts/serve-static.mjs

USER node
EXPOSE 2000

CMD ["node", "scripts/serve-static.mjs"]
