# Rollout: AI in no-strategy branch

## Flags
- `AI_ENABLED` — global AI adapter switch.
- `AI_NO_STRATEGY_ENABLED` — no-strategy onboarding AI switch.

## Safe rollout order
1. Deploy code with both flags off:
   - `AI_ENABLED=0`
   - `AI_NO_STRATEGY_ENABLED=0`
2. Enable adapter only (shadow-ready):
   - `AI_ENABLED=1`
   - `AI_NO_STRATEGY_ENABLED=0`
   - Verify existing coaching pilot is stable.
3. Enable no-strategy AI:
   - `AI_ENABLED=1`
   - `AI_NO_STRATEGY_ENABLED=1`
4. Monitor first sessions and keep fast rollback ready.

## Smoke checklist (after step 3)
- New user `/start` -> `Начать` -> branch `Нет, хочу определить`.
- Select area + bandwidth.
- Result shows 3-5 compact action steps.
- If model unavailable, fallback steps still shown.
- CTA buttons continue normal flow (`Добавить задачи`, `Меню`).

## Rollback (instant)
- Set `AI_NO_STRATEGY_ENABLED=0` and redeploy/restart.
- If wider issue: also set `AI_ENABLED=0`.

## Stability notes
- AI output is normalized and capped to max 5 lines.
- If AI returns invalid/short output (<3 lines), deterministic fallback is used.
- Timeout/retry limits are controlled by:
  - `AI_TIMEOUT_MS`
  - `AI_RETRIES`
