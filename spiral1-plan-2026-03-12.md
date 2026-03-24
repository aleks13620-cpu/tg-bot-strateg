# Спираль 1 / MVP 2.0 — План реализации по этапам

**Дата:** 2026-03-12
**Общая оценка ТЗ:** 61–79 ч
**Размер этапа:** ≤ 4 ч
**Итого этапов:** 18

Порядок строгий — каждый следующий этап опирается на предыдущий.

---

## Этап 1 — DB Migrations (≈ 1.5 ч)

**Цель:** Создать все новые таблицы и колонки в Supabase.

**Задачи:**
- Создать `src/database/migrations/003_spiral1.sql` со всеми ALTER TABLE и CREATE TABLE (Block 1.1–1.6 из ТЗ)
- Применить миграцию в Supabase (SQL Editor → Run)

**Файлы:**
- `src/database/migrations/003_spiral1.sql` (новый)

**Проверка:**
- В Supabase Table Editor видны новые колонки в `sprints`, `plan_items`, `users`
- Видны новые таблицы: `goal_metrics`, `quarterly_reviews`, `review_answers`

---

## Этап 2 — DB Query Layer: goalMetrics + quarterlyReviews (≈ 3 ч)

**Цель:** Написать функции для работы с новыми таблицами.

**Задачи:**
- Создать `src/database/queries/goalMetrics.js`:
  - `createGoalMetric(sprintId, title, targetValue, unit)`
  - `getGoalMetricsBySprint(sprintId)`
  - `updateGoalMetricValue(metricId, currentValue)`
  - `deleteGoalMetric(metricId)`
- Создать `src/database/queries/quarterlyReviews.js`:
  - `createReview(userId, quarter, year)`
  - `getActiveReview(userId)`
  - `getCompletedReviews(userId)`
  - `saveReviewAnswer(reviewId, block, qIdx, qText, answer)`
  - `completeReview(reviewId, summary, focus90)`
  - `updateReviewBlock(reviewId, currentBlock)`

**Файлы:**
- `src/database/queries/goalMetrics.js` (новый)
- `src/database/queries/quarterlyReviews.js` (новый)

**Проверка:**
- Функции экспортируются без ошибок (`require` в REPL)
- Supabase возвращает данные по тестовому запросу

---

## Этап 3 — DB Query Layer: sprints type + users settings (≈ 1.5 ч)

**Цель:** Расширить существующие query-файлы под новые поля.

**Задачи:**
- `src/database/queries/sprints.js` → добавить параметр `type='sprint'` в `createSprint`, включить в INSERT
- `src/database/queries/users.js` → добавить функцию `updateUserSettings(userId, { reminderMorning, reminderEvening, remindersEnabled, timezone })`

**Файлы:**
- `src/database/queries/sprints.js` (изменить)
- `src/database/queries/users.js` (изменить)

**Проверка:**
- `createSprint` с `type='monthly_goal'` сохраняет значение в БД
- `updateUserSettings` обновляет поля в таблице `users`

---

## Этап 4 — Services: sprint formatters + startNewSprint (≈ 2 ч)

**Цель:** Сервисный слой для типов спринтов.

**Задачи:**
- `src/services/sprint.js`:
  - `startNewSprint(userId, goal, directions, duration, financialGoal, sprintType='sprint')` — добавить параметр `sprintType`, передать в `createSprint`
  - `formatSprint(sprint)` — заголовок: `🎯 Цель 30 дней: ...` если `type === 'monthly_goal'`, иначе `🎯 Спринт: ...`
  - `formatSprintCompact(sprint, idx, total)` — аналогично

**Файлы:**
- `src/services/sprint.js` (изменить)

**Проверка:**
- `formatSprint({ type: 'monthly_goal', goal_text: 'Тест' })` возвращает "Цель 30 дней"
- `formatSprint({ type: 'sprint', goal_text: 'Тест' })` возвращает "Спринт"

---

## Этап 5 — Onboarding: выбор типа спринта + 30 дней (≈ 4 ч)

**Цель:** Добавить ветку monthly_goal в WizardScene.

