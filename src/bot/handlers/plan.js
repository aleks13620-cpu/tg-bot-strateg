const { Markup } = require('telegraf');
const { getUserByTelegramId } = require('../../database/queries/users');
const { addDayPlan, getTodayPlan, formatPlanItems } = require('../../services/planning');

function registerPlanHandlers(bot) {
  // Кнопка "Мой план на сегодня" из главного меню
  bot.action('action_today_plan', async (ctx) => {
    await ctx.answerCbQuery();
    try {
      const { data: user } = await getUserByTelegramId(ctx.from.id);
      if (!user) {
        await ctx.reply('Профиль не найден. Используйте /start.');
        return;
      }

      const { data: items } = await getTodayPlan(user.id);

      if (items.length === 0) {
        await ctx.reply(
          '📋 У вас пока нет плана на сегодня.\n\n' +
          'Напишите список задач — каждая с новой строки:\n\n' +
          '_Например:_\n' +
          '_Встреча с командой по MVP_\n' +
          '_Подготовить презентацию для инвестора_\n' +
          '_Ответить на письма_',
          { parse_mode: 'Markdown' }
        );
        // Ставим флаг ожидания ввода задач
        ctx.session.awaitingPlanInput = true;
        return;
      }

      await ctx.reply(formatPlanItems(items), {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('➕ Добавить задачи', 'action_add_tasks')],
        ]),
      });
    } catch (error) {
      console.error('[PLAN] Error:', error.message);
      await ctx.reply('Ошибка при загрузке плана.');
    }
  });

  // Команда /plan
  bot.command('plan', async (ctx) => {
    try {
      const { data: user } = await getUserByTelegramId(ctx.from.id);
      if (!user) {
        await ctx.reply('Профиль не найден. Используйте /start.');
        return;
      }

      const { data: items } = await getTodayPlan(user.id);

      if (items.length === 0) {
        await ctx.reply(
          '📋 План на сегодня пуст.\n\n' +
          'Напишите список задач — каждая с новой строки:',
          { parse_mode: 'Markdown' }
        );
        ctx.session.awaitingPlanInput = true;
        return;
      }

      await ctx.reply(formatPlanItems(items), {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('➕ Добавить задачи', 'action_add_tasks')],
        ]),
      });
    } catch (error) {
      console.error('[PLAN] Error:', error.message);
      await ctx.reply('Ошибка при загрузке плана.');
    }
  });

  // Кнопка "Добавить задачи" к существующему плану
  bot.action('action_add_tasks', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
      '📝 Напишите новые задачи — каждая с новой строки:',
      { parse_mode: 'Markdown' }
    );
    ctx.session.awaitingPlanInput = true;
  });

  // Обработка текстового ввода задач
  bot.on('text', async (ctx, next) => {
    // Пропускаем команды
    if (ctx.message.text.startsWith('/')) return next();

    // Проверяем, ждём ли мы ввод плана
    if (!ctx.session?.awaitingPlanInput) return next();

    try {
      const { data: user } = await getUserByTelegramId(ctx.from.id);
      if (!user) {
        await ctx.reply('Профиль не найден. Используйте /start.');
        return;
      }

      ctx.session.awaitingPlanInput = false;

      const { data: items, error } = await addDayPlan(user.id, ctx.message.text);

      if (error) {
        await ctx.reply('Ошибка: ' + error.message);
        return;
      }

      console.log(`[PLAN] User ${user.id} added ${items.length} tasks`);

      // Начинаем квалификацию — первая задача
      ctx.session.qualificationItems = items;
      ctx.session.qualificationIndex = 0;

      await ctx.reply(`✅ Добавлено задач: ${items.length}\n\nТеперь давайте квалифицируем каждую задачу:`);
      await sendQualificationQuestion(ctx, items[0]);
    } catch (error) {
      console.error('[PLAN] Error adding tasks:', error.message);
      await ctx.reply('Ошибка при добавлении задач.');
    }
  });

  // Обработка квалификации — стратегическая или нет
  bot.action(/^qualify_(strategic|fire)_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    try {
      const isStrategic = ctx.match[1] === 'strategic';
      const itemId = parseInt(ctx.match[2]);

      const { updatePlanItem } = require('../../database/queries/planItems');
      await updatePlanItem(itemId, { is_strategic: isStrategic });

      const items = ctx.session?.qualificationItems || [];
      const idx = (ctx.session?.qualificationIndex || 0) + 1;
      ctx.session.qualificationIndex = idx;

      if (idx < items.length) {
        const label = isStrategic ? '📊 По стратегии' : '🔥 Вне стратегии';
        await ctx.editMessageText(
          `${label}: ${items[idx - 1].text_raw}`,
        );
        await sendQualificationQuestion(ctx, items[idx]);
      } else {
        const label = isStrategic ? '📊 По стратегии' : '🔥 Вне стратегии';
        await ctx.editMessageText(
          `${label}: ${items[idx - 1].text_raw}`,
        );

        // Квалификация завершена — показываем итог
        ctx.session.qualificationItems = null;
        ctx.session.qualificationIndex = null;

        const { data: user } = await getUserByTelegramId(ctx.from.id);
        const { data: updatedItems } = await getTodayPlan(user.id);
        await ctx.reply(
          '✅ Квалификация завершена!\n\n' + formatPlanItems(updatedItems),
          { parse_mode: 'Markdown' }
        );
      }
    } catch (error) {
      console.error('[QUALIFY] Error:', error.message);
      await ctx.reply('Ошибка при квалификации задачи.');
    }
  });
}

async function sendQualificationQuestion(ctx, item) {
  await ctx.reply(
    `Задача: *${item.text_raw}*\n\nЭто стратегическая задача?`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('📊 По стратегии', `qualify_strategic_${item.id}`),
          Markup.button.callback('🔥 Вне стратегии', `qualify_fire_${item.id}`),
        ],
      ]),
    }
  );
}

module.exports = { registerPlanHandlers };
