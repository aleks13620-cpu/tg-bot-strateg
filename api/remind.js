const { bot } = require('../src/bot/index');
const { getAllActiveUsers, getMorningMessage, getEveningMessage, getReminderType } = require('../src/services/reminder');

module.exports = async (req, res) => {
  console.log('[REMIND] Reminder endpoint called');

  // Проверка секрета (защита от случайных вызовов)
  const secret = req.headers['x-webhook-secret'] || req.query.secret;
  if (secret !== process.env.WEBHOOK_SECRET) {
    console.warn('[REMIND] Invalid secret');
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const users = await getAllActiveUsers();
    const type = req.query.type || getReminderType();

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const user of users) {
      try {
        const message = type === 'morning'
          ? await getMorningMessage(user.id)
          : await getEveningMessage(user.id);

        if (!message) {
          skipped++;
          continue;
        }

        await bot.telegram.sendMessage(
          user.telegram_id,
          message.text,
          { parse_mode: 'Markdown', ...message.keyboard }
        );
        sent++;
      } catch (err) {
        console.error(`[REMIND] Failed for user ${user.telegram_id}:`, err.message);
        failed++;
      }
    }

    console.log(`[REMIND] Sent: ${sent}, Skipped: ${skipped}, Failed: ${failed}`);
    res.status(200).json({ ok: true, sent, skipped, failed, type });
  } catch (error) {
    console.error('[REMIND] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
};
