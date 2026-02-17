function loggerMiddleware(ctx, next) {
  const start = Date.now();
  const userId = ctx.from?.id || 'unknown';
  const updateType = ctx.updateType;
  const text = ctx.message?.text || ctx.callbackQuery?.data || '';

  console.log(`[IN] ${updateType} from ${userId}: ${text}`);

  return next().then(() => {
    const ms = Date.now() - start;
    console.log(`[OUT] ${updateType} from ${userId} - ${ms}ms`);
  });
}

module.exports = { loggerMiddleware };
