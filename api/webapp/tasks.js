const { authenticate } = require('../../src/utils/webappAuth');
const { getPlanItemsByDate } = require('../../src/database/queries/planItems');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await authenticate(req, res);
  if (!auth) return;

  const { user } = auth;
  const today = new Date().toISOString().slice(0, 10);

  const { data: items, error } = await getPlanItemsByDate(user.id, today);
  if (error) return res.status(500).json({ error: 'Failed to fetch tasks' });

  const tasks = (items || []).map((item) => ({
    id: item.id,
    title: item.text_raw,
    direction: item.initiative ? item.initiative.title : null,
    is_strategic: item.is_strategic || false,
    status: item.status,
    is_day_task: item.is_key_task || false,
    planned_minutes: item.planned_minutes || null,
    actual_minutes: item.actual_minutes || null,
  }));

  const completed = tasks.filter((t) => t.status === 'done').length;
  const strategic = tasks.filter((t) => t.is_strategic).length;
  const off_strategy = tasks.filter((t) => !t.is_strategic).length;

  return res.status(200).json({
    date: today,
    tasks,
    summary: {
      total: tasks.length,
      completed,
      strategic,
      off_strategy,
    },
  });
};
