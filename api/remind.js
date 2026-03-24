const { bot } = require('../src/bot/index');
const {
  getAllActiveUsers,
  getUsersToRemindNow,
  getMorningMessage,
  getEveningMessage,
  getMidDayMessage,
  getReactivationMessage,
  getWeeklyMessage,
  getStaleMessage,
  getReminderType,
  markReminderSent,
} = require('../src/services/reminder');

async function sendForUser(user, type, localDate) {
  let message = null;

  if (type === 'morning') {
    message = await getMorningMessage(user.id);
  } else if (type === 'weekly') {
    message = await getWeeklyMessage(user.id);
  } else if (type === 'midday') {
    message = await getMidDayMessage(user.id);
  } else if (type === 'reactivation') {
    message = await getReactivationMessage(user.id);
  } else {
    message = await getEveningMessage(user.id);
  }

  if (!message) {
    console.log(`[REMIND] No message for ${user.telegram_id} (type=${type})`);
    return false;
  }

  await bot.telegram.sendMessage(user.telegram_id, message.text, {
    parse_mode: 'Markdown',
    ...message.keyboard,
  });

  // Утром — дополнительно устаревшие задачи
  if (type === 'morning') {
    const staleMsg = await getStaleMessage(user.id);
    if (staleMsg) {
      await bot.telegram.sendMessage(user.telegram_id, staleMsg.text, {
        parse_mode: 'Markdown',
        ...staleMsg.keyboard,
      });
    }
  }

  // Idempotency: фиксируем отправку в meta чтобы не дублировать
  if (localDate && (type === 'morning' || type === 'evening' || type === 'weekly')) {
    markReminderSent(user.id, type, localDate).catch((e) =>
      console.error(`[REMIND] Failed to mark ${type} sent for ${user.telegram_id}:`, e.message)
    );
  }

  return true;
}

module.exports = async (req, res) => {
  console.log('[REMIND] Reminder endpoint called');

  const secret = req.headers['x-webhook-secret'] || req.query.secret;
  if (secret !== process.env.WEBHOOK_SECRET) {
    console.warn('[REMIND] Invalid secret');
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const type = req.query.type || 'check';
    let sent = 0, skipped = 0, failed = 0;

    // Параллельная отправка батчами по CONCURRENCY пользователей
    const CONCURRENCY = 10;

    async function sendBatch(entries) {
      const results = await Promise.allSettled(
        entries.map(({ user, type: userType, localDate }) =>
          sendForUser(user, userType, localDate).then((ok) => ({ ok }))
        )
      );
      for (const result of results) {
        if (result.status === 'fulfilled') {
          result.value.ok ? sent++ : skipped++;
        } else {
          failed++;
        }
      }
    }

    // Per-user режим: определяем кому и что отправить по их TZ и настройкам
    if (type === 'check') {
      const pairs = await getUsersToRemindNow(new Date());
      const pairsSummary = pairs.map((p) => `${p.user.telegram_id}(${p.type})`).join(', ');
      console.log(`[REMIND] check mode: ${pairs.length} reminders to send${pairsSummary ? ': ' + pairsSummary : ''}`);

      for (let i = 0; i < pairs.length; i += CONCURRENCY) {
        await sendBatch(pairs.slice(i, i + CONCURRENCY));
      }
    } else {
      // Обратная совместимость: явный type для ручного запуска
      const users = await getAllActiveUsers();
      const pairs = users.map((user) => ({ user, type }));

      for (let i = 0; i < pairs.length; i += CONCURRENCY) {
        await sendBatch(pairs.slice(i, i + CONCURRENCY));
      }
    }

    console.log(`[REMIND] type=${type} Sent: ${sent}, Skipped: ${skipped}, Failed: ${failed}`);
    res.status(200).json({ ok: true, sent, skipped, failed, type });
  } catch (error) {
    console.error('[REMIND] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
};
