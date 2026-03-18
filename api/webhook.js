const { bot } = require('../src/bot/index');

module.exports = async (req, res) => {
  console.log(`[WEBHOOK] ${req.method} request received`);

  if (req.method !== 'POST') {
    return res.status(200).json({ status: 'Strategist Bot is running' });
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
