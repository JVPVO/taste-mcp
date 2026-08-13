FROM oven/bun:1.3.0 AS dependencies
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM dependencies AS build
RUN bun install --frozen-lockfile

COPY index.html tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts ./
COPY public ./public
COPY src ./src
COPY server ./server
RUN bun run build

FROM oven/bun:1.3.0-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8787 \
    DATABASE_PATH=/app/data/taste.sqlite

COPY package.json bun.lock ./
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY server ./server

RUN mkdir -p /app/data && chown bun:bun /app/data
USER bun
EXPOSE 8787
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD ["bun", "-e", "const r=await fetch('http://127.0.0.1:8787/api/health');if(!r.ok)process.exit(1)"]

CMD ["bun", "server/index.ts"]