**Задачи:**
- `src/bot/scenes/onboarding.js`:
  - Шаг 1 (двухпроходный): принять текст цели → показать кнопки `[🗂 Обычный спринт]` / `[🎯 30-дневная цель]`, ждать callback
  - По callback: сохранить `ctx.wizard.state.sprintType`; если 'sprint' — показать prompt направлений и `next()`; если 'monthly_goal' — `ctx.wizard.selectStep(3)` (пропустить шаг направлений)
  - Шаг 3 `showDurationPrompt`: если `monthly_goal` — показывать только `[30 дней]` (callback `onboarding_dur_30`); иначе `[7]`, `[14]`, `[21]`
  - Шаг 4 (confirm): передавать `sprintType` в `startNewSprint`; если `monthly_goal` — после создания показать кнопки `[➕ Добавить метрику]` / `[⏭ Пропустить]`

**Новые callbacks:** `onboarding_type_sprint`, `onboarding_type_monthly`, `onboarding_dur_30`

**Файлы:**
- `src/bot/scenes/onboarding.js` (изменить)

**Проверка:**
- Создание обычного спринта (7/14/21 дней) — работает как прежде
- Создание 30-дневной цели — тип `monthly_goal` сохраняется в БД, duration = 30
- После создания monthly_goal предлагает добавить метрику

---

## Этап 6 — Metrics handler (≈ 4 ч)

**Цель:** Полный flow добавления и обновления метрик целей.

**Задачи:**
- Создать `src/bot/handlers/metrics.js`:
  - `bot.command('metrics')` — показать метрики активного monthly_goal спринта
  - Добавление метрики (из onboarding кнопки): `metric_add_SPRINTID` → спрашивать title → target_value → unit (кнопки: `metric_unit_sht_ID`, `metric_unit_rub_ID`, `metric_unit_pct_ID`, `metric_unit_bool_ID`) → сохранить, предложить добавить ещё (max 3)
  - `metric_update_METRICID` → `ctx.session.awaitingMetricInput = { metricId, unit }` → ввод → сохранить
  - `metric_skip_add` — завершить добавление метрик
  - Для `unit=bool` (`да/нет`): кнопки `[Да ✓]` / `[Нет]` вместо числового ввода
- `src/services/analytics.js` → добавить `formatMetricsBlock(metrics)` с прогресс-барами
- `src/bot/index.js` → `registerMetricsHandlers(bot)` добавить на позицию 5 (до registerPlanHandlers)

**Session state:** `awaitingMetricTitle`, `awaitingMetricTarget`, `awaitingMetricInput`, `metricsAdded`

**Файлы:**
- `src/bot/handlers/metrics.js` (новый)
- `src/services/analytics.js` (изменить — добавить formatMetricsBlock)
- `src/bot/index.js` (изменить — регистрация)

**Проверка:**
- После создания 30-дневной цели можно добавить 1–3 метрики
- `/metrics` показывает текущие значения с прогресс-барами
- Кнопка «Обновить» обновляет значение метрики

---

## Этап 7 — Учёт планового времени при добавлении задачи (≈ 3 ч)

**Цель:** Опциональный вопрос о времени при добавлении одной задачи.

**Задачи:**
- `src/bot/handlers/plan.js`:
  - В `advanceToNextQualification` / `finishQualification`: если `qualificationItems.length === 1` (одиночная задача), после key-task вопроса — вызвать `askPlannedTimeQuestion(ctx, item)`
  - Функция `askPlannedTimeQuestion`: показать кнопки `[15 мин]` `[30 мин]` `[1 час]` `[2 часа]` `[⏭ Пропустить]`, сохранить `ctx.session.awaitingPlannedTime = itemId`
  - `bot.action(/^planned_time_(\d+)_(.+)$/)` → `updatePlanItem(itemId, { planned_minutes })`, очистить сессию, завершить квалификацию

**Новые callbacks:** `planned_time_(\d+)_(.+)` (0 = пропустить)

**Файлы:**
- `src/bot/handlers/plan.js` (изменить)

**Проверка:**
- Добавление одной задачи: в конце квалификации показывается вопрос о времени
- При пропуске (`planned_time_0_ID`) — задача добавляется без времени
- Добавление нескольких задач (bulk) — вопрос о времени НЕ показывается

