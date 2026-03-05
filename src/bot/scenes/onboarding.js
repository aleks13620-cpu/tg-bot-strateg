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
      'Формулируйте как результат:\n' +
      '_"Расширить ближний круг" · "Запустить MVP" · "Закрыть первые 3 клиента"_\n\n' +
      'Напишите цель одним предложением:',
      { parse_mode: 'Markdown' }
    );
    ctx.wizard.state.directions = [];
    return ctx.wizard.next();
  },

  // Шаг 1: Сохраняем цель, запрашиваем первое направление
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
      '— — —\n\n' +
      '📌 *Шаг 2 из 3 — Направления*\n\n' +
      '*Направление* — ключевая область работы для достижения цели.\n' +
      '_Пример: "Встречи с клиентами" · "Работа над продуктом" · "Личное развитие"_\n\n' +
      'Напишите первое направление:',
      { parse_mode: 'Markdown' }
    );
    return ctx.wizard.next();
  },

  // Шаг 2: Собираем направления (1–5), кнопка "Готово" доступна с первого
  async (ctx) => {
    if (ctx.callbackQuery) {
      if (ctx.callbackQuery.data === 'onboarding_done') {
        await ctx.answerCbQuery();
        await showDurationPrompt(ctx);
        return ctx.wizard.next();
      }
      if (ctx.callbackQuery.data === 'onboarding_cancel') {
        await ctx.answerCbQuery();
        await ctx.reply('❌ Создание спринта отменено.');
        return ctx.scene.leave();
      }
      await ctx.answerCbQuery();
      return;
    }

    if (!ctx.message?.text) {
      await ctx.reply('Пожалуйста, напишите направление текстом.');
      return;
    }

    if (KEYBOARD_BUTTONS.includes(ctx.message.text)) {
      await ctx.reply('❌ Создание спринта отменено.');
      return ctx.scene.leave();
    }

    const direction = ctx.message.text.trim();
    ctx.wizard.state.directions.push(direction);
    const count = ctx.wizard.state.directions.length;

    if (count >= 5) {
      await ctx.reply(
        `✅ Направление ${count}: *${direction}*\n\nМаксимум направлений добавлено (5).`,
        { parse_mode: 'Markdown' }
      );
      await showDurationPrompt(ctx);
      return ctx.wizard.next();
    }

    await ctx.reply(
      `✅ Направление ${count}: *${direction}*\n\nДобавьте ещё или нажмите *"Готово"*:`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('✅ Готово', 'onboarding_done')],
          [Markup.button.callback('❌ Отмена', 'onboarding_cancel')],
        ]),
      }
    );
    return;
  },

  // Шаг 3: Получаем длительность, показываем подтверждение
  async (ctx) => {
    if (!ctx.callbackQuery) return;

    const data = ctx.callbackQuery.data;

    if (data === 'onboarding_cancel') {
      await ctx.answerCbQuery();
      await ctx.reply('❌ Создание спринта отменено.');
      return ctx.scene.leave();
    }

    const durMap = { onboarding_dur_7: 7, onboarding_dur_14: 14, onboarding_dur_21: 21 };
    const duration = durMap[data];
    if (!duration) {
      await ctx.answerCbQuery();
      return;
    }

    await ctx.answerCbQuery();
    ctx.wizard.state.duration = duration;

    const { goal, directions } = ctx.wizard.state;
    let summary = `📋 *Подтверждение*\n\n`;
    summary += `🎯 *Цель (${duration} дней):*\n${goal}\n\n`;
    summary += `📌 *Направления:*\n`;
    directions.forEach((d, i) => {
      summary += `${i + 1}. ${d}\n`;
    });
    summary += `\nСоздать спринт?`;

    try {
      await ctx.editMessageText(summary, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('✅ Подтвердить', 'onboarding_confirm')],
          [Markup.button.callback('❌ Отмена', 'onboarding_cancel')],
        ]),
      });
    } catch {
      await ctx.reply(summary, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('✅ Подтвердить', 'onboarding_confirm')],
          [Markup.button.callback('❌ Отмена', 'onboarding_cancel')],
        ]),
      });
    }
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

        const { goal, directions, duration } = ctx.wizard.state;
        const { data: sprint, error } = await startNewSprint(user.id, goal, directions, duration);

        if (error) {
          await ctx.reply('Ошибка при создании спринта. Попробуйте позже.');
          return ctx.scene.leave();
        }

        const successMsg =
          `🎉 *Спринт создан!*\n\n` +
          `🎯 *Цель:* ${sprint.goal_text}\n` +
          `📅 ${new Date(sprint.start_date).toLocaleDateString('ru-RU')} — ${new Date(sprint.end_date).toLocaleDateString('ru-RU')}\n` +
          `📌 Направлений: ${sprint.initiatives.length}\n\n` +
          `*Что дальше?*\n` +
          `• Кнопка *"📋 Добавить задачи"* — планируйте день\n` +
          `• Вечером закрывайте день кнопкой *"🌙 Закрыть день"*\n` +
          `• Утром бот пришлёт напоминание с планом\n\n` +
          `_Задачи по направлениям = стратегические. SFI показывает ваш баланс._`;

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

async function showDurationPrompt(ctx) {
  await ctx.reply(
    '🕐 *Шаг 3 из 3 — Длительность*\n\nНа сколько дней ставим спринт?',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('7 дней', 'onboarding_dur_7'),
          Markup.button.callback('14 дней', 'onboarding_dur_14'),
          Markup.button.callback('21 день', 'onboarding_dur_21'),
        ],
        [Markup.button.callback('❌ Отмена', 'onboarding_cancel')],
      ]),
    }
  );
}

module.exports = { onboardingScene };
