# MODEL WARS

**Real-time AI Battleship arena — watch Claude vs GPT-4o fight to the death.**

Live spectator platform where AI models play Battleship against each other via their APIs. Both boards are visible in real-time, streaming reasoning text surfaces the model's thinking turn by turn, and probability heatmaps show where each AI thinks the enemy fleet is hiding.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Nginx (80/443)                          │
│          /  → Next.js web    /api/, /socket.io → game-server    │
└────────────────────┬──────────────────┬────────────────────────┘
                     │                  │
          ┌──────────▼──────┐  ┌────────▼──────────┐
          │  Next.js 14     │  │  Game Server      │
          │  (port 3000)    │  │  (port 3001)      │
          │                 │  │  Express-lite HTTP│
          │  /match/[id]    │  │  + Socket.io      │
          │  /matches       │  │  + AI clients     │
          │  /admin         │  │  + Match runner   │
          │  /login         │  └────────┬──────────┘
          └─────────────────┘           │
                                        │
                              ┌─────────▼──────────┐
                              │  PostgreSQL 16      │
                              │  (internal network) │
                              └────────────────────┘
```

**Monorepo layout:**

```
model-wars/
├── apps/
│   ├── game-server/          Node.js game server
│   │   ├── src/
│   │   │   ├── engine/       Battleship game logic (pure, no I/O)
│   │   │   ├── ai/           Claude + GPT-4o clients, orchestrator
│   │   │   ├── socket/       Socket.io layer, match runner, registry
│   │   │   ├── db/           postgres.js repository layer
│   │   │   ├── auth/         JWT + scrypt password auth
│   │   │   └── api/          HTTP router + rate limiting
│   │   └── tests/            153 unit tests (tsx, no Jest)
│   └── web/                  Next.js 14 frontend
│       ├── app/
│       │   ├── match/[id]/   Live spectator page
│       │   ├── matches/      Match history
│       │   ├── admin/        Admin dashboard
│       │   └── login/        Auth page
│       ├── components/
│       │   ├── board/        BattleGrid, HeatLegend, FleetStatus
│       │   ├── match/        PlayerPanel, CenterPanel
│       │   └── reasoning/    ReasoningPanel (streaming tokens)
│       └── hooks/            useSocket, useGameState, useAuth
├── packages/
│   └── shared/types/         Shared TypeScript types (game, events)
├── db/
│   └── schema.sql            Canonical DDL (postgres.js, no ORM)
├── infra/
│   └── nginx.conf            Reverse proxy + rate limiting + WS upgrade
├── scripts/
│   └── deploy.sh             Production deploy script
├── docker-compose.yml        Local dev (postgres + adminer)
└── docker-compose.prod.yml   Production stack
```

---

## Quick start (local dev)

### Prerequisites

- Node.js 20+
- Docker + Docker Compose v2
- An Anthropic API key and an OpenAI API key

### 1. Clone and install

```bash
git clone <repo-url> model-wars
cd model-wars
cp .env.example .env
# Edit .env — add your API keys, keep other defaults as-is for local dev
```

### 2. Start PostgreSQL

```bash
docker compose up -d postgres
```

### 3. Apply schema

```bash
psql $DATABASE_URL -f db/schema.sql
# or via npm script once inside game-server:
cd apps/game-server && npm run db:migrate
```

### 4. Start the game server

```bash
cd apps/game-server
npm install
npm run dev       # tsx watch src/index.ts
```

Server starts on `http://localhost:3001`. Verify: `curl localhost:3001/health`

### 5. Start the Next.js frontend

```bash
cd apps/web
npm install
npm run dev       # next dev --port 3000
```

Open `http://localhost:3000`.

### 6. Create your admin account

Visit `http://localhost:3000/login` and register. The **first registered account automatically becomes ADMIN**.

### 7. Launch a match

Go to `http://localhost:3000/admin`, pick two models, click **▶ LAUNCH MATCH**. You'll be redirected to the live spectator view.

---

## Running tests

```bash
# Game server — all 153 tests
cd apps/game-server

# Run individually by phase:
npx tsx ../../run-tests.ts           # Phase 1: engine    (37 tests)
npx tsx tests/ai.test.ts             # Phase 2: AI        (33 tests)
npx tsx tests/socket.test.ts         # Phase 3: socket    (17 tests)
npx tsx tests/db.test.ts             # Phase 4: database  (22 tests)
npx tsx tests/auth.test.ts           # Phase 6: auth      (32 tests)
npx tsx tests/rateLimit.test.ts      # Phase 7: rate limit (12 tests)
```

No test framework dependency — all tests use a tiny inline runner with tsx.

---

## Production deployment

### 1. Prepare the server

- Ubuntu 22.04+ recommended
- Install Docker + Docker Compose v2
- Open ports 80 and 443

### 2. Configure environment

```bash
cp .env.example .env
vim .env
```

Required variables:

| Variable | Description |
|---|---|
| `POSTGRES_PASSWORD` | Strong random password |
| `ANTHROPIC_API_KEY` | Your Anthropic key |
| `OPENAI_API_KEY` | Your OpenAI key |
| `JWT_SECRET` | Run: `openssl rand -hex 32` |
| `CORS_ORIGINS` | Your domain, e.g. `https://yourdomain.com` |
| `NEXT_PUBLIC_GAME_SERVER_URL` | Public URL of game server, e.g. `https://yourdomain.com` |
| `NEXT_PUBLIC_WS_URL` | WebSocket URL, e.g. `wss://yourdomain.com` |

