const { Telegraf, Scenes, session } = require('telegraf');
require('dotenv').config();

const { loggerMiddleware } = require('./middleware/logger');
const { registerStartHandlers } = require('./handlers/start');
const { registerPlanHandlers } = require('./handlers/plan');
const { registerDayCloseHandlers } = require('./handlers/dayClose');
const { registerProgressHandlers } = require('./handlers/progress');
const { registerUploadHandlers } = require('./handlers/upload');
const { registerSprintsHandlers } = require('./handlers/sprints');
const { registerTodayHandlers } = require('./handlers/today');
const { registerFinanceHandlers } = require('./handlers/finance');
const { registerMetricsHandlers } = require('./handlers/metrics');
const { registerReviewHandlers } = require('./handlers/review');
const { registerSettingsHandlers } = require('./handlers/settings');
const { registerAdminHandlers } = require('./handlers/admin');
const { onboardingScene } = require('./scenes/onboarding');
const { quarterlyReviewScene } = require('./scenes/quarterlyReview');
const { firstTouchScene } = require('./scenes/firstTouch');

const bot = new Telegraf(process.env.BOT_TOKEN);

function alertAdmin(message) {
  const adminId = process.env.ADMIN_TELEGRAM_ID;
  if (!adminId) return;
  bot.telegram.sendMessage(adminId, `🚨 ${message}`).catch(() => {});
}

process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  console.error('[BOT] Unhandled rejection:', reason);
  alertAdmin(`[BOT] Unhandled rejection: ${msg}`);
});

// Глобальный обработчик ошибок
bot.catch((err, ctx) => {
  // Telegram callback query expired — безвредно, не показываем пользователю ошибку
  if (err.message && (err.message.includes('query is too old') || err.message.includes('query ID is invalid'))) {
    console.warn(`[BOT] Callback query expired (ignored): ${err.message}`);
    return;
  }
  console.error(`[BOT] Error for ${ctx.updateType}:`, err.message);
  alertAdmin(`[BOT] Error (${ctx.updateType}): ${err.message}`);
  ctx.reply('Произошла ошибка. Попробуйте позже.').catch(() => {});
});

// Middleware
bot.use(loggerMiddleware);

// Session + Scenes
const stage = new Scenes.Stage([onboardingScene, quarterlyReviewScene, firstTouchScene]);
bot.use(session());
bot.use(stage.middleware());

// Handlers (порядок важен: sprints/finance text handlers должны быть до plan text handler)
registerStartHandlers(bot);
registerTodayHandlers(bot);
registerSprintsHandlers(bot);
registerFinanceHandlers(bot);
registerMetricsHandlers(bot);
registerSettingsHandlers(bot);
registerReviewHandlers(bot);
registerAdminHandlers(bot);
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
