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

  const totalPlannedMinutes = items.reduce((sum, i) => sum + (i.planned_minutes || 0), 0);
  const totalActualMinutes  = items.reduce((sum, i) => sum + (i.actual_minutes  || 0), 0);

  return {
    total,
    done: done.length,
    skipped: skipped.length,
    pending: total - done.length - skipped.length,
    strategicDone,
    fireDone,
    sfi,
    byInitiative,
    totalPlannedMinutes,
    totalActualMinutes,
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

function formatDayStats(stats, sfiChallenge = null) {
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
  text += `\n🎯 Стратегические (по инициативам): ${stats.strategicDone}\n`;
  text += `🔥 Оперативные (текучка): ${stats.fireDone}\n`;
  if (stats.totalActualMinutes > 0) {
    const h = Math.floor(stats.totalActualMinutes / 60);
    const m = stats.totalActualMinutes % 60;
    const timeStr = h > 0 ? `${h}ч ${m > 0 ? m + 'мин' : ''}`.trim() : `${m}мин`;
    text += `\n⏱ Сегодня: *${timeStr}*`;
  }

  text += `\n📊 *SFI: ${stats.sfi}%*`;

  if (sfiChallenge) {
    const met = stats.sfi >= sfiChallenge;
    text += ` / цель ${sfiChallenge}% ${met ? '✅' : '❌'}`;
  }

  text += ` — стратегический фокус дня`;

  if (stats.sfi >= 70) text += ' 🟢';
  else if (stats.sfi >= 50) text += ' 🟡';
  else if (stats.sfi > 0) text += ' 🔴';

  return text;
}

function formatSprintStats(stats) {
  if (!stats) {
    return '📊 Нет данных по спринту.';
  }

  let text = '📊 *Статистика спринта:*\n\n';
  text += `📅 Рабочих дней: ${stats.daysWorked}\n`;
  text += `✅ Всего выполнено: ${stats.done}/${stats.totalTasks}\n`;
  text += `🎯 Стратегические: ${stats.strategicDone}\n`;
  text += `🔥 Оперативные: ${stats.fireDone}\n`;
  text += `\n📊 *SFI за спринт: ${stats.sfi}%*`;

  if (stats.sfi >= 70) text += ' 🟢 Отличный фокус!';
  else if (stats.sfi >= 50) text += ' 🟡 Хороший фокус';
  else if (stats.sfi > 0) text += ' 🔴 Стратегия требует внимания';

  return text;
}

async function getWeekStats(userId, weekStart, weekEnd) {
  const { data: items, error } = await supabase
    .from('plan_items')
    .select('*, initiative:initiatives(id, title)')
    .eq('user_id', userId)
    .gte('date', weekStart)
    .lte('date', weekEnd);

  if (error) {
    console.error('[ANALYTICS] Error getting week stats:', error.message);
    return null;
  }

  const done = items.filter((i) => i.status === 'done');
  const strategicDone = done.filter((i) => i.is_strategic).length;
  const fireDone = done.filter((i) => !i.is_strategic).length;
  const sfi = done.length > 0 ? Math.round((strategicDone / done.length) * 100) : 0;

  const byInitiative = {};
  done.forEach((item) => {
    if (item.initiative) {
      const title = item.initiative.title;
      byInitiative[title] = (byInitiative[title] || 0) + 1;
    }
  });

  const dayMap = {};
  items.forEach((item) => { dayMap[item.date] = true; });

  return {
    totalTasks: items.length,
    done: done.length,
    strategicDone,
    fireDone,
    sfi,
    daysWorked: Object.keys(dayMap).length,
    byInitiative,
  };
}

function formatWeekStats(stats, weekStart, weekEnd, prevStats, financialGoal = null, sfiChallenge = null) {
  const [, sm, sd] = weekStart.split('-');
  const [, em, ed] = weekEnd.split('-');
  const dateRange = `${sd}.${sm}–${ed}.${em}`;

  if (!stats || stats.totalTasks === 0) {
    return `📊 *Итоги недели ${dateRange}*\n\nЗадач не было.`;
  }

  let text = `📊 *Итоги недели ${dateRange}*\n\n`;
  text += `📅 Активных дней: ${stats.daysWorked}/7\n`;
  text += `✅ Выполнено: ${stats.done} из ${stats.totalTasks}\n`;
  text += `🎯 Стратегические: ${stats.strategicDone}\n`;
  text += `🔥 Оперативные: ${stats.fireDone}`;

  if (Object.keys(stats.byInitiative).length > 0) {
    text += '\n\n*По инициативам:*\n';
    for (const [title, count] of Object.entries(stats.byInitiative)) {
      text += `  🎯 ${title}: ${count}\n`;
    }
    text = text.trimEnd();
  }

  if (financialGoal) {
    text += `\n\n💰 *Финансовая цель:* ${financialGoal}`;
  }

  text += `\n\n📊 *SFI: ${stats.sfi}%*`;
  if (sfiChallenge) {
    const met = stats.sfi >= sfiChallenge;
    text += ` / цель ${sfiChallenge}% ${met ? '✅' : '❌'}`;
  }
  text += ' — стратегический фокус недели';
  if (stats.sfi >= 70) text += ' 🟢';
  else if (stats.sfi >= 50) text += ' 🟡';
  else if (stats.sfi > 0) text += ' 🔴';

  if (prevStats && prevStats.totalTasks > 0) {
    const sfiDiff = stats.sfi - prevStats.sfi;
    const doneDiff = stats.done - prevStats.done;
    text += `\n\nvs прошлая неделя: SFI ${sfiDiff >= 0 ? '+' : ''}${sfiDiff}% ${sfiDiff >= 0 ? '📈' : '📉'}`;
    if (doneDiff !== 0) text += ` · выполнено ${doneDiff >= 0 ? '+' : ''}${doneDiff}`;
  }

  return text;
}

/**
 * Прогресс-бар для спринта.
 * Пример: ████████░░ 8/14 дн. · SFI 67% 🟡
 */
function formatSprintProgressBar(sprint, sfi = null) {
  const today = new Date();
  const start = new Date(sprint.start_date + 'T00:00:00Z');
  const end = new Date(sprint.end_date + 'T00:00:00Z');

  const totalDays = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
  const daysUsed = Math.max(1, Math.min(totalDays, Math.round((today - start) / (1000 * 60 * 60 * 24)) + 1));

  const filledCount = Math.round((daysUsed / totalDays) * 10);
  const emptyCount = 10 - filledCount;
  const bar = '█'.repeat(filledCount) + '░'.repeat(emptyCount);

  let text = `${bar} ${daysUsed}/${totalDays} дн.`;

  if (sfi !== null) {
    const sfiIcon = sfi >= 70 ? '🟢' : sfi >= 50 ? '🟡' : sfi > 0 ? '🔴' : '';
    text += ` · SFI ${sfi}%${sfiIcon ? ' ' + sfiIcon : ''}`;
  }

  return text;
}

function buildSfiChartUrl(labels, sfiValues) {
  const colors = sfiValues.map((v) =>
    v >= 70 ? 'rgba(76,175,80,0.85)' : v >= 50 ? 'rgba(255,152,0,0.85)' : 'rgba(244,67,54,0.85)'
  );
  const config = {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: 'SFI %', data: sfiValues, backgroundColor: colors }],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { min: 0, max: 100, ticks: { callback: '__PERCENT__' } } },
    },
  };
  const json = JSON.stringify(config).replace('"__PERCENT__"', 'function(v){return v+"%"}');
  return `https://quickchart.io/chart?c=${encodeURIComponent(json)}&width=500&height=300&backgroundColor=white`;
}

