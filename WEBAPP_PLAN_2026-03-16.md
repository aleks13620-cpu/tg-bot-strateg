# Mini App MVP — Фаза 1 (Дашборд)
**Дата:** 2026-03-16 | **Оценка:** 10 этапов × ≤4 ч = ~40 ч

## Статус этапов
- [x] Этап 1 — Auth utility
- [x] Этап 2 — API: Sprint + Metrics
- [x] Этап 3 — API: Analytics + Tasks
- [x] Этап 4 — Webapp scaffold
- [x] Этап 5 — UI primitives + SprintCard
- [x] Этап 6 — FocusStats + TimeStats
- [x] Этап 7 — DirectionsList + MetricsList + TasksList
- [x] Этап 8 — Dashboard assembly + dark theme
- [x] Этап 9 — Bot button + deploy config
- [ ] Этап 10 — E2E тестирование + фиксы

---

## Этап 1 — Auth utility
**Файл:** `src/utils/webappAuth.js`

Алгоритм HMAC-SHA256 верификации `initData`:
1. parse URLSearchParams → extract hash
2. sort остальные пары → build data_check_string
3. `secret_key = HMAC-SHA256("WebAppData", BOT_TOKEN)`
4. `computed = HMAC-SHA256(data_check_string, secret_key)` → compare hex
5. Extract telegramUser.id → `getUserByTelegramId(id)` → вернуть `{user, telegramUser}`

---

## Этап 2 — API: Sprint + Metrics
**Файлы:** `api/webapp/sprints.js`, `api/webapp/metrics.js`, `vercel.json`

- `GET /api/webapp/sprints/active` → sprint + initiatives + day_number/days_left + financial_current + metrics (если monthly_goal)
- `GET /api/webapp/metrics?sprint_id=...` → goal_metrics + progress_percent
- Переиспользует: `getActiveSprint`, `getGoalMetricsBySprint`

---

## Этап 3 — API: Analytics + Tasks
**Файлы:** `api/webapp/analytics.js`, `api/webapp/tasks.js`, `vercel.json`

- `GET /api/webapp/analytics/focus?period=today|week|sprint`
  - Переиспользует `getDayStats` / `getWeekStats` / `getSprintStats`
  - by_direction: кастомный запрос plan_items → группировка по initiative.title, '_fire_' для вне стратегии
- `GET /api/webapp/tasks/today` → план на сегодня + summary

---

## Этап 4 — Webapp scaffold
**Файлы:** `webapp/` (Vite+React+Tailwind), `hooks/useTelegram.js`, `api/client.js`, `utils/format.js`

---

## Этап 5 — UI primitives + SprintCard
**Файлы:** `components/ui/`, `components/layout/`, `components/dashboard/SprintCard.jsx`, `hooks/useSprint.js`

---

## Этап 6 — FocusStats + TimeStats
**Файлы:** `FocusStats.jsx`, `TimeStats.jsx`, `hooks/useFocus.js`, period switcher → localStorage

---

## Этап 7 — DirectionsList + MetricsList + TasksList
**Файлы:** три компонента. DirectionsList сортировка по completion_rate ASC. MetricsList только для monthly_goal.

---

## Этап 8 — Dashboard assembly + dark theme
**Файлы:** `pages/Dashboard.jsx`, dark mode через `document.documentElement.classList`, error states

---

## Этап 9 — Bot button + deploy config
**Файлы:** `progress.js`, `start.js` — `Markup.button.webApp('📊 Дашборд', WEBAPP_URL)`. `vercel.json` финал со static build webapp.

---

## Этап 10 — E2E тестирование + фиксы
5 сценариев: спринт / monthly_goal / без спринта / вне стратегии / 0 задач. iOS + Android. Dark/light.

---

## Ключевые зависимости кода
- `config/database.js` → `{ supabase }` — во всех API
- `src/database/queries/users.js` → `getUserByTelegramId`
- `src/database/queries/sprints.js` → `getActiveSprint`
- `src/database/queries/goalMetrics.js` → `getGoalMetricsBySprint`
- `src/database/queries/planItems.js` → `getPlanItemsByDate`
- `src/services/analytics.js` → `getDayStats`, `getWeekStats`, `getSprintStats`
