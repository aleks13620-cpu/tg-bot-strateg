const { Telegraf, Scenes, session } = require('telegraf');
require('dotenv').config();

const { loggerMiddleware } = require('./middleware/logger');
const { registerStartHandlers } = require('./handlers/start');
const { registerPlanHandlers } = require('./handlers/plan');
const { registerDayCloseHandlers } = require('./handlers/dayClose');
const { registerProgressHandlers } = require('./handlers/progress');
const { registerUploadHandlers } = require('./handlers/upload');
const { onboardingScene } = require('./scenes/onboarding');

const bot = new Telegraf(process.env.BOT_TOKEN);

// Глобальный обработчик ошибок
bot.catch((err, ctx) => {
  console.error(`[BOT] Error for ${ctx.updateType}:`, err.message);
  ctx.reply('Произошла ошибка. Попробуйте позже.').catch(() => {});
});

// Middleware
bot.use(loggerMiddleware);

// Session + Scenes
const stage = new Scenes.Stage([onboardingScene]);
bot.use(session());
bot.use(stage.middleware());

// Handlers
registerStartHandlers(bot);
registerPlanHandlers(bot);
registerDayCloseHandlers(bot);
registerProgressHandlers(bot);
registerUploadHandlers(bot);

// Запуск в polling-режиме (dev), если файл запущен напрямую
if (require.main === module) {
  // Удаляем webhook перед polling (иначе 409 конфликт)
  bot.telegram.deleteWebhook().then(() => {
    return bot.launch();
  })
    .then(() => console.log('[BOT] Started in polling mode'))
    .catch((err) => {
      console.error('[BOT] Failed to start:', err);
      process.exit(1);
    });

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

module.exports = { bot };
