const { findOrCreateUser, shouldShowDailyAlert } = require('../../database/queries/users');
const { mainMenuKeyboard, persistentKeyboard } = require('../../utils/keyboards');
const { getActiveSprint, formatSprint } = require('../../services/sprint');
const { getActiveSprints } = require('../../database/queries/sprints');
const { getTodayDate, formatDateRu } = require('../../services/planning');

const DB_TIMEOUT_MS = 8000;

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`DB timeout after ${ms}ms`)), ms)
    ),
  ]);
}

function registerStartHandlers(bot) {
  async function maybeShowExpiredSprintAlert(ctx, userId) {
    const today = getTodayDate();
    const { data: sprints } = await getActiveSprints(userId);
    if (!sprints || sprints.length === 0) return;

    const expired = sprints.find((s) => s.end_date < today);
    if (!expired) return;

    const allow = await shouldShowDailyAlert(userId, 'expiredSprintAlertShownDate', today);
    if (!allow) return;

    await ctx.reply(
      `⚠️ Спринт просрочен: *${expired.goal_text}*\n` +
      `📅 Дедлайн был ${formatDateRu(expired.end_date)}\n\n` +
      'Нужно принять решение:',
      {
        parse_mode: 'Markdown',
        ...require('telegraf').Markup.inlineKeyboard([
          [
            require('telegraf').Markup.button.callback('📅 Продлить', `extend_sprint_${expired.id}`),
            require('telegraf').Markup.button.callback('✅ Закрыть', `complete_sprint_${expired.id}`),
          ],
        ]),
      }
    );
  }

  bot.command('start', async (ctx) => {
    try {
      const telegramId = ctx.from.id;
      console.log(`[START] User ${telegramId} initiated /start`);

      const { data: user, error } = await withTimeout(findOrCreateUser(telegramId), DB_TIMEOUT_MS);

      if (error) {
        await ctx.reply('Не удалось создать профиль. Попробуйте /start ещё раз.');
        return;
      }

      const isNewUser = (Date.now() - new Date(user.created_at).getTime()) < 5000;

      await ctx.reply('Клавиатура активирована:', persistentKeyboard);

      if (isNewUser) {
        await ctx.reply(
          '👋 Привет! Я *Стратег-Ассистент*.\n\n' +
          'Помогаю держать фокус на цели: *спринт → инициативы → задачи*.\n' +
          'Давайте начнём — зафиксируем цель и первый шаг.',
          { parse_mode: 'Markdown' }
        );
        await ctx.reply(
          '🚀 *Готовы?*',
          {
            parse_mode: 'Markdown',
            ...require('telegraf').Markup.inlineKeyboard([
              [require('telegraf').Markup.button.callback('🚀 Начать', 'action_begin')],
              [require('telegraf').Markup.button.callback('💡 Как это работает', 'action_help_overview')],
            ]),
          }
        );
      } else {
        await ctx.reply(
          '👋 С возвращением!\n\nЧто делаем сейчас?',
          require('telegraf').Markup.inlineKeyboard([
            [require('telegraf').Markup.button.callback('✅ Сегодня (отметить)', 'action_today_checklist')],
            [require('telegraf').Markup.button.callback('📋 Добавить задачи', 'action_plan_add')],
            [require('telegraf').Markup.button.callback('🏠 Открыть меню', 'action_open_main_menu')],
          ])
        );
      }

      await maybeShowExpiredSprintAlert(ctx, user.id);
      console.log(`[START] User ${telegramId} - ${isNewUser ? 'new' : 'returning'}`);
    } catch (error) {
      console.error(`[START] DB error for ${ctx.from.id}:`, error.message, error.code);
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

  // План/Сегодня разведены: action_today_checklist (today.js) и action_plan_view (plan.js)

  bot.action('action_open_main_menu', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('Главное меню:', mainMenuKeyboard);
  });

  // Главный CTA на первом входе (пока ведёт в существующий онбординг спринта)
  // На этапе C будет переключено на first_touch.
  bot.action('action_begin', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.scene.enter('first_touch');
  });

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
      '📌 *Инициативы* — 3–5 ключевых областей работы внутри спринта\n' +
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

}

module.exports = { registerStartHandlers };
