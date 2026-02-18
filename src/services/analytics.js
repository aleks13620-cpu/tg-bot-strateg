const { supabase } = require('../../config/database');

async function getDayStats(userId, date) {
  const { data: items, error } = await supabase
    .from('plan_items')
    .select('*, initiative:initiatives(id, title)')
    .eq('user_id', userId)
    .eq('date', date);

  if (error) {
    console.error('[ANALYTICS] Error getting day stats:', error.message);
    return null;
  }

  const total = items.length;
  const done = items.filter((i) => i.status === 'done');
  const skipped = items.filter((i) => i.status === 'skipped');
  const strategicDone = done.filter((i) => i.is_strategic).length;
  const fireDone = done.filter((i) => !i.is_strategic).length;
  const sfi = done.length > 0 ? Math.round((strategicDone / done.length) * 100) : 0;

  // Группировка выполненных по инициативам
  const byInitiative = {};
  done.forEach((item) => {
    if (item.initiative) {
      const title = item.initiative.title;
      byInitiative[title] = (byInitiative[title] || 0) + 1;
    }
  });

  return {
    total,
    done: done.length,
    skipped: skipped.length,
    pending: total - done.length - skipped.length,
    strategicDone,
    fireDone,
    sfi,
    byInitiative,
  };
}

async function getSprintStats(userId, sprintStartDate, sprintEndDate) {
  const { data: items, error } = await supabase
    .from('plan_items')
    .select('*')
    .eq('user_id', userId)
    .gte('date', sprintStartDate)
    .lte('date', sprintEndDate);

  if (error) {
    console.error('[ANALYTICS] Error getting sprint stats:', error.message);
    return null;
  }

  const done = items.filter((i) => i.status === 'done');
  const strategicDone = done.filter((i) => i.is_strategic).length;
  const fireDone = done.filter((i) => !i.is_strategic).length;
  const sfi = done.length > 0 ? Math.round((strategicDone / done.length) * 100) : 0;

  // Группировка по дням
  const dayMap = {};
  items.forEach((item) => {
    if (!dayMap[item.date]) dayMap[item.date] = [];
    dayMap[item.date].push(item);
  });
  const daysWorked = Object.keys(dayMap).length;

  return {
    totalTasks: items.length,
    done: done.length,
    strategicDone,
    fireDone,
    sfi,
    daysWorked,
  };
}

function formatDayStats(stats) {
  if (!stats || stats.total === 0) {
    return '📊 Сегодня задач не было.';
  }

  let text = '📊 *Итоги дня:*\n\n';
  text += `✅ Выполнено: ${stats.done}/${stats.total}\n`;
  if (stats.skipped > 0) text += `⏭ Пропущено: ${stats.skipped}\n`;
  if (stats.pending > 0) text += `⬜ Осталось: ${stats.pending}\n`;
  // Разбивка по инициативам
  if (stats.byInitiative && Object.keys(stats.byInitiative).length > 0) {
    text += '\n*По инициативам:*\n';
    for (const [title, count] of Object.entries(stats.byInitiative)) {
      text += `  🎯 ${title}: ${count}\n`;
    }
  }
  text += `\n📊 По стратегии: ${stats.strategicDone}\n`;
  text += `🔥 Вне стратегии: ${stats.fireDone}\n`;
  text += `\n🎯 *SFI: ${stats.sfi}%*`;

  if (stats.sfi >= 70) text += ' — Отлично!';
  else if (stats.sfi >= 50) text += ' — Хорошо';
  else if (stats.sfi > 0) text += ' — Нужно больше фокуса';

  return text;
}

function formatSprintStats(stats) {
  if (!stats) {
    return '📊 Нет данных по спринту.';
  }

  let text = '📊 *Статистика спринта:*\n\n';
  text += `📅 Рабочих дней: ${stats.daysWorked}\n`;
  text += `✅ Всего выполнено: ${stats.done}/${stats.totalTasks}\n`;
  text += `📊 По стратегии: ${stats.strategicDone}\n`;
  text += `🔥 Вне стратегии: ${stats.fireDone}\n`;
  text += `\n🎯 *SFI за спринт: ${stats.sfi}%*`;

  if (stats.sfi >= 70) text += ' — Отличный фокус!';
  else if (stats.sfi >= 50) text += ' — Хороший фокус';
  else if (stats.sfi > 0) text += ' — Стратегия требует внимания';

  return text;
}

module.exports = {
  getDayStats,
  getSprintStats,
  formatDayStats,
  formatSprintStats,
};