---

## Этап 8 — Учёт фактического времени в dayClose (≈ 4 ч)

**Цель:** Фиксировать затраченное время при выполнении задачи.

**Задачи:**
- `src/bot/handlers/dayClose.js`:
  - В `handleTaskStatus(ctx, itemId, 'done')` после редактирования сообщения: показать новое сообщение с кнопками `[15 мин]` `[30 мин]` `[45 мин]` `[1 час]` `[2 часа]` `[⏭ Пропустить]`; сохранить `ctx.session.awaitingActualTime = itemId`
  - `bot.action(/^actual_time_(\d+)_(.+)$/)` → `updatePlanItem(itemId, { actual_minutes, last_worked_at: new Date() })`, очистить сессию
  - Блок "незавершённые задачи" (Block 4.3): перед `dayclose_summary` проверить наличие `pending`-задач (не нажатых пользователем) — показать до 3 с кнопками `[⏱ Работал]` / `[Нет]`; callback `worked_on_(.+)` → показать кнопки времени; `not_worked_(.+)` → пропустить
- `src/services/analytics.js`:
  - `getDayStats` → добавить `totalPlannedMinutes`, `totalActualMinutes` в возврат
  - `formatDayStats` → добавить `⏱ Сегодня: Xч Yмин` если `totalActualMinutes > 0`

**Новые callbacks:** `actual_time_(\d+)_(.+)`, `worked_on_(.+)`, `not_worked_(.+)`

**Файлы:**
- `src/bot/handlers/dayClose.js` (изменить)
- `src/services/analytics.js` (изменить)

**Проверка:**
- Нажать ✅ на задаче → появляется вопрос о времени → выбрать 30 мин → в итогах дня отображается "⏱ 30 мин"
- Нажать ⏭ Пропустить → задача закрывается без вопроса о времени
- Существующий flow dayClose работает корректно

---

## Этап 9 — Причины пропуска задач (≈ 3 ч)

**Цель:** Собирать причины при пропуске задачи в dayClose.

**Задачи:**
- `src/bot/handlers/dayClose.js`:
  - В `handleTaskStatus(ctx, itemId, 'skipped')`: сначала получить задачу из БД, если `skip_reason` уже есть — не спрашивать; иначе показать кнопки причин:
    ```
    [Осознанно отказался]     → skip_r_dcl_ITEMID
    [Не хватило времени]      → skip_r_ntt_ITEMID
    [Потеряла актуальность]   → skip_r_nrl_ITEMID
    [Был расфокус]            → skip_r_lfc_ITEMID
    [Слишком большая задача]  → skip_r_tbg_ITEMID
    [Вытеснило срочное]       → skip_r_urd_ITEMID
    [Другое]                  → skip_r_oth_ITEMID
    ```
  - `bot.action(/^skip_r_([^_]+)_(.+)$/)` → маппинг короткого кода в `skip_reason`, `updatePlanItem(itemId, { skip_reason })`
- `src/services/analytics.js`:
  - `getWeekStats` → добавить `skipReasons: { dcl: 0, ntt: 0, ... }` в возврат
  - `formatWeekStats` → добавить раздел `📉 Причины пропуска` + если одна причина ≥3 раз — coaching-подсказка

**Новые callbacks:** `skip_r_([^_]+)_(.+)`

**Файлы:**
- `src/bot/handlers/dayClose.js` (изменить)
- `src/services/analytics.js` (изменить)

**Проверка:**
- ⏭ на задаче → появляется выбор причины → сохраняется в БД
- Повторный пропуск той же задачи → вопрос НЕ появляется
- В /progress → weekly stats показывает причины пропуска

---

## Этап 10 — Недельный разбор несделанного (≈ 4 ч)

**Цель:** Расширить еженедельный отчёт и добавить интерактивный разбор.

**Задачи:**
- `src/services/reminder.js` → расширить `getWeeklyMessage`:
  - Добавить таблицу выполнения по направлениям (done/total per initiative из `getWeekStats`)
  - Пометить направления с 0% выполнением символом ⚠️
  - Добавить раздел причин пропуска (из `skipReasons`)
  - Добавить кнопку `[🔍 Разобрать несделанное]` → callback `action_weekly_review`
