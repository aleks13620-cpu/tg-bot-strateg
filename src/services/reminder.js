const { supabase } = require('../../config/database');
const { Markup } = require('telegraf');
const { getTodayPlan } = require('./planning');

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

async function getMorningMessage(userId) {
  const status = await getUserDayStatus(userId);

  if (!status.hasPlan) {
    return {
      text: '☀️ *Доброе утро!*\n\nПора спланировать день. Какие задачи на сегодня?',
      keyboard: Markup.inlineKeyboard([
        [Markup.button.callback('📋 Спланировать день', 'action_today_plan')],
      ]),
    };
  }

  return {
    text: `☀️ *Доброе утро!*\n\nУ вас ${status.total} задач на сегодня. Удачного дня! 💪`,
    keyboard: Markup.inlineKeyboard([
      [Markup.button.callback('📋 Мой план', 'action_today_plan')],
    ]),
  };
}

async function getEveningMessage(userId) {
  const status = await getUserDayStatus(userId);

  if (!status.hasPlan) {
    return null;
  }

  if (status.allClosed) {
    return null;
  }

  return {
    text: `🌙 *Добрый вечер!*\n\nУ вас ${status.pending} незавершённых задач. Пора подвести итоги!`,
    keyboard: Markup.inlineKeyboard([
      [Markup.button.callback('📊 Закрыть день', 'action_close_day')],
    ]),
  };
}

function getReminderType() {
  const nowMoscow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Moscow' }));
  const hour = nowMoscow.getHours();
  if (hour < 12) return 'morning';
  return 'evening';
}

module.exports = { getAllActiveUsers, getMorningMessage, getEveningMessage, getReminderType };
