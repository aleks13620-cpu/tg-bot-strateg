const { supabase } = require('../../config/database');

// Форматирование числа с пробелами как разделителями тысяч: 1000000 → "1 000 000"
function fmtNum(n) {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
}

// Форматирование минут: 90 → "1ч 30мин", 60 → "1ч", 45 → "45мин"
function fmtMinutes(minutes) {
  if (!minutes || minutes <= 0) return '0мин';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}ч ${m}мин`;
  if (h > 0) return `${h}ч`;
  return `${m}мин`;
}

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

  const totalPlannedMinutes    = items.reduce((sum, i) => sum + (i.planned_minutes || 0), 0);
  const totalActualMinutes     = items.reduce((sum, i) => sum + (i.actual_minutes  || 0), 0);
  const strategicActualMinutes = done.filter((i) => i.is_strategic).reduce((sum, i) => sum + (i.actual_minutes || 0), 0);
  const fireActualMinutes      = done.filter((i) => !i.is_strategic).reduce((sum, i) => sum + (i.actual_minutes || 0), 0);

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
    strategicActualMinutes,
    fireActualMinutes,
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
    const parts = [];
    if (stats.strategicActualMinutes > 0) parts.push(`🎯 стратегия: *${fmtMinutes(stats.strategicActualMinutes)}*`);
    if (stats.fireActualMinutes > 0)      parts.push(`🔥 текучка: *${fmtMinutes(stats.fireActualMinutes)}*`);
    text += `\n⏱ Время: ${parts.join(' · ')}`;
    text += ` (итого ${fmtMinutes(stats.totalActualMinutes)})`;
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

  // Статистика по инициативам: done + total для отображения % выполнения
  const byInitiativeStats = {};
  items.forEach((item) => {
    if (item.initiative) {
      const title = item.initiative.title;
      if (!byInitiativeStats[title]) byInitiativeStats[title] = { done: 0, total: 0 };
      byInitiativeStats[title].total++;
      if (item.status === 'done') byInitiativeStats[title].done++;
    }
  });

  const dayMap = {};
  items.forEach((item) => { dayMap[item.date] = true; });

  // Подсчёт причин пропуска
  const skipped = items.filter((i) => i.status === 'skipped' && i.skip_reason);
  const skipReasons = { dcl: 0, ntt: 0, nrl: 0, lfc: 0, tbg: 0, urd: 0, oth: 0 };
  const reasonCodeMap = {
    'Осознанно отказался': 'dcl',
    'Не хватило времени':  'ntt',
    'Потеряла актуальность': 'nrl',
    'Был расфокус':        'lfc',
    'Слишком большая задача': 'tbg',
    'Вытеснило срочное':   'urd',
    'Другое':              'oth',
  };
  skipped.forEach((i) => {
    const code = reasonCodeMap[i.skip_reason] || 'oth';
    skipReasons[code] = (skipReasons[code] || 0) + 1;
  });

  return {
    totalTasks: items.length,
    done: done.length,
    strategicDone,
    fireDone,
    sfi,
    daysWorked: Object.keys(dayMap).length,
    byInitiative,
    skipReasons,
    byInitiativeStats,
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

  // Причины пропуска
  if (stats.skipReasons) {
    const REASON_LABELS = {
      dcl: '✋ Осознанно отказался',
      ntt: '⏰ Не хватило времени',
      nrl: '📉 Потеряла актуальность',
      lfc: '🌀 Был расфокус',
      tbg: '📦 Слишком большая задача',
      urd: '🚨 Вытеснило срочное',
      oth: '💬 Другое',
    };
    const entries = Object.entries(stats.skipReasons).filter(([, v]) => v > 0);
    if (entries.length > 0) {
      text += '\n\n📉 *Причины пропуска:*\n';
      entries.sort((a, b) => b[1] - a[1]).forEach(([code, cnt]) => {
        text += `${REASON_LABELS[code]}: ${cnt}\n`;
      });
      // Коучинг-подсказка если одна причина >= 3 раз
      const dominant = entries.find(([, cnt]) => cnt >= 3);
      if (dominant) {
        const tips = {
          ntt: '💡 _Не хватает времени — попробуйте дробить задачи на меньшие шаги._',
          lfc: '💡 _Расфокус мешает. Попробуйте выбирать 1–3 задачи в день._',
          tbg: '💡 _Задачи слишком большие — разбивайте на подзадачи до 1 часа._',
          urd: '💡 _Срочное вытесняет важное. Планируйте стратегические задачи на утро._',
          nrl: '💡 _Много неактуальных задач — пересматривайте список раз в неделю._',
        };
        const tip = tips[dominant[0]];
        if (tip) text += `\n${tip}`;
      }
      text = text.trimEnd();
    }
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
  const actualFmt = fmtNum(actual);
  const targetFmt = fmtNum(target);
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
      return `📌 *${m.title}*\nТекущее: ${fmtNum(current)}${label}`;
    }

    const pct = Math.min(100, Math.round((current / target) * 100));
    const filled = Math.round(pct / 10);
    const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
    const icon = pct >= 100 ? '🏆' : pct >= 70 ? '🟢' : pct >= 40 ? '🟡' : '🔴';

    return `📌 *${m.title}*\n${bar} ${pct}% ${icon}\n${fmtNum(current)}${label} / ${fmtNum(target)}${label}`;
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
  fmtNum,
  fmtMinutes,
};