- `src/bot/handlers/dayClose.js` (или новый `weeklyReview.js`):
  - `bot.action('action_weekly_review')` → получить топ-3 незавершённых задачи за прошлую неделю (status pending/skipped, sorted by is_key_task desc, date)
  - Для каждой: показать карточку с кнопками `[📅 Перенести]` / `[✂️ Упростить]` / `[❌ Отменить]`
  - Callbacks: `weekly_reschedule_(.+)` → date picker, `weekly_simplify_(.+)` → запросить новый текст, `weekly_cancel_(.+)` → пометить moved
  - После всех задач: показать итог + мягкую рекомендацию

**Новые callbacks:** `action_weekly_review`, `weekly_reschedule_(.+)`, `weekly_simplify_(.+)`, `weekly_cancel_(.+)`

**Файлы:**
- `src/services/reminder.js` (изменить)
- `src/bot/handlers/dayClose.js` (изменить — добавить action_weekly_review)

**Проверка:**
- Еженедельное сообщение содержит раздел о невыполненных задачах
- Кнопка "Разобрать" показывает до 3 задач с action-кнопками
- Перенос / упрощение / отмена задачи работают корректно

---

## Этап 11 — Квартальный обзор: DB + Scene (≈ 4 ч)

**Цель:** Создать WizardScene для квартального обзора.

**Задачи:**
- Создать `src/bot/scenes/quarterlyReview.js` — WizardScene `'quarterly_review'`:
  - 11 шагов (9 вопросов + вводный + финальный)
  - Вопросы сгруппированы по 4 блокам (из ТЗ Block 7.2)
  - После каждого ответа — немедленно сохранять в `review_answers` (без await — serverless защита)
  - Кнопка `[Продолжить позже]` на каждом шаге → `ctx.scene.leave()` + `updateReviewBlock`
  - Финальный шаг: показать саммари ответов → запросить `focus_90_days` → предложить `[Создать 30-дневную цель]` / `[Позже]`
  - Кнопка "Создать цель" → `ctx.scene.enter('onboarding')`
  - Восстановление прогресса: при входе в сцену проверять `current_block` из DB, использовать `ctx.wizard.selectStep`

**Файлы:**
- `src/bot/scenes/quarterlyReview.js` (новый)

**Проверка:**
- Сцена проходит все 4 блока
- При выходе на полпути: ответы сохранены в БД, `current_block` обновлён
- При повторном входе: предлагает продолжить с нужного места

---

## Этап 12 — Квартальный обзор: handler + регистрация (≈ 2 ч)

**Цель:** Подключить квартальный обзор к боту.

**Задачи:**
- Создать `src/bot/handlers/review.js`:
  - `bot.command('review')` → `getActiveReview(userId)` → если есть → предложить продолжить или начать заново; если нет → `createReview` → войти в сцену
  - `bot.command('reviews')` → показать список завершённых обзоров из `getCompletedReviews`
  - `bot.action('review_start')` / `bot.action('review_skip')` — для кнопок в reminder-сообщениях
- `src/services/reminder.js` → в `getWeeklyMessage` добавить: если с последнего completed review >85 дней — добавить блок-напоминание с кнопкой `[🔄 Начать квартальный обзор]`
- `src/bot/index.js`:
  - Добавить `quarterlyReviewScene` в `new Scenes.Stage([...])`
  - `registerReviewHandlers(bot)` — добавить на позицию 7 (до registerPlanHandlers)

**Файлы:**
- `src/bot/handlers/review.js` (новый)
- `src/services/reminder.js` (изменить — добавить триггер)
- `src/bot/index.js` (изменить)

**Проверка:**
- `/review` запускает обзор (новый или продолжение)
- `/reviews` показывает историю завершённых обзоров
- Обзор заносится в `quarterly_reviews` с нужным статусом

---

## Этап 13 — Settings handler (≈ 3 ч)

**Цель:** Команда /settings для управления напоминаниями.

