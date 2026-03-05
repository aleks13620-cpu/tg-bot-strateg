const { supabase } = require('../../config/database');
const { Markup } = require('telegraf');
const { getTodayPlan, formatDateRu, getTodayDate } = require('./planning');
const { getPlanItemsByDateRange, getPlanItemsByDate, getStaleItems } = require('../database/queries/planItems');
const { getActiveSprint } = require('../database/queries/sprints');
const { getStreakInfo } = require('./streak');
const { getWeekStats, formatWeekStats, formatSprintProgressBar, getDayStats } = require('./analytics');

async function getAllActiveUsers() {
  const { data, error } = await supabase
    .from('users')
    .select('*');

  if (error) {
    console.error('[REMINDER] Error getting users:', error.message);
    return [];
  }
  return data || [];
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

  let text = '☀️ *Доброе утро!*\n\n';

  // Уведомление о сбросе стрика
  if (streakBroken) {
    text += `💔 Стрик прерван — было *${streak.current} дн.* Начни новый сегодня!\n\n`;
  } else if (streak.current >= 2) {
    text += `🔥 Стрик: *${streak.current} дн.* подряд! Не останавливайся!\n\n`;
  }

  // Контекст спринта
  if (sprint) {
    text += `🎯 *${sprint.goal_text}*\n`;
    text += formatSprintProgressBar(sprint) + '\n\n';
  }

  if (!status.hasPlan) {
    text += '📋 На сегодня задач нет. Самое время спланировать день! 💪';
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
      [Markup.button.callback('📋 Мой план', 'action_today_plan')],
    ]),
  };
}

async function getEveningMessage(userId) {
  const status = await getUserDayStatus(userId);

  if (!status.hasPlan) return null;
  if (status.allClosed) return null;

  const upcoming = await getUpcomingTasks(userId);

  let text = `🌙 *Добрый вечер!*\n\nОсталось незавершённых задач: ${status.pending}. Пора подвести итоги!`;

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
    `☀️ *Полдень!*\n\n` +
    `Ещё есть время выполнить задачи — их осталось ${stats.pending}.\n` +
    `Удачи! 💪`;

  return {
    text,
    keyboard: Markup.inlineKeyboard([
      [Markup.button.callback('📋 Мой план', 'action_today_plan')],
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

  let text = '👋 *Давно не виделись!*\n\n';
  if (sprint) {
    text += `Твой спринт ждёт:\n🎯 _${sprint.goal_text}_\n\n`;
    text += 'Самое время вернуться к работе над целью!';
  } else {
    text += 'Возвращайся — здесь ждут твои цели.';
  }

  return {
    text,
    keyboard: Markup.inlineKeyboard([
      [Markup.button.callback('📋 Открыть план', 'action_today_plan')],
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
  const text = formatWeekStats(stats, weekStartStr, weekEndStr, prevStats, financialGoal);

  const buttons = [
    [Markup.button.callback('📊 Подробная аналитика', 'action_week_stats_0')],
  ];

  // Если есть финансовая цель — добавляем кнопку внесения прогресса
  if (financialGoal) {
    buttons.push([Markup.button.callback('💰 Внести прогресс по финцели', `action_finance_input_${weekStartStr}`)]);
  }

  return {
    text,
    keyboard: Markup.inlineKeyboard(buttons),
    sprintId: activeSprint?.id || null,
    financialGoal,
  };
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
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 2);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  const { data: items } = await getStaleItems(userId, cutoffStr);
  if (!items || items.length === 0) return null;

  const shown = items.slice(0, 5);
  let text = `⚠️ *Устаревшие задачи (${items.length}):*\n\n`;
  shown.forEach((item, i) => {
    const dateLabel = formatDateRu(item.date);
    const preview = item.text_raw.length > 40 ? item.text_raw.slice(0, 40) + '…' : item.text_raw;
    text += `${i + 1}. ${preview} _(${dateLabel})_\n`;
  });
  text += '\n_Выбери действие для каждой задачи:_';

  const buttons = shown.map((item) => [
    Markup.button.callback('✅', `stale_done_${item.id}`),
    Markup.button.callback('⏭', `stale_skip_${item.id}`),
    Markup.button.callback('📅 Сегодня', `stale_today_${item.id}`),
  ]);

  return { text, keyboard: Markup.inlineKeyboard(buttons) };
}

module.exports = {
  getAllActiveUsers,
  getMorningMessage,
  getEveningMessage,
  getMidDayMessage,
  getReactivationMessage,
  getWeeklyMessage,
  getStaleMessage,
  getReminderType,
};
