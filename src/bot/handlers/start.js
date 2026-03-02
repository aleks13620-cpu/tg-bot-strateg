const { findOrCreateUser } = require('../../database/queries/users');
const { mainMenuKeyboard, persistentKeyboard } = require('../../utils/keyboards');
const { getActiveSprint, formatSprint } = require('../../services/sprint');

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

      await ctx.reply('Клавиатура активирована:', persistentKeyboard);

      if (isNewUser) {
        await ctx.reply(
          '👋 Привет! Я *Стратег-Ассистент* — помогаю предпринимателям двигаться к стратегическим целям, не теряясь в текучке.\n\n' +
          '📐 *Как это работает — 3 уровня:*\n\n' +
          '1️⃣ *СПРИНТ* — ваша главная цель на 2 недели\n' +
          '_Пример: "Расширить ближний круг"_\n\n' +
          '2️⃣ *ИНИЦИАТИВЫ* — ключевые направления для достижения цели\n' +
          '_Пример: организовать деловые встречи · посещать бизнес-мероприятия · вступить в бизнес-клуб · наладить контакт с Иваном_\n\n' +
          '3️⃣ *ЗАДАЧИ* — конкретные действия на каждый день\n' +
          '_Пример (по инициативе "Вступить в бизнес-клуб"): найти клубы в городе → обзвонить → записаться на встречу_\n\n' +
          '📊 Каждый вечер бот считает *SFI* (Strategic Focus Index) — процент задач, которые двигали вас к цели спринта, а не просто "тушили пожары".',
          { parse_mode: 'Markdown' }
        );
        await ctx.reply(
          '🚀 *Готовы начать?*\n\nСоздайте первый спринт — задайте цель на ближайшие 2 недели.',
          {
            parse_mode: 'Markdown',
            ...require('telegraf').Markup.inlineKeyboard([
              [require('telegraf').Markup.button.callback('🚀 Создать первый спринт', 'action_new_sprint')],
              [require('telegraf').Markup.button.callback('💡 Что ещё умеет бот', 'action_help_overview')],
            ]),
          }
        );
      } else {
        await ctx.reply('👋 С возвращением!\n\nВыберите действие:', mainMenuKeyboard);
      }
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

  // Reply keyboard: кнопка "🏠 Меню"
  bot.hears('🏠 Меню', async (ctx) => {
    try {
      console.log(`[MENU] User ${ctx.from.id} requested menu via keyboard`);
      await ctx.reply('Главное меню:', mainMenuKeyboard);
    } catch (error) {
      console.error('[MENU] Error:', error.message);
      await ctx.reply('Не удалось показать меню. Попробуйте /menu ещё раз.');
    }
  });

  // action_today_plan обрабатывается в handlers/plan.js

  bot.action('action_current_sprint', async (ctx) => {
    await ctx.answerCbQuery();
    try {
      const { data: user } = await require('../../database/queries/users').getUserByTelegramId(ctx.from.id);
      if (!user) {
        await ctx.reply('Профиль не найден. Используйте /start.');
        return;
      }
      const { data: sprint } = await getActiveSprint(user.id);
      if (!sprint) {
        await ctx.reply(
          'У вас нет активного спринта.\n\nХотите создать?',
          require('telegraf').Markup.inlineKeyboard([
            [require('telegraf').Markup.button.callback('🚀 Создать спринт', 'action_new_sprint')],
          ])
        );
        return;
      }
      await ctx.reply(formatSprint(sprint), { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('[SPRINT] Error:', error.message);
      await ctx.reply('Ошибка при загрузке спринта.');
    }
  });

  bot.action('action_new_sprint', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.scene.enter('onboarding');
  });

  // action_analytics обрабатывается в handlers/progress.js

  bot.action('action_help_overview', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
      '💡 *Что умеет Стратег-Ассистент:*\n\n' +
      '📋 *Планирование дня* — каждое утро в 8:00 (МСК) бот предложит запланировать задачи по вашим инициативам\n\n' +
      '🌙 *Закрытие дня* — вечером в 18:00 (МСК) отмечаете что сделано, бот считает SFI\n\n' +
      '📊 *SFI (Strategic Focus Index)* — процент задач дня, которые относятся к спринту. Показывает насколько вы сфокусированы на стратегии, а не на "текучке"\n\n' +
      '🎯 *Спринт* — цель на 2 недели с инициативами\n' +
      '📌 *Инициативы* — 3–5 ключевых направлений внутри спринта\n' +
      '✅ *Задачи* — ежедневные действия, привязанные к инициативам\n\n' +
      '🔥 *Оперативные задачи* — срочные дела вне спринта (тоже важны, но SFI они снижают)\n\n' +
      '📈 *Еженедельный отчёт* — итоги недели с динамикой',
      {
        parse_mode: 'Markdown',
        ...require('telegraf').Markup.inlineKeyboard([
          [require('telegraf').Markup.button.callback('🚀 Создать спринт', 'action_new_sprint')],
        ]),
      }
    );
  });

  bot.action('action_settings', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('🚧 Настройки будут доступны в следующем обновлении.');
  });
}

module.exports = { registerStartHandlers };
