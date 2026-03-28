const { bot } = require('../src/bot/index');

module.exports = async (req, res) => {
  console.log(`[WEBHOOK] ${req.method} request received`);

  if (req.method !== 'POST') {
    return res.status(200).json({ status: 'Strategist Bot is running' });
  }

  // П.1: в production секрет обязателен (fail-closed). Вне production — прежняя мягкая схема: без env проверка отключена.
  const isProduction = process.env.NODE_ENV === 'production';
  const webhookSecret = process.env.WEBHOOK_SECRET_TOKEN;
  const secretConfigured = !!(webhookSecret && String(webhookSecret).trim());

  if (isProduction && !secretConfigured) {
    console.error(
      '[WEBHOOK] Production webhook secret is missing: set WEBHOOK_SECRET_TOKEN (must match Telegram setWebhook secret_token)'
    );
    return res.status(503).json({ error: 'Service Unavailable' });
  }

  if (secretConfigured) {
    const incoming = req.headers['x-telegram-bot-api-secret-token'];
    if (incoming !== webhookSecret) {
      console.warn('[WEBHOOK] Invalid or missing secret token — request rejected');
      return res.status(403).json({ error: 'Forbidden' });
    }
  }

  // П.4 (webhook): при исключении из handleUpdate отдаём не-200 (500), чтобы внешняя доставка
  // могла трактовать запрос как неуспешный и Telegram имел шанс повторить тот же update.
  // Осознанный компромисс: повторная доставка того же update_id возможна — без отдельной
  // дедупликации это риск повторной обработки / дубликатов; здесь только фиксируем риск, не решаем его.
  const start = Date.now();
  try {
    await bot.handleUpdate(req.body);
    console.log(`[WEBHOOK] Update ${req.body?.update_id} processed in ${Date.now() - start}ms`);
    return res.status(200).json({ ok: true });
  } catch (error) {
    const updateId = req.body?.update_id;
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    console.error('[WEBHOOK] Error processing update', {
      update_id: updateId,
      message,
      ...(stack ? { stack } : {}),
    });
    return res.status(500).json({ ok: false });
  }
};
