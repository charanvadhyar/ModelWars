#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# scripts/deploy.sh
# Production deployment script for Model Wars.
# Run from the repo root: ./scripts/deploy.sh
#
# Prerequisites:
#   - Docker + Docker Compose v2
#   - .env file with all required variables (copy from .env.example)
#   - TLS certificates in ./infra/certs/ (optional, see nginx.conf)
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[deploy]${NC} $*"; }
warn()  { echo -e "${YELLOW}[deploy]${NC} $*"; }
error() { echo -e "${RED}[deploy]${NC} $*" >&2; exit 1; }

# ── Pre-flight checks ─────────────────────────────────────────────────────────

command -v docker      >/dev/null 2>&1 || error "docker not found"
command -v docker      >/dev/null 2>&1 && docker compose version >/dev/null 2>&1 || \
  error "docker compose v2 not found (need 'docker compose', not 'docker-compose')"

[[ -f .env ]] || error ".env not found. Copy .env.example and fill in values."

info "Validating required environment variables..."
REQUIRED_VARS=(
  POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB
  ANTHROPIC_API_KEY OPENAI_API_KEY
  JWT_SECRET
  CORS_ORIGINS
  NEXT_PUBLIC_GAME_SERVER_URL NEXT_PUBLIC_WS_URL
)

set -a; source .env; set +a

MISSING=()
for var in "${REQUIRED_VARS[@]}"; do
  [[ -z "${!var:-}" ]] && MISSING+=("$var")
done

if [[ ${#MISSING[@]} -gt 0 ]]; then
  error "Missing required variables in .env: ${MISSING[*]}"
fi

if [[ "${JWT_SECRET:-}" == "change-me-to-a-long-random-string" ]]; then
  error "JWT_SECRET is still the default — generate a real secret:\n  openssl rand -hex 32"
fi

# ── Build ─────────────────────────────────────────────────────────────────────

info "Building Docker images..."
docker compose -f docker-compose.prod.yml build --no-cache

# ── Deploy ────────────────────────────────────────────────────────────────────

info "Starting services..."
docker compose -f docker-compose.prod.yml up -d

# ── Wait for postgres ─────────────────────────────────────────────────────────

info "Waiting for PostgreSQL to be ready..."
ATTEMPTS=0
until docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_isready -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" >/dev/null 2>&1; do
  ATTEMPTS=$((ATTEMPTS + 1))
  [[ $ATTEMPTS -gt 30 ]] && error "PostgreSQL did not become ready in time."
  sleep 2
done
info "PostgreSQL ready."

# ── Schema migration ──────────────────────────────────────────────────────────

info "Applying database schema..."
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" \
  < ./db/schema.sql
info "Schema applied."

# ── Health checks ─────────────────────────────────────────────────────────────

info "Waiting for game-server health check..."
ATTEMPTS=0
until curl -sf http://localhost/api/health >/dev/null 2>&1; do
  ATTEMPTS=$((ATTEMPTS + 1))
  [[ $ATTEMPTS -gt 20 ]] && { warn "Health check timed out — check logs."; break; }
  sleep 3
done

# ── Done ──────────────────────────────────────────────────────────────────────

echo ""
info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
info "  Model Wars is live."
info "  Frontend:    http://localhost"
info "  Admin panel: http://localhost/admin"
info "  API health:  http://localhost/api/health"
info "  Logs:        docker compose -f docker-compose.prod.yml logs -f"
info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
