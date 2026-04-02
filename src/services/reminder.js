const { supabase } = require('../../config/database');
const { Markup } = require('telegraf');
const { getTodayPlan, formatDateRu, getTodayDate } = require('./planning');
const { getPlanItemsByDateRange, getPlanItemsByDate, getStaleItems, getPlanItemsByStatus } = require('../database/queries/planItems');
const { getActiveSprint } = require('../database/queries/sprints');
const { getStreakInfo } = require('./streak');
const { getWeekStats, formatWeekStats, formatSprintProgressBar, getDayStats } = require('./analytics');
const { checkHintAndMark } = require('../database/queries/users');

async function getAllActiveUsers() {
  const { data, error } = await supabase
    .from('users')
    .select('id, telegram_id, timezone, reminder_morning, reminder_evening, reminders_enabled, last_active_at, last_close_date, meta');

  if (error) {
    console.error('[REMINDER] Error getting users:', error.message);
    return [];
  }
  return data || [];
}

// Возвращает список { user, type } для пользователей которым нужно отправить напоминание прямо сейчас
async function getUsersToRemindNow(nowUtc) {
  const users = await getAllActiveUsers();
  const result = [];

  for (const user of users) {
    if (user.reminders_enabled === false) continue;

    const tz = user.timezone || 'Europe/Moscow';
    const morningStr = user.reminder_morning || '08:00';
    const eveningStr = user.reminder_evening || '18:00';

    // Локальное время пользователя
    let localHour, localMinute, localDow;
    try {
      const localStr = nowUtc.toLocaleString('en-US', { timeZone: tz, hour: 'numeric', minute: 'numeric', hour12: false, weekday: 'short' });
      // Парсим "Mon 08:05" или "8:05 Mon"
      const parts = localStr.split(/[,\s]+/).filter(Boolean);
      let timeStr = parts.find((p) => p.includes(':'));
      localDow = parts.find((p) => /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/.test(p));
      if (timeStr) {
        const [h, m] = timeStr.split(':').map(Number);
        localHour = h;
        localMinute = m;
      }
    } catch {
      // Fallback to UTC
      localHour = nowUtc.getUTCHours();
      localMinute = nowUtc.getUTCMinutes();
      localDow = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][nowUtc.getUTCDay()];
    }

    const totalNow = localHour * 60 + localMinute;
    const [mH, mM] = morningStr.split(':').map(Number);
    const [eH, eM] = eveningStr.split(':').map(Number);
    const morningTotal = mH * 60 + mM;
    const eveningTotal = eH * 60 + eM;
    const WINDOW = 30; // ±30 минут — покрывает задержки GitHub Actions; двойная отправка предотвращена idempotency (meta.last_morning_sent / last_evening_sent)

    // Локальная дата пользователя для idempotency-чека
    let localDateStr;
    try {
      localDateStr = nowUtc.toLocaleDateString('en-CA', { timeZone: tz }); // YYYY-MM-DD
    } catch {
      localDateStr = nowUtc.toISOString().split('T')[0];
    }
    const meta = user.meta || {};
    const isSaturday = localDow && localDow.startsWith('Sat');

    // Weekly: суббота — проверяем ДО morning, иначе morning перехватит и continue не даст дойти сюда
    if (isSaturday && Math.abs(totalNow - morningTotal) <= WINDOW + 60) {
      if (meta.last_weekly_sent === localDateStr) {
        console.log(`[REMIND] Skip weekly for ${user.telegram_id}: already sent today`);
        continue;
      }
      result.push({ user, type: 'weekly', localDate: localDateStr });
      continue;
    }

    // Morning (не суббота — там weekly)
    if (!isSaturday && Math.abs(totalNow - morningTotal) <= WINDOW) {
      if (meta.last_morning_sent === localDateStr) {
        console.log(`[REMIND] Skip morning for ${user.telegram_id}: already sent today`);
        continue;
      }
      result.push({ user, type: 'morning', localDate: localDateStr });
      continue;
    }

    // Evening
    if (Math.abs(totalNow - eveningTotal) <= WINDOW) {
      if (meta.last_evening_sent === localDateStr) {
        console.log(`[REMIND] Skip evening for ${user.telegram_id}: already sent today`);
        continue;
      }
      result.push({ user, type: 'evening', localDate: localDateStr });
      continue;
    }

    // Midday: ~4 часа после утра (только будни)
    const midTotal = morningTotal + 240;
    const isWeekday = localDow && !['Sat','Sun'].includes(localDow.slice(0, 3));
    if (isWeekday && Math.abs(totalNow - midTotal) <= WINDOW) {
      result.push({ user, type: 'midday', localDate: localDateStr });
      continue;
    }

    // Reactivation: понедельник UTC + last_active_at > 3 дней (без TZ)
    const utcDow = nowUtc.getUTCDay(); // 1 = Monday
    if (utcDow === 1 && Math.abs(nowUtc.getUTCHours() * 60 + nowUtc.getUTCMinutes() - 360) <= WINDOW) {
      if (user.last_active_at) {
        const daysSince = (nowUtc.getTime() - new Date(user.last_active_at).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince > 3) {
          result.push({ user, type: 'reactivation', localDate: localDateStr });
        }
      }
    }
  }

  return result;
}

