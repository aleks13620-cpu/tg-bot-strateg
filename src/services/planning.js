const { createPlanItems, getPlanItemsByDate } = require('../database/queries/planItems');

// Разбирает текстовый ввод в массив строк-задач
function parseTaskLines(rawText) {
  if (rawText.includes('\n')) {
    return rawText
      .split('\n')
      .map((line) => line.replace(/^[\d\.\-\*\)\s]+/, '').trim())
      .filter((line) => line.length > 0);
  }
  if (rawText.includes(',')) {
    return rawText
      .split(',')
      .map((part) => part.replace(/^[\d\.\-\*\)\s]+/, '').trim())
      .filter((part) => part.length > 0);
  }
  const cleaned = rawText.replace(/^[\d\.\-\*\)\s]+/, '').trim();
  return cleaned.length > 0 ? [cleaned] : [];
}

// Парсит дату из строки ДД.ММ или ДД.ММ.ГГГГ, возвращает ISO строку или null
function parseDateInput(input) {
  const parts = input.trim().split('.');
  if (parts.length < 2) return null;

  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const year = parts.length >= 3 ? parseInt(parts[2], 10) : new Date().getFullYear();

  if (isNaN(day) || isNaN(month) || day < 1 || day > 31 || month < 1 || month > 12) return null;

  const date = new Date(year, month - 1, day);
  if (date.getDate() !== day || date.getMonth() !== month - 1) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (date < today) return null;

  const maxDate = new Date(today);
  maxDate.setDate(today.getDate() + 365);
  if (date > maxDate) return null;

  return date.toISOString().split('T')[0];
}

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
  return addDayPlanForDate(userId, rawText, getTodayDate());
}

async function addDayPlanForDate(userId, rawText, date) {
  const lines = parseTaskLines(rawText);
  if (lines.length === 0) {
    return { data: [], error: { message: 'Нет задач для добавления' } };
  }
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
function formatPlanMessages(items, date, sprints) {
  const dateStr = formatDateRu(date);
  const messages = [];

  // Группировка: sprint_id → { goal, initiatives: { init_id → { title, items } } }
  // Предзаполняем из sprints, чтобы пустые спринты тоже отображались
  const sprintGroups = {};
  if (sprints && sprints.length > 0) {
    for (const s of sprints) {
      sprintGroups[s.id] = { goal: s.goal_text, initiatives: {} };
    }
  }

  if (items.length === 0 && Object.keys(sprintGroups).length === 0) {
    return [];
  }

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

    const initKeys = Object.keys(group.initiatives);
    if (initKeys.length === 0) {
      msg += `\n  _(нет задач)_`;
    } else {
      for (const initId of initKeys) {
        const init = group.initiatives[initId];
        msg += `\n  📌 ${init.title}:\n`;
        for (const item of init.items) {
          const icon = getStatusIcon(item);
          msg += `    ${taskNum}. ${icon} ${item.text_raw}\n`;
          taskNum++;
        }
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

async function getPlanForDate(userId, date) {
  return await getPlanItemsByDate(userId, date);
}

module.exports = {
  addDayPlan,
  addDayPlanForDate,
  parseDateInput,
  getTodayPlan,
  getPlanForDate,
  formatPlanItems,
  formatPlanMessages,
  getTodayDate,
  getTomorrowDate,
  formatDateRu,
};
