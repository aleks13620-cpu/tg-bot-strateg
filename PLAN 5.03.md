# Bot Development Plan

## Stages

---

### Stage 1: Улучшение /today и /done
**Status:** [x] Done
**Files:** `src/bot/handlers/today.js`, `src/services/analytics.js`

- `/today` показывает SFI дня, прогресс-бар спринта, стрик (если >= 2)
- `/done` после отметки показывает обновлённый список с кнопками (как в /today)
- Данные берём из `getDayStats()` и `formatSprintProgressBar()`

---

### Stage 2: Упрощённый датапикер
**Status:** [x] Done
**Files:** `src/utils/keyboards.js`

- Вместо ввода даты вручную — 3 кнопки: Сегодня / Завтра / Другая дата
- "Другая дата" запрашивает ввод текстом (ДД.ММ)
- Упрощает добавление задач

---

### Stage 3: Задача дня (is_key_task)
**Status:** [ ] Not started
**Files:** `src/bot/handlers/plan.js`, `src/bot/handlers/today.js`

- После квалификации (strategic/fire) бот спрашивает: "Это задача дня?" (Да / Нет)
- `is_key_task = true` → отображается первой в /today со звёздочкой ⭐
- Максимум одна задача дня

---

### Stage 4: Квалификация через editMessage
**Status:** [ ] Not started
**Files:** `src/bot/handlers/plan.js`

- Вместо новых сообщений при каждом шаге квалификации — редактируем одно сообщение
- Шаги: выбор спринта → выбор инициативы → тип (strategic/fire) → сохранено
- Меньше мусора в чате

---

### Stage 5: Контекст в шапке сообщений
**Status:** [ ] Not started
**Files:** `src/bot/handlers/plan.js`, `src/bot/scenes/onboarding.js`

- Во время multi-step флоу (квалификация, добавление задач) показывать "хлебные крошки"
- Например: `🎯 Спринт: <название> → 📌 Инициатива: <название>`
- Помогает пользователю не теряться в контексте

---

### Stage 6: Устаревшие задачи (Stale Tasks)
**Status:** [ ] Not started
**Files:** `src/services/reminder.js`, `api/remind.js`, `src/bot/handlers/today.js`

- Задача считается устаревшей если pending >= 3 дней
- В утреннем напоминании или отдельным сообщением — список stale задач
- Кнопки: ✅ Выполнено / ⏭ Пропустить / 📅 Перенести на сегодня

---

### Stage 7: Улучшенное утреннее напоминание + сброс стрика
**Status:** [ ] Not started
**Files:** `src/services/reminder.js`, `src/services/streak.js`

- Если стрик был вчера > 0 но сегодня день закрыт не был — уведомить о сбросе
- Утреннее: более мотивирующий текст, задача дня (is_key_task), персонализация

---

### Stage 8: SFI мини-челлендж
**Status:** [ ] Not started
**Files:** `src/bot/handlers/sprints.js`, `src/database/queries/sprints.js`, `src/services/analytics.js`

- Поле `sfi_challenge` в таблице sprints (% цель SFI на спринт)
- Пользователь ставит цель (например 70%)
- В еженедельном отчёте и при закрытии дня — сравниваем факт с целью

---

### Stage 9: Упрощённый онбординг
**Status:** [ ] Not started
**Files:** `src/bot/scenes/onboarding.js`

- Сократить с 6 шагов до 3: цель → направления (вместо инициатив) → длительность
- Переименовать "инициатива" → "направление" во всём боте
- Убрать лишние шаги, сделать онбординг быстрее

---

### Stage 10: Контекстные подсказки
**Status:** [ ] Not started
**Files:** `src/bot/index.js`, `src/database/queries/users.js`

- JSONB поле `meta` в таблице users для хранения флагов
- 4 триггера подсказок: первый /plan, первая квалификация, первое закрытие дня, неделя без спринта
- Каждая подсказка показывается только один раз

---

## Progress

| Stage | Description | Status |
|-------|-------------|--------|
| 1 | /today + /done улучшения | [x] |
| 2 | Датапикер 3 кнопки | [x] |
| 3 | Задача дня (is_key_task) | [ ] |
| 4 | Квалификация через editMessage | [ ] |
| 5 | Контекст в шапке | [ ] |
| 6 | Устаревшие задачи | [ ] |
| 7 | Утреннее + сброс стрика | [ ] |
| 8 | SFI челлендж | [ ] |
| 9 | Упрощённый онбординг | [ ] |
| 10 | Контекстные подсказки | [ ] |
