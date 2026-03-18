const { supabase } = require('../config/database');
const https = require('https');

const WEBHOOK_URL = 'https://tg-bot-strateg-1ukh.vercel.app/api/webhook';

function getWebhookInfo() {
  return new Promise((resolve) => {
    const token = process.env.BOT_TOKEN;
    if (!token) return resolve({ ok: false, error: 'no token' });
    https.get(`https://api.telegram.org/bot${token}/getWebhookInfo`, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({ ok: false, error: 'parse error' }); }
      });
    }).on('error', (e) => resolve({ ok: false, error: e.message }));
  });
}

module.exports = async (req, res) => {
  const start = Date.now();

  // DB check
  let dbStatus = 'ok';
  let dbError = null;
  try {
    const { error } = await supabase.from('users').select('count').limit(1);
    if (error) throw error;
  } catch (e) {
    dbStatus = 'error';
    dbError = e.message;
  }

  // Webhook check
  let webhookStatus = 'ok';
  let webhookError = null;
  const info = await getWebhookInfo();
  if (!info.ok) {
    webhookStatus = 'error';
    webhookError = info.error || 'telegram api error';
  } else {
    const url = info.result?.url;
    const pending = info.result?.pending_update_count || 0;
    const lastErr = info.result?.last_error_message;
    if (url !== WEBHOOK_URL) {
      webhookStatus = 'missing';
      webhookError = `url="${url}"`;
    } else if (pending > 50) {
      webhookStatus = 'backlog';
      webhookError = `pending=${pending}`;
    } else if (lastErr) {
      webhookStatus = 'degraded';
      webhookError = lastErr;
    }
  }

  const ok = dbStatus === 'ok' && webhookStatus === 'ok';
  const latency = Date.now() - start;

  console.log(`[HEALTH] db=${dbStatus} webhook=${webhookStatus} latency=${latency}ms`);

  res.status(ok ? 200 : 503).json({
    ok,
    db: dbStatus,
    webhook: webhookStatus,
    ...(dbError && { db_error: dbError }),
    ...(webhookError && { webhook_error: webhookError }),
    latency_ms: latency,
    ts: Date.now(),
  });
};