**Задачи:**
- Создать `src/bot/handlers/settings.js`:
  - `bot.command('settings')` + `bot.action('action_settings')` (перехватывает заглушку из start.js)
  - Меню: показать текущие настройки + кнопки изменения
  - `settings_morning` → показать кнопки времени `[7:00]` `[8:00]` `[9:00]` `[10:00]` `[Ввести своё]`; сохранить `ctx.session.awaitingMorningTime = true`
  - `settings_evening` → аналогично, `awaitingEveningTime = true`
  - Text handler: если `awaitingMorningTime` или `awaitingEveningTime` → валидировать формат HH:MM → `updateUserSettings`
  - `settings_timezone` → показать кнопки: `settings_tz_Europe/Moscow`, `settings_tz_Europe/Kiev`, `settings_tz_Asia/Almaty`, `settings_tz_Asia/Novosibirsk`, `settings_tz_Asia/Vladivostok`
  - `settings_toggle_reminders` → инвертировать `reminders_enabled` в БД
- `src/bot/handlers/start.js` → удалить заглушку `bot.action('action_settings', ...)` (3 строки)
- `src/bot/index.js` → `registerSettingsHandlers(bot)` добавить на позицию 6 (до registerPlanHandlers)

**Session state:** `awaitingMorningTime`, `awaitingEveningTime`

**Файлы:**
- `src/bot/handlers/settings.js` (новый)
- `src/bot/handlers/start.js` (изменить — удалить заглушку)
- `src/bot/index.js` (изменить)

**Проверка:**
- `/settings` и кнопка ⚙️ открывают меню настроек
- Изменение времени утра/вечера сохраняется в БД
- Смена timezone сохраняется в БД
- Выключение напоминаний сохраняет `reminders_enabled = false`

---

## Этап 14 — Reminder: getUsersToRemindNow (≈ 4 ч)

**Цель:** Логика выбора пользователей для напоминания по их timezone и настройкам.

**Задачи:**
- `src/services/reminder.js`:
  - Добавить функцию `getUsersToRemindNow(nowUtc)`:
    - Для каждого пользователя: конвертировать `nowUtc` в его `timezone` через `Intl.DateTimeFormat`
    - Сравнить локальное время с `reminder_morning` и `reminder_evening` (окно ±15 мин)
    - Если `reminders_enabled = false` → пропустить
    - Вернуть `[{ user, type: 'morning'|'evening' }]`
  - Midday: добавить в массив пользователей у которых ~4 часа прошло после `reminder_morning` по их TZ
  - Reactivation: понедельник UTC + `last_active_at > 3` дней назад (без TZ)
  - Weekly: суббота по TZ пользователя
  - `getAllActiveUsers()` → добавить в SELECT поля `reminder_morning`, `reminder_evening`, `reminders_enabled`, `timezone`

**Файлы:**
- `src/services/reminder.js` (изменить)

**Проверка:**
- Функция возвращает корректный список пользователей для текущего момента времени
- Пользователь с `reminders_enabled = false` не попадает в список
- Пользователь с TZ Europe/Moscow и reminder_morning '08:00' получает morning-напоминание в 05:00 UTC

---

## Этап 15 — api/remind.js: per-user filtering (≈ 2.5 ч)

**Цель:** Переключить endpoint на per-user логику.

**Задачи:**
- `api/remind.js`:
  - Изменить обработку запроса: принимать `type=check` (или без type) — триггерное действие для 30-мин cron
  - Вместо `type`-based логики: вызвать `getUsersToRemindNow(new Date())`
  - Для каждой пары `{ user, type }` вызвать соответствующий `get*Message(userId)` и отправить
  - Обратная совместимость: если `type` передан явно (morning/midday/evening/weekly/reactivation) — работать по-старому (на случай ручного запуска)

**Файлы:**
- `api/remind.js` (изменить)

**Проверка:**
- Ручной вызов `/api/remind?type=morning&secret=...` — работает как раньше (fallback)
- Вызов `/api/remind?type=check&secret=...` — отправляет напоминания только нужным пользователям по их настройкам

---

## Этап 16 — GitHub Actions: 30-мин cron (≈ 1 ч)

**Цель:** Переключить scheduler на запуск каждые 30 минут.

