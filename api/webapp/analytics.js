const { authenticate } = require('../../src/utils/webappAuth');
const { getActiveSprint } = require('../../src/database/queries/sprints');
const { getDayStats, getWeekStats, getSprintStats } = require('../../src/services/analytics');
const { supabase } = require('../../config/database');

// Понедельник текущей недели
function getWeekRange() {
  const today = new Date();
  const day = today.getUTCDay(); // 0=Sun
  const diff = (day === 0 ? -6 : 1 - day);
  const mon = new Date(today);
  mon.setUTCDate(today.getUTCDate() + diff);
  const sun = new Date(mon);
  sun.setUTCDate(mon.getUTCDate() + 6);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return { start: fmt(mon), end: fmt(sun) };
}

// by_direction: группировка plan_items по инициативам
async function buildDirections(userId, startDate, endDate, sprintId = null) {
  let query = supabase
    .from('plan_items')
    .select('status, is_strategic, actual_minutes, initiative_id, initiative:initiatives(id, title, sprint_id)')
    .eq('user_id', userId)
    .gte('date', startDate)
    .lte('date', endDate);

  const { data: items, error } = await query;
  if (error || !items) return [];

  // Если sprintId — фильтруем как в getSprintStats
  const filtered = sprintId
    ? items.filter((i) => !i.initiative_id || (i.initiative && i.initiative.sprint_id === sprintId))
    : items;

  const dirs = {};
  filtered.forEach((item) => {
    const key = item.initiative ? String(item.initiative.id) : '_fire_';
    const name = item.initiative ? item.initiative.title : '🔥 Вне стратегии';
    if (!dirs[key]) dirs[key] = { name, is_strategic: !!item.initiative, total: 0, completed: 0, time_minutes: 0 };
    dirs[key].total++;
    if (item.status === 'done') {
      dirs[key].completed++;
      dirs[key].time_minutes += item.actual_minutes || 0;
    }
  });

  return Object.values(dirs)
    .map((d) => ({ ...d, completion_rate: d.total > 0 ? Math.round((d.completed / d.total) * 100) : 0 }))
    .sort((a, b) => a.completion_rate - b.completion_rate);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await authenticate(req, res);
  if (!auth) return;

  const { user } = auth;
  const period = req.query.period || 'sprint';
  const today = new Date().toISOString().slice(0, 10);

  let stats, startDate, endDate, sprintId = null;

  if (period === 'today') {
    stats = await getDayStats(user.id, today);
    startDate = endDate = today;
  } else if (period === 'week') {
    const { start, end } = getWeekRange();
    startDate = start; endDate = end;
    stats = await getWeekStats(user.id, start, end);
  } else {
    // sprint
    const { data: sprint } = await getActiveSprint(user.id);
    if (!sprint) return res.status(200).json({ period, empty: true });
    startDate = sprint.start_date;
    endDate = sprint.end_date;
    sprintId = sprint.id;
    stats = await getSprintStats(user.id, startDate, endDate, sprintId);

    // Получаем sfi_goal из спринта
    var sfiGoal = sprint.sfi_challenge || 70;
  }

  if (!stats) return res.status(500).json({ error: 'Failed to compute stats' });

  const sfi_goal = sfiGoal || 70;
  const sfi_current = stats.sfi || 0;
  const sfiDiff = sfi_current - sfi_goal;
  const sfi_status = sfiDiff >= 0 ? 'above' : sfiDiff >= -5 ? 'on_target' : 'below';

  // period-specific fields
  const total_tasks = stats.total || stats.totalTasks || 0;
  const completed_tasks = stats.done || 0;
  const strategic_total = stats.totalStrategic || 0;

  const off_strategy_done = stats.fireDone || 0;
  const strategic_done = stats.strategicDone || 0;

  // Время
  const strategic_minutes = stats.strategicActualMinutes || 0;
  const off_strategy_minutes = stats.fireActualMinutes || 0;
  const total_minutes = (stats.totalActualMinutes || 0) || (strategic_minutes + off_strategy_minutes);
  const strategic_time_pct = total_minutes > 0 ? Math.round((strategic_minutes / total_minutes) * 100) : 0;

  const by_direction = await buildDirections(user.id, startDate, endDate, sprintId);

  return res.status(200).json({
    period,
    total_tasks,
    completed_tasks,
    completion_rate: total_tasks > 0 ? Math.round((completed_tasks / total_tasks) * 100) : 0,
    strategic: {
      completed: strategic_done,
      completion_rate: strategic_total > 0
        ? Math.round((strategic_done / strategic_total) * 100)
        : 0,
    },
    off_strategy: {
      completed: off_strategy_done,
    },
    sfi: {
      current: sfi_current,
      goal: sfi_goal,
      status: sfi_status,
    },
    time: {
      total_minutes,
      strategic_minutes,
      off_strategy_minutes,
      strategic_percent: strategic_time_pct,
    },
    by_direction,
  });
};
