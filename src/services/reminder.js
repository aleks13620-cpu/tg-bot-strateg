const { supabase } = require('../../config/database');
const { Markup } = require('telegraf');
const { getTodayPlan, formatDateRu } = require('./planning');
const { getPlanItemsByDateRange } = require('../database/queries/planItems');

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

  // Группировка по датам
  const dateMap = {};
  items.forEach((item) => {
    if (!dateMap[item.date]) dateMap[item.date] = [];
    dateMap[item.date].push(item);
  });

  // Берём до 3 ближайших дат с задачами
  return Object.entries(dateMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, 3)
    .map(([date, dayItems]) => ({
      dateLabel: formatDateRu(date),
      count: dayItems.length,
      // Первые 2 текста задач для ближайшего дня
      texts: dayItems.slice(0, 2).map((i) => i.text_raw),
    }));
}

async function getMorningMessage(userId) {
  const status = await getUserDayStatus(userId);
  const upcoming = await getUpcomingTasks(userId);

  let text;
  if (!status.hasPlan) {
    text = '☀️ *Доброе утро!*\n\nПора спланировать день. Какие задачи на сегодня?';
  } else {
    text = `☀️ *Доброе утро!*\n\nНа сегодня: ${status.total} задач`;
    if (status.done > 0) text += ` (выполнено ${status.done})`;
    text += '. Удачного дня! 💪';
  }

  if (upcoming.length > 0) {
    text += '\n\n📅 *Ближайшие дни:*';
    upcoming.forEach((day, idx) => {
      if (idx === 0 && day.texts.length > 0) {
        // Для ближайшего дня показываем первые задачи
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

async function getWeeklyMessage(userId) {
  const { getWeekStats, formatWeekStats } = require('./analytics');

  const today = new Date();
  const dayOfWeek = today.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() + mondayOffset);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const weekStartStr = weekStart.toISOString().split('T')[0];
  const weekEndStr = weekEnd.toISOString().split('T')[0];

  // Прошлая неделя для сравнения
  const prevStart = new Date(weekStart);
  prevStart.setDate(weekStart.getDate() - 7);
  const prevEnd = new Date(weekEnd);
  prevEnd.setDate(weekEnd.getDate() - 7);

  const [stats, prevStats] = await Promise.all([
    getWeekStats(userId, weekStartStr, weekEndStr),
    getWeekStats(userId, prevStart.toISOString().split('T')[0], prevEnd.toISOString().split('T')[0]),
  ]);

  if (!stats || stats.totalTasks === 0) return null;

  const text = formatWeekStats(stats, weekStartStr, weekEndStr, prevStats);

  return {
    text,
    keyboard: Markup.inlineKeyboard([
      [Markup.button.callback('📊 Подробная аналитика', 'action_week_stats_0')],
    ]),
  };
}

function getReminderType() {
  const nowMoscow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Moscow' }));
  const hour = nowMoscow.getHours();
  if (hour < 12) return 'morning';
  return 'evening';
}

module.exports = { getAllActiveUsers, getMorningMessage, getEveningMessage, getWeeklyMessage, getReminderType };
