const { Markup } = require('telegraf');

// Постоянные кнопки внизу чата (reply keyboard)
const persistentKeyboard = Markup.keyboard([
  ['📋 Добавить задачи', '🌙 Закрыть день'],
  ['🎯 Спринты', '🏠 Меню'],
]).resize();

const mainMenuKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('📋 Мой план на сегодня', 'action_today_plan')],
  [Markup.button.callback('🎯 Текущий спринт', 'action_current_sprint')],
  [Markup.button.callback('🚀 Новый спринт', 'action_new_sprint')],
  [Markup.button.callback('📊 Аналитика', 'action_analytics')],
  [Markup.button.callback('⚙️ Настройки', 'action_settings')],
]);

// Экранирование спецсимволов Markdown v1 для Telegram
function escapeMarkdown(text) {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

module.exports = { mainMenuKeyboard, persistentKeyboard, escapeMarkdown };
