const { supabase } = require('../../config/database');
const { Markup } = require('telegraf');

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

function getMorningMessage() {
  return {
    text: '☀️ *Доброе утро!*\n\nПора спланировать день. Какие задачи на сегодня?',
    keyboard: Markup.inlineKeyboard([
      [Markup.button.callback('📋 Спланировать день', 'action_today_plan')],
    ]),
  };
}

function getEveningMessage() {
  return {
    text: '🌙 *Добрый вечер!*\n\nВремя подвести итоги дня.',
    keyboard: Markup.inlineKeyboard([
      [Markup.button.callback('📊 Закрыть день', 'action_close_day')],
    ]),
  };
}

function getReminderType() {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  return 'evening';
}

module.exports = { getAllActiveUsers, getMorningMessage, getEveningMessage, getReminderType };