### 3. Deploy

```bash
./scripts/deploy.sh
```

The script:
1. Validates all required env vars
2. Rejects the default `JWT_SECRET` placeholder
3. Builds Docker images (multi-stage, ~200MB total)
4. Starts all containers
5. Waits for PostgreSQL readiness
6. Applies the database schema
7. Runs health checks

### 4. TLS (HTTPS)

Place your certificates in `./infra/certs/`:

```
infra/certs/
├── fullchain.pem
└── privkey.pem
```

Then uncomment the HTTPS server block in `infra/nginx.conf` and redeploy.

For Let's Encrypt:

```bash
certbot certonly --standalone -d yourdomain.com
cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem infra/certs/
cp /etc/letsencrypt/live/yourdomain.com/privkey.pem   infra/certs/
```

---

## API reference

### Public endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Server health + active match count |
| `POST` | `/api/auth/login` | `{ email, password }` → `{ token, user }` |
| `POST` | `/api/auth/register` | `{ email, password }` → `{ token, user }` |
| `GET` | `/api/matches` | Active match list |
| `GET` | `/api/matches/history` | Paginated history (`?limit=20&offset=0&status=COMPLETED`) |
| `GET` | `/api/matches/:id/transcript` | Full match transcript JSON |

### Auth-required endpoints

| Method | Path | Role | Description |
|---|---|---|---|
| `GET` | `/api/me` | Any | Current user info |
| `POST` | `/api/matches` | ADMIN | `{ modelA, modelB }` — create match |
| `DELETE` | `/api/matches/:id` | ADMIN | Abort active match |
| `GET` | `/api/admin/stats` | ADMIN | Aggregate stats + win records |
| `GET` | `/api/admin/users` | ADMIN | All users |
| `PATCH` | `/api/admin/users/:id/role` | ADMIN | `{ role: "ADMIN" | "SPECTATOR" }` |

All auth endpoints accept `Authorization: Bearer <token>`.

### WebSocket events (Socket.io)

**Client → Server:**

| Event | Payload | Description |
|---|---|---|
| `JOIN_MATCH` | `matchId: string` | Subscribe to match events |
| `LEAVE_MATCH` | `matchId: string` | Unsubscribe |

**Server → Client:**

| Event | Description |
|---|---|
| `MATCH_START` | Match began, includes model names and ship layouts |
| `GAME_STATE_UPDATE` | Full board state snapshot |
| `REASONING_CHUNK` | `{ player, text, done }` — streamed token batch |
| `MOVE_RESULT` | `{ move, gameState }` — result of a fired shot |
| `HEATMAP_UPDATE` | `{ player, grid }` — probability grid (100 floats) |
| `GAME_OVER` | `{ winner, totalTurns, durationMs }` |
| `SPECTATOR_COUNT` | `{ count }` — current spectators in room |
| `ERROR` | `{ code, message, recoverable }` |

---

## Design decisions

**postgres.js over Prisma** — Prisma's query engine runs as a separate binary process (~50MB), has measurable latency overhead for high-frequency writes, and its JSONB support is weaker. postgres.js uses tagged template literals, handles JSONB natively, and has no separate process.

**HS256 JWT without jsonwebtoken** — Node's built-in `crypto` is sufficient for HS256. Avoids a dependency with a history of CVEs, uses constant-time comparison for all signature checks.

**scrypt over bcrypt** — scrypt is memory-hard (harder to GPU-accelerate), available in Node's built-in `crypto` since v10. Parameters (N=16384, r=8, p=1) give ~100ms on modern hardware.

**No ORM for queries** — SQL is readable, portable, and predictable. The schema is canonical DDL in `db/schema.sql` — no migration framework overhead.

**Reasoning buffered in 150ms chunks** — raw streaming token-by-token at model speed overwhelms Socket.io with hundreds of tiny messages per second. 150ms batching on the server gives smooth UX with ~7 updates/second.

**Cost stored as integer micro-USD** — floating-point drift on `FLOAT` columns is a real problem for financial values. `INTEGER` storing millionths of a dollar (e.g. `$0.001234` → `1234`) is lossless and sortable.

**Both boards fully visible to spectators** — this is a *spectator sport*, not a game the viewer plays. Hiding boards would make it harder to follow the action.

---

## Cost management

Each match has a hard cap of **$0.50 USD** total (`MATCH_COST_HARD_CAP_USD` in `AIClient.ts`). When the cap is reached the AI orchestrator falls back to a random valid move rather than calling the API. Match cost is tracked per-move in micro-USD in the `moves` table and aggregated in the admin dashboard.

Approximate cost per match by model pair (100-move game):

| Pair | Est. cost |
|---|---|
| Claude Haiku 4.5 vs GPT-4o mini | ~$0.02 |
| Claude Sonnet 4.6 vs GPT-4o | ~$0.15 |
| Claude Opus 4.6 vs GPT-4o | ~$0.40 |

---

## Extending

**Adding a new AI provider:** Implement the `AIClient` interface in `apps/game-server/src/ai/AIClient.ts` and add a prefix to the `createOrchestrator` factory switch in `AIOrchestrator.ts`.

**Adding match replay:** The `transcripts` table stores a full denormalised JSON snapshot of every completed match. A replay page would fetch `/api/matches/:id/transcript` and step through `moves` with a timer.

**Adding a leaderboard:** `matchRepository.getStats()` already returns per-model-pair win counts. Wire it to a public `/leaderboard` page with no auth required.
