const { supabase } = require('../../../config/database');

function loggerMiddleware(ctx, next) {
  const start = Date.now();
  const telegramId = ctx.from?.id;
  const updateType = ctx.updateType;
  const text = ctx.message?.text || ctx.callbackQuery?.data || '';

  console.log(`[IN] ${updateType} from ${telegramId}: ${text}`);

  // Обновляем last_active_at асинхронно (fire & forget)
  if (telegramId) {
    supabase
      .from('users')
      .update({ last_active_at: new Date().toISOString() })
      .eq('telegram_id', telegramId)
      .then(() => {})
      .catch(() => {});
  }

  return next().then(() => {
    const ms = Date.now() - start;
    console.log(`[OUT] ${updateType} from ${telegramId} - ${ms}ms`);
  });
}

module.exports = { loggerMiddleware };
