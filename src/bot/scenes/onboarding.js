const { Scenes, Markup } = require('telegraf');
const { getUserByTelegramId } = require('../../database/queries/users');
const { startNewSprint } = require('../../services/sprint');
const { KEYBOARD_BUTTONS } = require('../../utils/keyboards');

const onboardingScene = new Scenes.WizardScene(
  'onboarding',

  // Шаг 0: Приветствие и запрос цели спринта
  async (ctx) => {
    await ctx.reply(
      '🚀 *Создание нового спринта*\n\n' +
      'Спринт — это 2-недельный фокус на вашей главной стратегической цели.\n\n' +
      'Напишите *цель спринта* одним предложением:\n' +
      '_Например: "Запустить новый продукт" или "Увеличить конверсию на 20%"_',
      { parse_mode: 'Markdown' }
    );
    ctx.wizard.state.initiatives = [];
    return ctx.wizard.next();
  },

  // Шаг 1: Сохраняем цель, запрашиваем первую инициативу
  async (ctx) => {
    if (!ctx.message?.text) {
      await ctx.reply('Пожалуйста, напишите цель текстом.');
      return;
    }

    if (KEYBOARD_BUTTONS.includes(ctx.message.text)) {
      await ctx.reply('❌ Создание спринта отменено.');
      return ctx.scene.leave();
    }

    ctx.wizard.state.goal = ctx.message.text.trim();

    await ctx.reply(
      `✅ Цель: *${ctx.wizard.state.goal}*\n\n` +
      'Теперь добавьте *инициативы* (3-5 ключевых действий для достижения цели).\n\n' +
      'Напишите *первую инициативу*:\n' +
      '_Например: "Разработать прототип MVP"_',
      { parse_mode: 'Markdown' }
    );
    return ctx.wizard.next();
  },

  // Шаг 2: Собираем инициативы (цикл)
  async (ctx) => {
    // Обработка кнопок
    if (ctx.callbackQuery) {
      if (ctx.callbackQuery.data === 'onboarding_done') {
        await ctx.answerCbQuery();
        return ctx.wizard.next();
      }
      if (ctx.callbackQuery.data === 'onboarding_cancel') {
        await ctx.answerCbQuery();
        await ctx.reply('❌ Создание спринта отменено.', Markup.removeKeyboard());
        return ctx.scene.leave();
      }
      await ctx.answerCbQuery();
      return;
    }

    if (!ctx.message?.text) {
      await ctx.reply('Пожалуйста, напишите инициативу текстом.');
      return;
    }

    if (KEYBOARD_BUTTONS.includes(ctx.message.text)) {
      await ctx.reply('❌ Создание спринта отменено.');
      return ctx.scene.leave();
    }

    const initiative = ctx.message.text.trim();
    ctx.wizard.state.initiatives.push(initiative);
    const count = ctx.wizard.state.initiatives.length;

    if (count >= 5) {
      await ctx.reply(
        `✅ Инициатива ${count}: *${initiative}*\n\n` +
        'Вы добавили максимум инициатив (5). Переходим к подтверждению...',
        { parse_mode: 'Markdown' }
      );
      return ctx.wizard.next();
    }

    const buttons = [];
    if (count >= 3) {
      buttons.push([Markup.button.callback('✅ Готово — создать спринт', 'onboarding_done')]);
    }
    buttons.push([Markup.button.callback('❌ Отмена', 'onboarding_cancel')]);

    await ctx.reply(
      `✅ Инициатива ${count}: *${initiative}*\n\n` +
      `Добавлено: ${count}/5\n` +
      (count < 3
        ? `Напишите следующую инициативу (минимум 3):`
        : `Напишите ещё инициативу или нажмите "Готово":`),
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(buttons),
      }
    );
    return;
  },

  // Шаг 3: Подтверждение
  async (ctx) => {
    const { goal, initiatives } = ctx.wizard.state;

    let summary = `📋 *Ваш новый спринт (14 дней):*\n\n`;
    summary += `🎯 *Цель:* ${goal}\n\n`;
    summary += `*Инициативы:*\n`;
    initiatives.forEach((init, i) => {
      summary += `${i + 1}. ${init}\n`;
    });
    summary += `\nСоздать спринт?`;

    await ctx.reply(summary, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('✅ Подтвердить', 'onboarding_confirm')],
        [Markup.button.callback('❌ Отмена', 'onboarding_cancel')],
      ]),
    });
    return ctx.wizard.next();
  },

  // Шаг 4: Создание спринта в БД
  async (ctx) => {
    if (!ctx.callbackQuery) return;

    if (ctx.callbackQuery.data === 'onboarding_cancel') {
      await ctx.answerCbQuery();
      await ctx.reply('❌ Создание спринта отменено.');
      return ctx.scene.leave();
    }

    if (ctx.callbackQuery.data === 'onboarding_confirm') {
      await ctx.answerCbQuery('Создаю спринт...');

      try {
        const telegramId = ctx.from.id;
        const { data: user } = await getUserByTelegramId(telegramId);

        if (!user) {
          await ctx.reply('Ошибка: профиль не найден. Используйте /start.');
          return ctx.scene.leave();
        }

        const { goal, initiatives } = ctx.wizard.state;
        const { data: sprint, error } = await startNewSprint(user.id, goal, initiatives);

        if (error) {
          await ctx.reply('Ошибка при создании спринта. Попробуйте позже.');
          return ctx.scene.leave();
        }

        await ctx.reply(
          `🎉 *Спринт создан!*\n\n` +
          `🎯 ${sprint.goal_text}\n` +
          `📅 ${new Date(sprint.start_date).toLocaleDateString('ru-RU')} — ${new Date(sprint.end_date).toLocaleDateString('ru-RU')}\n` +
          `📌 ${sprint.initiatives.length} инициатив\n\n` +
          `Напоминания: 9:00 (план дня) и 19:00 (закрытие дня)\n\n` +
          `Используйте /menu для навигации.`,
          { parse_mode: 'Markdown' }
        );

        console.log(`[ONBOARDING] Sprint ${sprint.id} created for user ${user.id}`);
      } catch (error) {
        console.error('[ONBOARDING] Error:', error.message);
        await ctx.reply('Произошла ошибка при создании спринта.');
      }

      return ctx.scene.leave();
    }

    await ctx.answerCbQuery();
  }
);

module.exports = { onboardingScene };