**Задачи:**
- `.github/workflows/scheduler.yml`:
  - Заменить 5 отдельных cron-заданий на одно: `'*/30 * * * *'`
  - Убрать логику `Determine reminder type` (shell script с ifelse по времени)
  - Передавать `type=check` в curl-вызове
  - Оставить `workflow_dispatch` с input `type` для ручного запуска (утренние тесты и т.д.)

**Файлы:**
- `.github/workflows/scheduler.yml` (изменить)

**Проверка:**
- Workflow корректно запускается (test с workflow_dispatch)
- `type=check` вызов обрабатывается корректно

---

## Этап 17 — Финальная интеграция и регрессионное тестирование (≈ 3 ч)

**Цель:** Проверить все существующие функции, убедиться что ничего не сломано.

**Чеклист из ТЗ:**
- [ ] Создание обычного спринта (7/14/21 день) — работает
- [ ] Создание 30-дневной цели с метриками — работает
- [ ] Направления внутри спринта — работают
- [ ] Добавление задач (текст + пересылка) — работает
- [ ] Квалификация задач (направление / вне стратегии) — работает
- [ ] Задача дня ⭐ — работает
- [ ] Плановое время при добавлении одной задачи — работает
- [ ] Планирование дня, /today, /done — работают
- [ ] Закрытие дня с переносом задач — работает
- [ ] Фактическое время при закрытии задачи — работает
- [ ] Причина пропуска при пропуске задачи — работает
- [ ] Стрики и поздравления — работают
- [ ] Коучинг-вопрос после закрытия дня — работает
- [ ] Все 5 типов напоминаний — работают
- [ ] Per-user timezone напоминания — работают
- [ ] Финансовые цели и прогресс — работают
- [ ] Метрики 30-дневной цели — работают
- [ ] Аналитика /progress — работает
- [ ] Импорт .txt — работает
- [ ] Квартальный обзор (4 блока) — работает
- [ ] Настройки напоминаний — работают

---

## Этап 18 — Деплой и проверка в проде (≈ 1 ч)

**Задачи:**
- `npm run deploy` (git push + set webhook)
- Проверить Vercel dashboard — деплой без ошибок
- Проверить GitHub Actions — новый scheduler запускается
- Провести smoke test в Telegram: /start, /plan, /close, /metrics, /review, /settings

---

## Сводная таблица

| Этап | Название | Оценка | Зависит от |
|------|----------|--------|-----------|
| 1 | DB Migrations | 1.5 ч | — |
| 2 | DB Queries: goalMetrics + quarterlyReviews | 3 ч | 1 |
| 3 | DB Queries: sprints type + users settings | 1.5 ч | 1 |
| 4 | Services: sprint formatters | 2 ч | 3 |
| 5 | Onboarding: тип спринта + 30 дней | 4 ч | 4 |
| 6 | Metrics handler | 4 ч | 2, 5 |
| 7 | Плановое время при добавлении задачи | 3 ч | 1 |
| 8 | Фактическое время в dayClose | 4 ч | 1 |
| 9 | Причины пропуска в dayClose | 3 ч | 1, 8 |
| 10 | Недельный разбор несделанного | 4 ч | 9 |
| 11 | Квартальный обзор: DB + Scene | 4 ч | 2 |
| 12 | Квартальный обзор: handler + регистрация | 2 ч | 11 |
| 13 | Settings handler | 3 ч | 3 |
| 14 | Reminder: getUsersToRemindNow | 4 ч | 13 |
| 15 | api/remind.js: per-user filtering | 2.5 ч | 14 |
| 16 | GitHub Actions: 30-мин cron | 1 ч | 15 |
| 17 | Финальный регрессионный тест | 3 ч | все |
| 18 | Деплой и проверка в проде | 1 ч | 17 |
| **Итого** | | **~50 ч** | |

### Параллельные треки (можно вести одновременно)

```
Трек A: 1 → 3 → 4 → 5 → 6          (спринты + метрики)
Трек B: 1 → 7 → 8 → 9 → 10         (учёт времени + причины + недельный разбор)
Трек C: 1 → 2 → 11 → 12            (квартальный обзор)
Трек D: 1 → 3 → 13 → 14 → 15 → 16  (настройки + cron)
```

Треки A, B, C, D независимы после завершения Этапа 1 и Этапа 3.
