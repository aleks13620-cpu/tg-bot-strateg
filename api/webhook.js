const { bot } = require('../src/bot/index');

module.exports = async (req, res) => {
  console.log(`[WEBHOOK] ${req.method} request received`);

  if (req.method !== 'POST') {
    return res.status(200).json({ status: 'Strategist Bot is running' });
  }

  // Проверка секретного токена от Telegram (защита от поддельных запросов)
  const webhookSecret = process.env.WEBHOOK_SECRET_TOKEN;
  if (webhookSecret) {
    const incoming = req.headers['x-telegram-bot-api-secret-token'];
    if (incoming !== webhookSecret) {
      console.warn('[WEBHOOK] Invalid or missing secret token — request rejected');
      return res.status(403).json({ error: 'Forbidden' });
    }
  }

  const start = Date.now();
  try {
    await bot.handleUpdate(req.body);
    console.log(`[WEBHOOK] Update ${req.body?.update_id} processed in ${Date.now() - start}ms`);
  } catch (error) {
    console.error('[WEBHOOK] Error processing update:', error.message);
  }

  // Всегда 200 — иначе Telegram перестанет отправлять обновления
  res.status(200).json({ ok: true });
};