async function getUserDayStatus(userId) {
  const { data: items } = await getTodayPlan(userId);
  const total = items.length;
  const done = items.filter((i) => i.status === 'done').length;
  const skipped = items.filter((i) => i.status === 'skipped').length;
  const pending = total - done - skipped;

  return {
    hasPlan: total > 0,
    total,
    pending,
    done,
    skipped,
    allClosed: total > 0 && pending === 0,
  };
}

// Возвращает до 3 ближайших дат с задачами в диапазоне завтра..+7 дней
async function getUpcomingTasks(userId) {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const limit = new Date(today);
  limit.setDate(today.getDate() + 7);

  const startDate = tomorrow.toISOString().split('T')[0];
  const endDate = limit.toISOString().split('T')[0];

  const { data: items } = await getPlanItemsByDateRange(userId, startDate, endDate);
  if (!items || items.length === 0) return [];

  const dateMap = {};
  items.forEach((item) => {
    if (!dateMap[item.date]) dateMap[item.date] = [];
    dateMap[item.date].push(item);
  });

  return Object.entries(dateMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, 3)
    .map(([date, dayItems]) => ({
      dateLabel: formatDateRu(date),
      count: dayItems.length,
      texts: dayItems.slice(0, 2).map((i) => i.text_raw),
    }));
}

async function getMorningMessage(userId) {
  const date = getTodayDate();

  // Вычисляем вчерашнюю дату
  const yesterdayDate = new Date();
  yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
  const yesterday = yesterdayDate.toISOString().split('T')[0];

  const [status, upcoming, { data: sprint }, streak, { data: userData }] = await Promise.all([
    getUserDayStatus(userId),
    getUpcomingTasks(userId),
    getActiveSprint(userId),
    getStreakInfo(userId),
    supabase.from('users').select('last_close_date').eq('id', userId).single(),
  ]);

  const lastCloseDate = userData?.last_close_date || null;

  // Стрик сброшен: был стрик, но вчера день не закрыт
  const streakBroken =
    streak.current > 0 &&
    lastCloseDate &&
    lastCloseDate !== yesterday &&
    lastCloseDate !== date;

  let text = '☀️ *Старт дня*\n\n';

  // Уведомление о сбросе стрика
  if (streakBroken) {
    text += `💔 Стрик сброшен (было *${streak.current} дн.*). Верните ритм сегодня.\n\n`;
  } else if (streak.current >= 2) {
    text += `🔥 Стрик: *${streak.current} дн.*\n\n`;
  }

  // Контекст спринта
  if (sprint) {
    text += `🎯 *${sprint.goal_text}*\n`;
    text += formatSprintProgressBar(sprint) + '\n\n';
  }

  // Подсказка: нет активного спринта (показывается один раз)
  if (!sprint) {
    const showHint = await checkHintAndMark(userId, 'hint_no_sprint');
    if (showHint) {
      text += '\n💡 *Подсказка:* У вас нет активного спринта. Создайте его в меню *"🎯 Спринты"* — ' +
        'это даст фокус и контекст для каждого дня.\n';
    }
  }

  if (!status.hasPlan) {
    text += '📋 На сегодня задач нет. Запланируйте первый шаг.';
  } else {
    text += `На сегодня: *${status.total} задач*`;
    if (status.done > 0) text += ` (выполнено ${status.done})`;

    // Задача дня: сначала is_key_task, потом первая стратегическая
    const { data: todayItems } = await getPlanItemsByDate(userId, date);
    const keyTask =
      todayItems.find((i) => i.is_key_task && i.status === 'pending') ||
      todayItems.find((i) => i.is_strategic && i.status === 'pending');
    if (keyTask) {
      const icon = keyTask.is_key_task ? '⭐' : '🎯';
      const preview = keyTask.text_raw.length > 60 ? keyTask.text_raw.slice(0, 57) + '…' : keyTask.text_raw;
      text += `\n\n${icon} *Задача дня:*\n${preview}`;
    }
  }

  if (upcoming.length > 0) {
    text += '\n\n📅 *Ближайшие дни:*';
    upcoming.forEach((day, idx) => {
      if (idx === 0 && day.texts.length > 0) {
        text += `\n${day.dateLabel} — ${day.count} задач`;
        day.texts.forEach((t) => {
          const preview = t.length > 40 ? t.slice(0, 40) + '…' : t;
          text += `\n  • ${preview}`;
        });
        if (day.count > day.texts.length) text += `\n  • ещё ${day.count - day.texts.length}…`;
      } else {
        text += `\n${day.dateLabel} — ${day.count} задач`;
      }
    });
  }

  return {
    text,
    keyboard: Markup.inlineKeyboard([
      [Markup.button.callback('✅ Открыть сегодня', 'action_today_checklist')],
    ]),
  };
}

