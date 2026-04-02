# Reminder And Start Copy Flow

## Rule
- One message = one clear action.
- First line answers: why now.
- CTA uses one verb and one destination.

## Current Types

### Morning (`getMorningMessage`)
- Trigger: local morning reminder window.
- Why now: start of day and focus context.
- CTA: `✅ Сегодня` -> `action_today_checklist`.
- Notes: includes streak, sprint context, key task, nearby days.

### Midday (`getMidDayMessage`)
- Trigger: weekday, no done tasks yet, pending exists.
- Why now: restart execution in the middle of day.
- CTA: `✅ Сегодня` -> `action_today_checklist`.
- Notes: keep short and directive.

### Evening (`getEveningMessage`)
- Trigger: evening reminder window.
- Why now: close loop before day ends.
- CTA: `📊 Закрыть день` -> `action_close_day`.
- Notes: if all closed, still asks to close day for streak.

### Reactivation (`getReactivationMessage`)
- Trigger: inactive > 3 days.
- Why now: return-to-routine prompt.
- CTA: `✅ Сегодня` -> `action_today_checklist`.
- Notes: should feel like soft restart, not warning.

### Weekly (`getWeeklyMessage`)
- Trigger: Saturday weekly window.
- Why now: review and decision point.
- CTA primary: `🔍 Разобрать несделанное` -> `action_weekly_review`.
- Secondary: `📊 Подробная аналитика` -> `action_week_stats_0`.

## Start Flow

### New user (`/start`)
- Message 1: short purpose.
- Message 2: one primary CTA (`🚀 Начать`) + secondary (`💡 Как это работает`).

### Returning user (`/start`)
- One short message with immediate next step.
- CTA: execution first (`✅ Сегодня`), planning as secondary.

## Desired Improvements (for next stages)
- Reduce long informational tails in reminders.
- Keep one primary CTA in every reminder type.
- Keep help content two-layer: short -> detailed.
