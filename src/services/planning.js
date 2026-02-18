const { createPlanItems, getPlanItemsByDate } = require('../database/queries/planItems');

function getTodayDate() {
  return new Date().toISOString().split('T')[0];
}

async function addDayPlan(userId, rawText) {
  const hasNewlines = rawText.includes('\n');
  let lines;

  if (hasNewlines) {
    // Разделение по строкам (как раньше)
    lines = rawText
      .split('\n')
      .map((line) => line.replace(/^[\d\.\-\*\)\s]+/, '').trim())
      .filter((line) => line.length > 0);
  } else if (rawText.includes(',')) {
    // Одна строка с запятыми — разделяем по запятым
    lines = rawText
      .split(',')
      .map((part) => part.replace(/^[\d\.\-\*\)\s]+/, '').trim())
      .filter((part) => part.length > 0);
  } else {
    // Одна задача
    const cleaned = rawText.replace(/^[\d\.\-\*\)\s]+/, '').trim();
    lines = cleaned.length > 0 ? [cleaned] : [];
  }

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
    return '📋 На сегодня задач нет.\n\nНажмите "📋 Добавить задачи" чтобы добавить.';
  }

  let text = '📋 План на сегодня:\n\n';
  items.forEach((item, i) => {
    const statusIcon = item.status === 'done' ? '✅'
      : item.status === 'skipped' ? '⏭'
      : item.initiative ? '🎯'
      : item.is_strategic ? '📊'
      : '⬜';
    const tag = item.initiative ? ` [${item.initiative.title}]` : '';
    text += `${i + 1}. ${statusIcon} ${item.text_raw}${tag}\n`;
  });

  // Группировка по инициативам
  const initiativeMap = {};
  let fireCount = 0;
  items.forEach((item) => {
    if (item.initiative) {
      const title = item.initiative.title;
      initiativeMap[title] = (initiativeMap[title] || 0) + 1;
    } else {
      fireCount++;
    }
  });

  text += '\n';
  for (const [title, count] of Object.entries(initiativeMap)) {
    text += `🎯 ${title}: ${count}\n`;
  }
  if (fireCount > 0) {
    text += `🔥 Вне стратегии: ${fireCount}`;
  }
  return text;
}

module.exports = { addDayPlan, getTodayPlan, formatPlanItems, getTodayDate };
