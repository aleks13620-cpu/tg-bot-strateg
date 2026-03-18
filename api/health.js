const { supabase } = require('../config/database');

module.exports = async (req, res) => {
  const start = Date.now();
  try {
    const { error } = await supabase.from('users').select('count').limit(1);
    if (error) throw error;
    const latency = Date.now() - start;
    console.log(`[HEALTH] OK — db latency ${latency}ms`);
    res.json({ ok: true, db: 'ok', latency_ms: latency, ts: Date.now() });
  } catch (e) {
    console.error('[HEALTH] DB check failed:', e.message);
    res.status(503).json({ ok: false, db: 'error', error: e.message, ts: Date.now() });
  }
};
