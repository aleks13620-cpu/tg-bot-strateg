const { createPlanItems, getPlanItemsByDate } = require('../database/queries/planItems');

function getTodayDate() {
  return new Date().toISOString().split('T')[0];
}

function getTomorrowDate() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

function formatDateRu(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return `${d}.${m}.${y}`;
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

// Старый формат (deprecated, оставлен для совместимости)
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

// Новый формат: массив сообщений, сгруппированных по спринтам
function formatPlanMessages(items, date) {
  if (items.length === 0) {
    return [];
  }

  const dateStr = formatDateRu(date);
  const messages = [];

  // Группировка: sprint_id → { goal, initiatives: { init_id → { title, items } } }
  const sprintGroups = {};
  const fireItems = [];

  items.forEach((item) => {
    if (item.initiative && item.initiative.sprint) {
      const sprint = item.initiative.sprint;
      const sprintId = sprint.id;
      if (!sprintGroups[sprintId]) {
        sprintGroups[sprintId] = {
          goal: sprint.goal_text,
          initiatives: {},
        };
      }
      const initId = item.initiative.id;
      if (!sprintGroups[sprintId].initiatives[initId]) {
        sprintGroups[sprintId].initiatives[initId] = {
          title: item.initiative.title,
          items: [],
        };
      }
      sprintGroups[sprintId].initiatives[initId].items.push(item);
    } else {
      fireItems.push(item);
    }
  });

  // Глобальный счётчик задач
  let taskNum = 1;

  // Сообщение для каждого спринта
  for (const sprintId of Object.keys(sprintGroups)) {
    const group = sprintGroups[sprintId];
    let msg = `📋 План на ${dateStr}\n\n`;
    msg += `🎯 Спринт: ${group.goal}\n`;

    for (const initId of Object.keys(group.initiatives)) {
      const init = group.initiatives[initId];
      msg += `\n  📌 ${init.title}:\n`;
      for (const item of init.items) {
        const icon = getStatusIcon(item);
        msg += `    ${taskNum}. ${icon} ${item.text_raw}\n`;
        taskNum++;
      }
    }

    messages.push(msg.trimEnd());
  }

  // Сообщение для задач вне стратегии
  if (fireItems.length > 0) {
    let msg = messages.length === 0 ? `📋 План на ${dateStr}\n\n` : '';
    msg += `🔥 Вне стратегии:\n`;
    for (const item of fireItems) {
      const icon = getStatusIcon(item);
      msg += `  ${taskNum}. ${icon} ${item.text_raw}\n`;
      taskNum++;
    }
    messages.push(msg.trimEnd());
  }

  // Если первое сообщение не содержит заголовок (когда только fire items)
  // заголовок уже добавлен выше

  return messages;
}

function getStatusIcon(item) {
  if (item.status === 'done') return '✅';
  if (item.status === 'skipped') return '⏭';
  if (item.initiative) return '🎯';
  if (item.is_strategic) return '📊';
  return '⬜';
}

module.exports = { addDayPlan, getTodayPlan, formatPlanItems, formatPlanMessages, getTodayDate, getTomorrowDate, formatDateRu };
