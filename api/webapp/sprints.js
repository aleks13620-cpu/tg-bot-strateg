const { authenticate } = require('../../src/utils/webappAuth');
const { getActiveSprint } = require('../../src/database/queries/sprints');
const { getGoalMetricsBySprint } = require('../../src/database/queries/goalMetrics');
const { getFinancialProgress } = require('../../src/database/queries/finance');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await authenticate(req, res);
  if (!auth) return;

  const { user } = auth;

  const { data: sprint } = await getActiveSprint(user.id);
  if (!sprint) return res.status(200).json({ sprint: null });

  // Дни спринта
  const today = new Date();
  const start = new Date(sprint.start_date + 'T00:00:00Z');
  const end = new Date(sprint.end_date + 'T00:00:00Z');
  const duration = Math.round((end - start) / 86400000) + 1;
  const day_number = Math.max(1, Math.min(duration, Math.round((today - start) / 86400000) + 1));
  const days_left = Math.max(0, Math.round((end - today) / 86400000));

  // Финансовый прогресс (суммируем все записи за спринт)
  let financial_current = null;
  if (sprint.financial_goal) {
    const { data: finRecords } = await getFinancialProgress(user.id, sprint.id);
    if (finRecords && finRecords.length > 0) {
      financial_current = finRecords.reduce((sum, r) => sum + (Number(r.actual_value) || 0), 0);
    }
  }

  // Метрики для monthly_goal
  let metrics = [];
  if (sprint.type === 'monthly_goal') {
    const { data: rawMetrics } = await getGoalMetricsBySprint(sprint.id);
    if (rawMetrics) {
      metrics = rawMetrics.map((m) => ({
        id: m.id,
        title: m.title,
        current_value: Number(m.current_value) || 0,
        target_value: Number(m.target_value) || null,
        unit: m.unit,
        progress_percent: m.target_value > 0
          ? Math.min(100, Math.round((Number(m.current_value) / Number(m.target_value)) * 100))
          : null,
      }));
    }
  }

  return res.status(200).json({
    sprint: {
      id: sprint.id,
      type: sprint.type,
      goal: sprint.goal_text,
      directions: (sprint.initiatives || []).map((i) => ({ id: i.id, title: i.title })),
      duration,
      start_date: sprint.start_date,
      end_date: sprint.end_date,
      day_number,
      days_left,
      financial_goal: sprint.financial_goal || null,
      financial_current,
      sfi_goal: sprint.sfi_challenge || 70,
    },
    metrics,
  });
};
