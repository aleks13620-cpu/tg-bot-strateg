const { findOrCreateUser } = require('../../database/queries/users');
const { mainMenuKeyboard } = require('../../utils/keyboards');

function registerStartHandlers(bot) {
  bot.command('start', async (ctx) => {
    try {
      const telegramId = ctx.from.id;
      console.log(`[START] User ${telegramId} initiated /start`);

      const { data: user, error } = await findOrCreateUser(telegramId);

      if (error) {
        await ctx.reply('Не удалось создать профиль. Попробуйте /start ещё раз.');
        return;
      }

      const isNewUser = (Date.now() - new Date(user.created_at).getTime()) < 5000;

      const welcomeText = isNewUser
        ? '🎯 Добро пожаловать в Стратег-Ассистент!\n\nЯ помогу вам управлять стратегическими целями, планировать спринты и отслеживать прогресс.\n\nВыберите действие:'
        : '👋 С возвращением!\n\nВыберите действие:';

      await ctx.reply(welcomeText, mainMenuKeyboard);
      console.log(`[START] User ${telegramId} - ${isNewUser ? 'new' : 'returning'}`);
    } catch (error) {
      console.error('[START] Unhandled error:', error.message);
      await ctx.reply('Произошла ошибка. Попробуйте позже.');
    }
  });

  bot.command('menu', async (ctx) => {
    try {
      console.log(`[MENU] User ${ctx.from.id} requested menu`);
      await ctx.reply('Главное меню:', mainMenuKeyboard);
    } catch (error) {
      console.error('[MENU] Error:', error.message);
      await ctx.reply('Не удалось показать меню. Попробуйте /menu ещё раз.');
    }
  });

  // Заглушки для inline-кнопок (будут реализованы в следующих этапах)
  bot.action('action_today_plan', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('🚧 Планирование дня будет доступно в следующем обновлении.');
  });

  bot.action('action_current_sprint', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('🚧 Спринты будут доступны в следующем обновлении.');
  });

  bot.action('action_analytics', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('🚧 Аналитика будет доступна в следующем обновлении.');
  });

  bot.action('action_settings', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('🚧 Настройки будут доступны в следующем обновлении.');
  });
}

module.exports = { registerStartHandlers };
