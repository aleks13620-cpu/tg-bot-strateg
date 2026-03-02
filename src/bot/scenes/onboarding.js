const { Scenes, Markup } = require('telegraf');
const { getUserByTelegramId } = require('../../database/queries/users');
const { startNewSprint } = require('../../services/sprint');
const { KEYBOARD_BUTTONS } = require('../../utils/keyboards');

const onboardingScene = new Scenes.WizardScene(
  'onboarding',

  // Шаг 0: Запрос цели спринта
  async (ctx) => {
    await ctx.reply(
      '🚀 *Создание спринта — шаг 1 из 3*\n\n' +
      '*Спринт* — ваша главная цель на ближайшие 2 недели.\n\n' +
      'Формулируйте как результат, которого хотите достичь:\n' +
      '_"Расширить ближний круг" · "Запустить MVP" · "Закрыть первые 3 клиента"_\n\n' +
      'Напишите *цель спринта* одним предложением:',
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
      `✅ Цель спринта: *${ctx.wizard.state.goal}*\n\n` +
      '— — —\n\n' +
      '*Шаг 2 из 3 — Инициативы*\n\n' +
      '*Инициатива* — ключевое направление для достижения цели.\n' +
      'На каждый спринт: 3–5 инициатив.\n\n' +
      '_Пример (цель "Расширить ближний круг"):_\n' +
      '_• Организовывать деловые встречи_\n' +
      '_• Посещать бизнес-мероприятия_\n' +
      '_• Вступить в бизнес-клуб_\n' +
      '_• Наладить контакт с Иваном_\n\n' +
      'Напишите *первую инициативу* вашего спринта:',
      { parse_mode: 'Markdown' }
    );
    return ctx.wizard.next();
  },

  // Шаг 2: Собираем инициативы + в конце показываем запрос финансовой цели
  async (ctx) => {
    if (ctx.callbackQuery) {
      if (ctx.callbackQuery.data === 'onboarding_done') {
        await ctx.answerCbQuery();
        await showFinancialGoalPrompt(ctx);
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
        'Максимум инициатив добавлен (5).',
        { parse_mode: 'Markdown' }
      );
      await showFinancialGoalPrompt(ctx);
      return ctx.wizard.next();
    }

    const buttons = [];
    if (count >= 3) {
      buttons.push([Markup.button.callback('✅ Готово — перейти дальше', 'onboarding_done')]);
    }
    buttons.push([Markup.button.callback('❌ Отмена', 'onboarding_cancel')]);

    await ctx.reply(
      `✅ Инициатива ${count}: *${initiative}*\n` +
      `Добавлено: ${count}/5\n\n` +
      (count < 3
        ? `Напишите следующую инициативу (нужно минимум 3):`
        : `Напишите ещё инициативу или нажмите *"Готово"*:`),
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(buttons),
      }
    );
    return;
  },

  // Шаг 3: Получаем ответ на финансовую цель (текст или пропуск)
  async (ctx) => {
    if (ctx.callbackQuery) {
      if (ctx.callbackQuery.data === 'onboarding_fin_skip') {
        await ctx.answerCbQuery();
        ctx.wizard.state.financialGoal = null;
        return ctx.wizard.next();
      }
      // Любой другой callback — игнорируем, ждём следующего ввода
      return;
    }

    if (!ctx.message?.text) return;

    if (KEYBOARD_BUTTONS.includes(ctx.message.text)) {
      await ctx.reply('❌ Создание спринта отменено.');
      return ctx.scene.leave();
    }

    ctx.wizard.state.financialGoal = ctx.message.text.trim();
    return ctx.wizard.next();
  },

  // Шаг 4: Подтверждение — показываем итоговую сводку
  async (ctx) => {
    const { goal, initiatives, financialGoal } = ctx.wizard.state;

    let summary = `📋 *Подтверждение*\n\n`;
    summary += `🎯 *Цель спринта (14 дней):*\n${goal}\n\n`;
    if (financialGoal) {
      summary += `💰 *Финансовая цель:* ${financialGoal}\n\n`;
    }
    summary += `📌 *Инициативы:*\n`;
    initiatives.forEach((init, i) => {
      summary += `${i + 1}. ${init}\n`;
    });
    summary += `\n_После создания каждое утро планируйте задачи по инициативам._\n\nСоздать спринт?`;

    await ctx.reply(summary, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('✅ Подтвердить', 'onboarding_confirm')],
        [Markup.button.callback('❌ Отмена', 'onboarding_cancel')],
      ]),
    });
    return ctx.wizard.next();
  },

  // Шаг 5: Создание спринта в БД
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

        const { goal, initiatives, financialGoal } = ctx.wizard.state;
        const { data: sprint, error } = await startNewSprint(user.id, goal, initiatives, 14, financialGoal);

        if (error) {
          await ctx.reply('Ошибка при создании спринта. Попробуйте позже.');
          return ctx.scene.leave();
        }

        let successMsg =
          `🎉 *Спринт создан!*\n\n` +
          `🎯 *Цель:* ${sprint.goal_text}\n` +
          `📅 ${new Date(sprint.start_date).toLocaleDateString('ru-RU')} — ${new Date(sprint.end_date).toLocaleDateString('ru-RU')}\n`;

        if (sprint.financial_goal) {
          successMsg += `💰 *Финансовая цель:* ${sprint.financial_goal}\n`;
        }

        successMsg +=
          `📌 Инициатив: ${sprint.initiatives.length}\n\n` +
          `*Что дальше?*\n` +
          `• Утром в 8:00 (МСК) — план дня: ставьте задачи по инициативам\n` +
          `• Вечером в 18:00 (МСК) — закрытие дня: отмечайте что сделано\n` +
          `• Кнопка *"📋 Добавить задачи"* — добавить задачи в любое время\n\n` +
          `_Задачи по инициативам = стратегические. Остальные = оперативные. SFI показывает ваш баланс._`;

        await ctx.reply(successMsg, { parse_mode: 'Markdown' });

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

async function showFinancialGoalPrompt(ctx) {
  await ctx.reply(
    '💰 *Финансовая цель спринта (необязательно)*\n\n' +
    'Есть ли у этого спринта финансовый ориентир?\n\n' +
    '_Пример: "Выручка 500 000 ₽" · "Закрыть сделок на 1 млн" · "3 клиента по 100К"_\n\n' +
    'Напишите цель или пропустите:',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('⏭ Пропустить', 'onboarding_fin_skip')],
      ]),
    }
  );
}

module.exports = { onboardingScene };
