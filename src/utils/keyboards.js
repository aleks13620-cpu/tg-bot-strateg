const { Markup } = require('telegraf');

// Тексты кнопок persistent keyboard (для фильтрации в text-обработчиках)
const KEYBOARD_BUTTONS = ['📋 Добавить задачи', '🌙 Закрыть день', '🎯 Спринты', '🏠 Меню'];

// Постоянные кнопки внизу чата (reply keyboard)
const persistentKeyboard = Markup.keyboard([
  [KEYBOARD_BUTTONS[0], KEYBOARD_BUTTONS[1]],
  [KEYBOARD_BUTTONS[2], KEYBOARD_BUTTONS[3]],
]).resize();

const mainMenuKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('✅ Сегодня (отметить)', 'action_today_checklist')],
  [Markup.button.callback('📋 План и задачи', 'action_plan_view')],
  [Markup.button.callback('🎯 Текущий спринт', 'action_current_sprint')],
  [Markup.button.callback('🚀 Новый спринт', 'action_new_sprint')],
  [Markup.button.callback('📊 Аналитика', 'action_analytics')],
  [Markup.button.callback('📊 Метрики', 'action_metrics')],
  [Markup.button.callback('🧾 Review', 'action_review')],
  [Markup.button.callback('🗓 Недельный разбор', 'action_weekly_review')],
  [Markup.button.callback('💡 Помощь', 'action_help_overview')],
  [Markup.button.callback('⚙️ Настройки', 'action_settings')],
]);

// Экранирование спецсимволов Markdown v1 для Telegram
function escapeMarkdown(text) {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

// Строит упрощённую inline-клавиатуру выбора даты: Сегодня / Завтра / Другая дата
function buildDatePickerKeyboard() {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const todayIso = today.toISOString().split('T')[0];
  const tomorrowIso = tomorrow.toISOString().split('T')[0];

  const dd = (d) => `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;

  return Markup.inlineKeyboard([
    [
      Markup.button.callback(`📅 Сегодня (${dd(today)})`, `pick_date_${todayIso}`),
      Markup.button.callback(`📅 Завтра (${dd(tomorrow)})`, `pick_date_${tomorrowIso}`),
    ],
    [Markup.button.callback('✏️ Другая дата', 'pick_date_manual')],
  ]);
}

// Строит inline-клавиатуру выбора даты для переноса устаревшей задачи
// Callback: stale_move_<itemId>_<YYYY-MM-DD>
function buildStaleDatePickerKeyboard(itemId) {
  const today = new Date();
  const buttons = [];
  let row = [];

  for (let i = 1; i <= 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const iso = d.toISOString().split('T')[0];
    const dd = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
    row.push(Markup.button.callback(dd, `stale_move_${itemId}_${iso}`));
    if (row.length === 3) {
      buttons.push([...row]);
      row = [];
    }
  }
  if (row.length > 0) buttons.push([...row]);

  return Markup.inlineKeyboard(buttons);
}

module.exports = { mainMenuKeyboard, persistentKeyboard, escapeMarkdown, KEYBOARD_BUTTONS, buildDatePickerKeyboard, buildStaleDatePickerKeyboard };
