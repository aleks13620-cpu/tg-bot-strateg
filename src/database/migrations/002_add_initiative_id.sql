-- Migration: 002_add_initiative_id.sql
-- Привязка задач к конкретной инициативе спринта

ALTER TABLE plan_items
  ADD COLUMN initiative_id BIGINT DEFAULT NULL
  REFERENCES initiatives(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_plan_items_initiative_id ON plan_items (initiative_id);
