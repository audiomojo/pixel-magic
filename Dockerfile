FROM node:22-bookworm-slim AS builder
WORKDIR /app

# Build tools required to compile native modules:
# better-sqlite3, heic-convert, image-hash all use node-gyp
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Runner ────────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV DATA_DIR=/data
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Standalone output includes server.js + node_modules (with compiled .node binaries)
COPY --from=builder /app/.next/standalone ./
# Static assets must be copied separately — standalone does not include them
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000

CMD ["node", "server.js"]
