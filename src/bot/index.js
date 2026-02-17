const { Telegraf } = require('telegraf');
require('dotenv').config();

const { loggerMiddleware } = require('./middleware/logger');
const { registerStartHandlers } = require('./handlers/start');

const bot = new Telegraf(process.env.BOT_TOKEN);

// Глобальный обработчик ошибок
bot.catch((err, ctx) => {
  console.error(`[BOT] Error for ${ctx.updateType}:`, err.message);
  ctx.reply('Произошла ошибка. Попробуйте позже.').catch(() => {});
});

// Middleware
bot.use(loggerMiddleware);

// Handlers
registerStartHandlers(bot);

// Запуск в polling-режиме (dev), если файл запущен напрямую
if (require.main === module) {
  bot.launch()
    .then(() => console.log('[BOT] Started in polling mode'))
    .catch((err) => {
      console.error('[BOT] Failed to start:', err);
      process.exit(1);
    });

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

module.exports = { bot };
