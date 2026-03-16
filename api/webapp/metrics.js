const { authenticate } = require('../../src/utils/webappAuth');
const { getActiveSprint } = require('../../src/database/queries/sprints');
const { getGoalMetricsBySprint } = require('../../src/database/queries/goalMetrics');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await authenticate(req, res);
  if (!auth) return;

  const { user } = auth;

  let sprintId = req.query.sprint_id || null;

  if (!sprintId) {
    const { data: sprint } = await getActiveSprint(user.id);
    if (!sprint) return res.status(200).json({ metrics: [], sprint_id: null, sprint_type: null });
    sprintId = sprint.id;
    var sprintType = sprint.type;
  }

  const { data: rawMetrics } = await getGoalMetricsBySprint(sprintId);
  const metrics = (rawMetrics || []).map((m) => ({
    id: m.id,
    title: m.title,
    current_value: Number(m.current_value) || 0,
    target_value: Number(m.target_value) || null,
    unit: m.unit,
    progress_percent: m.target_value > 0
      ? Math.min(100, Math.round((Number(m.current_value) / Number(m.target_value)) * 100))
      : null,
    updated_at: m.created_at,
  }));

  return res.status(200).json({
    sprint_id: sprintId,
    sprint_type: sprintType || null,
    metrics,
  });
};
