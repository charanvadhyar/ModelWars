-- ─────────────────────────────────────────────────────────────────────────────
-- db/schema.sql
-- Canonical database schema for Model Wars.
-- Apply with: psql $DATABASE_URL -f db/schema.sql
-- Or run via: npm run db:migrate
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable uuid generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Enums ─────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE match_status AS ENUM (
    'PENDING', 'PLACING', 'IN_PROGRESS', 'COMPLETED', 'ARCHIVED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE player_side AS ENUM ('A', 'B');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE shot_result AS ENUM ('HIT', 'MISS', 'SUNK');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('SPECTATOR', 'ADMIN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── users ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id            UUID        NOT NULL DEFAULT gen_random_uuid(),
  email         TEXT        NOT NULL,
  password_hash TEXT        NOT NULL,
  role          user_role   NOT NULL DEFAULT 'SPECTATOR',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT users_pkey PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users (email);

-- ── matches ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS matches (
  id              UUID         NOT NULL DEFAULT gen_random_uuid(),
  status          match_status NOT NULL DEFAULT 'PENDING',
  model_a         TEXT         NOT NULL,
  model_b         TEXT         NOT NULL,
  winner          player_side,

  -- Stats — null until game ends
  total_turns     INTEGER,
  duration_ms     INTEGER,
  total_cost_us   INTEGER,          -- micro-USD: $0.42 → 420000

  -- Ship layouts stored as JSONB (ShipPlacement[])
  ship_layout_a         JSONB        NOT NULL DEFAULT '[]',
  ship_layout_b         JSONB        NOT NULL DEFAULT '[]',

  -- Model's own reasoning for fleet placement
  placement_reasoning_a TEXT,
  placement_reasoning_b TEXT,

  -- True when a model forfeited (failed to produce valid moves after retries)
  forfeited             BOOLEAN      NOT NULL DEFAULT FALSE,

  created_by_id   UUID,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT matches_pkey PRIMARY KEY (id),
  CONSTRAINT matches_created_by_fkey
    FOREIGN KEY (created_by_id) REFERENCES users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS matches_status_idx     ON matches (status);
CREATE INDEX IF NOT EXISTS matches_created_at_idx ON matches (created_at DESC);

-- ── moves ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS moves (
  id                UUID        NOT NULL DEFAULT gen_random_uuid(),
  match_id          UUID        NOT NULL,
  turn_number       INTEGER     NOT NULL,
  player            player_side NOT NULL,
  coordinate        TEXT        NOT NULL,    -- e.g. "D5"
  result            shot_result NOT NULL,
  ship_sunk_id      TEXT,                    -- e.g. "DESTROYER"

  reasoning         TEXT        NOT NULL,
  strategy_tag      TEXT,

  -- Flat 100-element float array [row0col0 ... row9col9]
  heatmap           JSONB       NOT NULL DEFAULT '[]',

  prompt_tokens     INTEGER     NOT NULL,
  completion_tokens INTEGER     NOT NULL,
  latency_ms        INTEGER     NOT NULL,
  cost_us           INTEGER     NOT NULL,    -- micro-USD
  is_fallback       BOOLEAN     NOT NULL DEFAULT FALSE,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT moves_pkey       PRIMARY KEY (id),
  CONSTRAINT moves_match_turn UNIQUE (match_id, turn_number),
  CONSTRAINT moves_match_fkey
    FOREIGN KEY (match_id) REFERENCES matches (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS moves_match_id_idx ON moves (match_id);
CREATE INDEX IF NOT EXISTS moves_player_idx   ON moves (player);

-- ── transcripts ───────────────────────────────────────────────────────────────
-- Denormalised full-match JSON for fast export without re-joining moves.

CREATE TABLE IF NOT EXISTS transcripts (
  id          UUID        NOT NULL DEFAULT gen_random_uuid(),
  match_id    UUID        NOT NULL,
  full_json   JSONB       NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT transcripts_pkey          PRIMARY KEY (id),
  CONSTRAINT transcripts_match_unique  UNIQUE (match_id),
  CONSTRAINT transcripts_match_fkey
    FOREIGN KEY (match_id) REFERENCES matches (id) ON DELETE CASCADE
);

-- ── quiz_matches ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS quiz_matches (
  id           UUID        NOT NULL DEFAULT gen_random_uuid(),
  status       TEXT        NOT NULL DEFAULT 'PREPARING',
  topic        TEXT        NOT NULL,
  model_a      TEXT        NOT NULL,
  model_b      TEXT        NOT NULL,
  winner       TEXT,                            -- 'A', 'B', or 'TIE'
  score_a      INTEGER,
  score_b      INTEGER,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  CONSTRAINT quiz_matches_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS quiz_matches_created_at_idx ON quiz_matches (created_at DESC);

-- ── quiz_questions ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS quiz_questions (
  id               UUID        NOT NULL DEFAULT gen_random_uuid(),
  match_id         UUID        NOT NULL,
  asked_by         TEXT        NOT NULL CHECK (asked_by IN ('A','B')),
  asked_to         TEXT        NOT NULL CHECK (asked_to IN ('A','B')),
  tier             INTEGER     NOT NULL CHECK (tier IN (1,2,3)),
  marks            INTEGER     NOT NULL CHECK (marks IN (1,2,3)),
  question_text    TEXT        NOT NULL,
  expected_answer  TEXT        NOT NULL,
  given_answer     TEXT,
  score            INTEGER,
  grading_feedback TEXT,
  question_order   INTEGER     NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT quiz_questions_pkey       PRIMARY KEY (id),
  CONSTRAINT quiz_questions_match_fkey
    FOREIGN KEY (match_id) REFERENCES quiz_matches (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS quiz_questions_match_idx ON quiz_questions (match_id);

-- ── Migrations (idempotent — safe to re-run on existing databases) ─────────────

ALTER TABLE matches ADD COLUMN IF NOT EXISTS placement_reasoning_a TEXT;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS placement_reasoning_b TEXT;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS forfeited BOOLEAN NOT NULL DEFAULT FALSE;
