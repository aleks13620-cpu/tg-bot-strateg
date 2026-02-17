-- Migration: 001_initial.sql
-- Все основные таблицы Стратег-Ассистент MVP v1.2

-- ============================================
-- USERS
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id            BIGSERIAL PRIMARY KEY,
    telegram_id   BIGINT NOT NULL UNIQUE,
    timezone      VARCHAR(50) NOT NULL DEFAULT 'Europe/Moscow',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users (telegram_id);

-- ============================================
-- SPRINTS
-- ============================================
CREATE TABLE IF NOT EXISTS sprints (
    id            BIGSERIAL PRIMARY KEY,
    user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    start_date    DATE NOT NULL,
    end_date      DATE NOT NULL,
    goal_text     TEXT NOT NULL DEFAULT '',
    status        VARCHAR(20) NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'completed', 'cancelled')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sprints_user_id ON sprints (user_id);
CREATE INDEX IF NOT EXISTS idx_sprints_user_status ON sprints (user_id, status);

-- ============================================
-- INITIATIVES
-- ============================================
CREATE TABLE IF NOT EXISTS initiatives (
    id                     BIGSERIAL PRIMARY KEY,
    sprint_id              BIGINT NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
    title                  VARCHAR(500) NOT NULL,
    rcd_type               VARCHAR(20) NOT NULL DEFAULT 'regular'
                           CHECK (rcd_type IN ('regular', 'challenge', 'delegation')),
    success_criteria_text  TEXT NOT NULL DEFAULT '',
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_initiatives_sprint_id ON initiatives (sprint_id);

-- ============================================
-- PLAN_ITEMS
-- ============================================
CREATE TABLE IF NOT EXISTS plan_items (
    id            BIGSERIAL PRIMARY KEY,
    user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date          DATE NOT NULL,
    text_raw      TEXT NOT NULL,
    status        VARCHAR(20) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'done', 'skipped', 'moved')),
    is_strategic  BOOLEAN NOT NULL DEFAULT FALSE,
    time_minutes  INTEGER DEFAULT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plan_items_user_date ON plan_items (user_id, date);

-- ============================================
-- COACHING_QUESTIONS
-- ============================================
CREATE TABLE IF NOT EXISTS coaching_questions (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question_text   TEXT NOT NULL,
    asked_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_answer     TEXT DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_coaching_user_id ON coaching_questions (user_id);
