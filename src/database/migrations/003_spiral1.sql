-- Migration: 003_spiral1.sql
-- Spiral 1 / MVP 2.0

-- 1.1 sprints: тип спринта
ALTER TABLE sprints
  ADD COLUMN IF NOT EXISTS type VARCHAR(30) NOT NULL DEFAULT 'sprint'
  CHECK (type IN ('sprint', 'monthly_goal'));

-- 1.2 users: настройки напоминаний (timezone уже есть)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS reminder_morning  VARCHAR(5) NOT NULL DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS reminder_evening  VARCHAR(5) NOT NULL DEFAULT '18:00',
  ADD COLUMN IF NOT EXISTS reminders_enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- 1.3 plan_items: учёт времени + причина пропуска
ALTER TABLE plan_items
  ADD COLUMN IF NOT EXISTS planned_minutes INTEGER     DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS actual_minutes  INTEGER     DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_worked_at  TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS skip_reason     VARCHAR(50) DEFAULT NULL;

-- 1.4 goal_metrics
CREATE TABLE IF NOT EXISTS goal_metrics (
  id            BIGSERIAL PRIMARY KEY,
  sprint_id     BIGINT  NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
  title         VARCHAR(500) NOT NULL,
  target_value  NUMERIC DEFAULT NULL,
  current_value NUMERIC NOT NULL DEFAULT 0,
  unit          VARCHAR(10) NOT NULL DEFAULT 'num'
                CHECK (unit IN ('num', 'rub', 'pct', 'bool')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_goal_metrics_sprint_id ON goal_metrics (sprint_id);

-- 1.5 quarterly_reviews
CREATE TABLE IF NOT EXISTS quarterly_reviews (
  id            BIGSERIAL PRIMARY KEY,
  user_id       BIGINT   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quarter       SMALLINT NOT NULL CHECK (quarter BETWEEN 1 AND 4),
  year          SMALLINT NOT NULL,
  status        VARCHAR(20) NOT NULL DEFAULT 'in_progress'
                CHECK (status IN ('in_progress', 'completed')),
  current_block SMALLINT NOT NULL DEFAULT 1,
  summary       TEXT DEFAULT NULL,
  focus_90_days TEXT DEFAULT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_quarterly_reviews_user_id ON quarterly_reviews (user_id);

-- 1.6 review_answers
CREATE TABLE IF NOT EXISTS review_answers (
  id            BIGSERIAL PRIMARY KEY,
  review_id     BIGINT   NOT NULL REFERENCES quarterly_reviews(id) ON DELETE CASCADE,
  block         SMALLINT NOT NULL,
  question_idx  SMALLINT NOT NULL,
  question_text TEXT     NOT NULL,
  answer        TEXT     NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_review_answers_review_id ON review_answers (review_id);
