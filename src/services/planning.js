const { createPlanItems, getPlanItemsByDate } = require('../database/queries/planItems');

function getTodayDate() {
  return new Date().toISOString().split('T')[0];
}

async function addDayPlan(userId, rawText) {
  const lines = rawText
    .split('\n')
    .map((line) => line.replace(/^[\d\.\-\*\)\s]+/, '').trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return { data: [], error: { message: 'Нет задач для добавления' } };
  }

  const date = getTodayDate();
  return await createPlanItems(userId, date, lines);
}

async function getTodayPlan(userId) {
  const date = getTodayDate();
  return await getPlanItemsByDate(userId, date);
}

function formatPlanItems(items) {
  if (items.length === 0) {
    return '📋 На сегодня задач нет.\n\nИспользуйте "📋 Мой план на сегодня" чтобы добавить задачи.';
  }

  // Без Markdown в тексте задач — спецсимволы не ломают форматирование
  let text = '📋 План на сегодня:\n\n';
  items.forEach((item, i) => {
    const statusIcon = item.status === 'done' ? '✅'
      : item.status === 'skipped' ? '⏭'
      : item.is_strategic ? '📊'
      : '⬜';
    const strategicTag = item.is_strategic ? ' 📊' : '';
    text += `${i + 1}. ${statusIcon} ${item.text_raw}${strategicTag}\n`;
  });

  const total = items.length;
  const strategic = items.filter((i) => i.is_strategic).length;
  const nonStrategic = total - strategic;

  text += `\n📊 По стратегии: ${strategic} | 🔥 Вне стратегии: ${nonStrategic}`;
  return text;
}

module.exports = { addDayPlan, getTodayPlan, formatPlanItems, getTodayDate };
