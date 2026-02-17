const { Markup } = require('telegraf');

const mainMenuKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('📋 Мой план на сегодня', 'action_today_plan')],
  [Markup.button.callback('🎯 Текущий спринт', 'action_current_sprint')],
  [Markup.button.callback('🚀 Новый спринт', 'action_new_sprint')],
  [Markup.button.callback('📊 Аналитика', 'action_analytics')],
  [Markup.button.callback('⚙️ Настройки', 'action_settings')],
]);

module.exports = { mainMenuKeyboard };