async function getEveningMessage(userId) {
  const status = await getUserDayStatus(userId);

  if (!status.hasPlan) return null;

  // Все задачи закрыты — напоминаем закрыть день и зафиксировать стрик
  if (status.allClosed) {
    return {
      text: '🌙 *Вечерний ритуал*\n\nЗадачи закрыты. Зафиксируйте день и стрик.',
      keyboard: Markup.inlineKeyboard([[Markup.button.callback('📊 Закрыть день', 'action_close_day')]]),
    };
  }

  const upcoming = await getUpcomingTasks(userId);

  let text = `🌙 *Вечерний ритуал*\n\nОсталось незавершённых: *${status.pending}*. Закройте день одним шагом.`;

  if (upcoming.length > 0) {
    const next = upcoming[0];
    text += `\n\n📅 *Завтра запланировано:* ${next.count} задач`;
    if (next.texts.length > 0) {
      next.texts.forEach((t) => {
        const preview = t.length > 40 ? t.slice(0, 40) + '…' : t;
        text += `\n  • ${preview}`;
      });
    }
  }

  return {
    text,
    keyboard: Markup.inlineKeyboard([
      [Markup.button.callback('📊 Закрыть день', 'action_close_day')],
    ]),
  };
}

async function getMidDayMessage(userId) {
  const date = getTodayDate();
  const stats = await getDayStats(userId, date);

  // Отправляем только если есть задачи, но ни одна не выполнена и есть pending
  if (!stats || stats.total === 0) return null;
  if (stats.done > 0) return null;
  if (stats.pending === 0) return null;

  const text =
    `☀️ *Проверка фокуса*\n\n` +
    `Пока нет выполненных задач. В работе ещё *${stats.pending}*.\n` +
    `Выберите следующую задачу и закройте её.`;

  return {
    text,
    keyboard: Markup.inlineKeyboard([
      [Markup.button.callback('✅ К задачам на сегодня', 'action_today_checklist')],
    ]),
  };
}

async function getReactivationMessage(userId) {
  const { data: user } = await supabase
    .from('users')
    .select('last_active_at')
    .eq('id', userId)
    .single();

  if (!user) return null;

  // Если last_active_at не заполнен (старый пользователь) — не беспокоим,
  // ждём пока middleware заполнит его при следующем взаимодействии
  if (!user.last_active_at) return null;

  // Проверяем: если активность была меньше 3 дней назад — не беспокоим
  const lastActive = new Date(user.last_active_at);
  const daysSince = (Date.now() - lastActive.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince < 3) return null;

  const { data: sprint } = await getActiveSprint(userId);

  let text = '👋 *С возвращением*\n\n';
  if (sprint) {
    text += `В фокусе спринт:\n🎯 _${sprint.goal_text}_\n\n`;
    text += 'Откройте задачи на сегодня и начните с одного шага.';
  } else {
    text += 'Вернитесь в ритм: начните с одного шага на сегодня.';
  }

  return {
    text,
    keyboard: Markup.inlineKeyboard([
      [Markup.button.callback('✅ Вернуться к сегодня', 'action_today_checklist')],
    ]),
  };
}