function formatAllSprintsStats(sprintDataList) {
  const valid = sprintDataList.filter((s) => s.stats && s.stats.done > 0);
  if (valid.length === 0) return '📊 Данных по спринтам нет — выполните хотя бы одну задачу.';

  const avgSfi = Math.round(valid.reduce((sum, s) => sum + s.stats.sfi, 0) / valid.length);
  const totalDone = valid.reduce((sum, s) => sum + s.stats.done, 0);
  const best = valid.reduce((max, s) => s.stats.sfi > max.stats.sfi ? s : max, valid[0]);
  const sfiIcon = avgSfi >= 70 ? '🟢' : avgSfi >= 50 ? '🟡' : '🔴';

  let text = `📊 *Статистика по ${valid.length} спринтам:*\n\n`;
  text += `✅ Всего задач выполнено: ${totalDone}\n`;
  text += `📊 Средний SFI: *${avgSfi}%* ${sfiIcon}\n`;
  text += `🏆 Лучший спринт: _${best.sprint.goal_text}_ — SFI ${best.stats.sfi}%\n`;
  text += '\n*SFI по спринтам:*\n';

  for (const { sprint, stats } of sprintDataList) {
    if (!stats || stats.done === 0) continue;
    const icon = stats.sfi >= 70 ? '🟢' : stats.sfi >= 50 ? '🟡' : '🔴';
    const name = sprint.goal_text.length > 28 ? sprint.goal_text.slice(0, 25) + '…' : sprint.goal_text;
    text += `${icon} ${name}: *${stats.sfi}%* (${stats.done} задач)\n`;
  }

  return text;
}

