const { Markup } = require('telegraf');

// Тексты кнопок persistent keyboard (для фильтрации в text-обработчиках)
const KEYBOARD_BUTTONS = ['📋 Добавить задачи', '🌙 Закрыть день', '🎯 Спринты', '🏠 Меню'];

// Постоянные кнопки внизу чата (reply keyboard)
const persistentKeyboard = Markup.keyboard([
  [KEYBOARD_BUTTONS[0], KEYBOARD_BUTTONS[1]],
  [KEYBOARD_BUTTONS[2], KEYBOARD_BUTTONS[3]],
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

const DAY_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

// Строит inline-клавиатуру выбора даты на daysAhead дней вперёд (по 4 кнопки в строке)
function buildDatePickerKeyboard(daysAhead = 14) {
  const today = new Date();
  const allButtons = [];

  for (let i = 0; i < daysAhead; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const iso = d.toISOString().split('T')[0];
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    let label;
    if (i === 0) label = `Сег ${dd}.${mm}`;
    else if (i === 1) label = `Завт ${dd}.${mm}`;
    else label = `${DAY_SHORT[d.getDay()]} ${dd}.${mm}`;
    allButtons.push(Markup.button.callback(label, `pick_date_${iso}`));
  }

  // Разбить по 4 кнопки в строке
  const rows = [];
  for (let i = 0; i < allButtons.length; i += 4) {
    rows.push(allButtons.slice(i, i + 4));
  }
  rows.push([Markup.button.callback('✏️ Ввести дату вручную', 'pick_date_manual')]);

  return Markup.inlineKeyboard(rows);
}

module.exports = { mainMenuKeyboard, persistentKeyboard, escapeMarkdown, KEYBOARD_BUTTONS, buildDatePickerKeyboard };
