# ─────────────────────────────────────────────────────────────────────────────
# apps/game-server/Dockerfile
# Multi-stage build: compile TypeScript → lean production image.
# Final image contains only compiled JS + node_modules (no devDeps, no src).
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files first for better layer caching
COPY package.json ./
RUN npm install --frozen-lockfile

# Copy source
COPY tsconfig.json ./
COPY src ./src
# Shared types needed for compilation
COPY ../../packages ./packages

RUN npm run build

# ── Stage 2: production ───────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Only production dependencies
COPY package.json ./
RUN npm install --frozen-lockfile --omit=dev && npm cache clean --force

# Compiled output from builder
COPY --from=builder /app/dist ./dist

# Non-root user for security
RUN addgroup -g 1001 -S appgroup && \
    adduser  -u 1001 -S appuser -G appgroup
USER appuser

EXPOSE 3001

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "dist/index.js"]