function parseFinancialGoal(goalStr) {
  if (!goalStr) return null;
  const clean = goalStr.replace(/\s/g, '');
  const amount = parseFloat(clean.replace(/[^\d.]/g, ''));
  const symbol = clean.includes('₽') ? '₽' : clean.includes('$') ? '$' : clean.includes('€') ? '€' : '';
  return isNaN(amount) || amount <= 0 ? null : { amount, symbol };
}

function formatFinProgressBar(actual, target, symbol) {
  const pct = Math.min(100, Math.round((actual / target) * 100));
  const filled = Math.round(pct / 10);
  const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
  const actualFmt = Math.round(actual).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const targetFmt = Math.round(target).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const icon = pct >= 100 ? '🏆' : pct >= 70 ? '🟢' : pct >= 40 ? '🟡' : '🔴';
  return `${bar} *${pct}%* ${icon}\n${actualFmt} / ${targetFmt} ${symbol}`;
}

function buildFinChartUrl(labels, pctValues) {
  const colors = pctValues.map((v) =>
    v >= 100 ? 'rgba(33,150,243,0.85)' : v >= 70 ? 'rgba(76,175,80,0.85)' : v >= 40 ? 'rgba(255,152,0,0.85)' : 'rgba(244,67,54,0.85)'
  );
  const config = {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: 'Финцель %', data: pctValues, backgroundColor: colors }],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { min: 0, max: 100, ticks: { callback: '__PERCENT__' } } },
    },
  };
  const json = JSON.stringify(config).replace('"__PERCENT__"', 'function(v){return v+"%"}');
  return `https://quickchart.io/chart?c=${encodeURIComponent(json)}&width=500&height=300&backgroundColor=white`;
}

function formatMetricsBlock(metrics) {
  if (!metrics || metrics.length === 0) return '_Метрики не добавлены._';

  const unitLabel = { num: 'шт', rub: '₽', pct: '%', bool: '' };

  return metrics.map((m) => {
    const label = unitLabel[m.unit] || '';

    if (m.unit === 'bool') {
      const val = Number(m.current_value) === 1;
      return `📌 *${m.title}*\n${val ? '✅ Да' : '⬜ Нет'}`;
    }

    const current = Number(m.current_value) || 0;
    const target = Number(m.target_value) || 0;

    if (target <= 0) {
      return `📌 *${m.title}*\nТекущее: ${current}${label}`;
    }

    const pct = Math.min(100, Math.round((current / target) * 100));
    const filled = Math.round(pct / 10);
    const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
    const icon = pct >= 100 ? '🏆' : pct >= 70 ? '🟢' : pct >= 40 ? '🟡' : '🔴';

    return `📌 *${m.title}*\n${bar} ${pct}% ${icon}\n${current}${label} / ${target}${label}`;
  }).join('\n\n');
}

module.exports = {
  getDayStats,
  getSprintStats,
  getWeekStats,
  formatDayStats,
  formatSprintStats,
  formatWeekStats,
  formatSprintProgressBar,
  buildSfiChartUrl,
  formatAllSprintsStats,
  parseFinancialGoal,
  formatFinProgressBar,
  buildFinChartUrl,
  formatMetricsBlock,
};