async function getWeeklyMessage(userId) {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() + mondayOffset);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const weekStartStr = weekStart.toISOString().split('T')[0];
  const weekEndStr = weekEnd.toISOString().split('T')[0];

  const prevStart = new Date(weekStart);
  prevStart.setDate(weekStart.getDate() - 7);
  const prevEnd = new Date(weekEnd);
  prevEnd.setDate(weekEnd.getDate() - 7);

  const [stats, prevStats, { data: activeSprint }] = await Promise.all([
    getWeekStats(userId, weekStartStr, weekEndStr),
    getWeekStats(userId, prevStart.toISOString().split('T')[0], prevEnd.toISOString().split('T')[0]),
    getActiveSprint(userId),
  ]);

  if (!stats || stats.totalTasks === 0) return null;

  const financialGoal = activeSprint?.financial_goal || null;
  const sfiChallenge = activeSprint?.sfi_challenge || null;
  let text = formatWeekStats(stats, weekStartStr, weekEndStr, prevStats, financialGoal, sfiChallenge);

  // Таблица выполнения по инициативам
  if (stats.byInitiativeStats && Object.keys(stats.byInitiativeStats).length > 0) {
    text += '\n\n📌 *По инициативам:*\n';
    for (const [title, s] of Object.entries(stats.byInitiativeStats)) {
      const pct = s.total > 0 ? Math.round((s.done / s.total) * 100) : 0;
      const warn = pct === 0 ? ' ⚠️' : '';
      text += `${title}: ${s.done}/${s.total} (${pct}%)${warn}\n`;
    }
    text = text.trimEnd();
  }

  const buttons = [
    [Markup.button.callback('🔍 Разобрать несделанное', 'action_weekly_review')],
    [Markup.button.callback('📊 Подробная аналитика', 'action_week_stats_0')],
  ];

  if (financialGoal) {
    buttons.push([Markup.button.callback('💰 Внести прогресс по финцели', `action_finance_input_${weekStartStr}`)]);
  }

  return {
    text,
    keyboard: Markup.inlineKeyboard(buttons),
    sprintId: activeSprint?.id || null,
    financialGoal,
    weekStartStr,
    weekEndStr,
  };
}

// Возвращает топ-3 незавершённых задачи за прошлую неделю (pending/skipped)
async function getUnfinishedWeekItems(userId) {
  const today = new Date();
  const prevMonday = new Date(today);
  const dow = today.getDay() || 7;
  prevMonday.setDate(today.getDate() - dow - 6);
  const prevSunday = new Date(prevMonday);
  prevSunday.setDate(prevMonday.getDate() + 6);

  const start = prevMonday.toISOString().split('T')[0];
  const end = prevSunday.toISOString().split('T')[0];

  const { data: items } = await getPlanItemsByDateRange(userId, start, end);
  if (!items) return [];

  return items
    .filter((i) => i.status === 'pending' || i.status === 'skipped')
    .sort((a, b) => (b.is_key_task ? 1 : 0) - (a.is_key_task ? 1 : 0) || a.date.localeCompare(b.date))
    .slice(0, 3);
}

function getReminderType() {
  const nowMoscow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Moscow' }));
  const hour = nowMoscow.getHours();
  if (hour < 12) return 'morning';
  return 'evening';
}

/**
 * Устаревшие задачи: pending >= 3 дней назад.
 * Возвращает { text, keyboard } или null если нет таких задач.
 */
async function getStaleMessage(userId) {
  const cutoffStr = getTodayDate(); // date < today → вчера и старше

  const { data: items } = await getStaleItems(userId, cutoffStr);
  if (!items || items.length === 0) return null;

  const shown = items.slice(0, 5);
  let text = `⚠️ *Незавершённые задачи (${items.length}):*\n\n`;
  shown.forEach((item, i) => {
    const dateLabel = formatDateRu(item.date);
    const preview = item.text_raw.length > 40 ? item.text_raw.slice(0, 40) + '…' : item.text_raw;
    text += `${i + 1}. ${preview} _(${dateLabel})_\n`;
  });
  text += '\n_Выбери действие для каждой задачи:_';

  const buttons = shown.map((item) => [
    Markup.button.callback('📅 Сегодня', `stale_today_${item.id}`),
    Markup.button.callback('📅 Другая дата', `stale_other_date_${item.id}`),
    Markup.button.callback('🚫 Отказаться', `stale_skip_${item.id}`),
  ]);

  return { text, keyboard: Markup.inlineKeyboard(buttons) };
}

async function markReminderSent(userId, type, date) {
  const keyMap = { morning: 'last_morning_sent', evening: 'last_evening_sent', weekly: 'last_weekly_sent' };
  const key = keyMap[type];
  if (!key) return;
  const { data: row } = await supabase.from('users').select('meta').eq('id', userId).single();
  const meta = row?.meta || {};
  await supabase.from('users').update({ meta: { ...meta, [key]: date } }).eq('id', userId);
}

module.exports = {
  getAllActiveUsers,
  getUsersToRemindNow,
  getMorningMessage,
  getEveningMessage,
  getMidDayMessage,
  getReactivationMessage,
  getWeeklyMessage,
  getStaleMessage,
  getReminderType,
  getUnfinishedWeekItems,
  markReminderSent,
};
