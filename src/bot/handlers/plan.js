const { Markup } = require('telegraf');
const { getUserByTelegramId } = require('../../database/queries/users');
const { getActiveSprint } = require('../../database/queries/sprints');
const { addDayPlan, getTodayPlan, formatPlanItems } = require('../../services/planning');
const { escapeMarkdown } = require('../../utils/keyboards');

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
        // Показываем контекст спринта при планировании
        const sprintContext = await getSprintContext(user.id);
        await ctx.reply(
          sprintContext +
          '📋 У вас пока нет плана на сегодня.\n\n' +
          'Напишите список задач — каждая с новой строки:',
          { parse_mode: 'Markdown' }
        );
        ctx.session.awaitingPlanInput = true;
        return;
      }

      await ctx.reply(formatPlanItems(items), Markup.inlineKeyboard([
        [Markup.button.callback('➕ Добавить задачи', 'action_add_tasks')],
      ]));
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
        const sprintContext = await getSprintContext(user.id);
        await ctx.reply(
          sprintContext +
          '📋 План на сегодня пуст.\n\n' +
          'Напишите список задач — каждая с новой строки:',
          { parse_mode: 'Markdown' }
        );
        ctx.session.awaitingPlanInput = true;
        return;
      }

      await ctx.reply(formatPlanItems(items), Markup.inlineKeyboard([
        [Markup.button.callback('➕ Добавить задачи', 'action_add_tasks')],
      ]));
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
    if (ctx.message.text.startsWith('/')) return next();
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

      ctx.session.qualificationItems = items;
      ctx.session.qualificationIndex = 0;

      await ctx.reply(`✅ Добавлено задач: ${items.length}\n\nТеперь давайте квалифицируем каждую задачу:`);
      await sendQualificationQuestion(ctx, items[0]);
    } catch (error) {
      console.error('[PLAN] Error adding tasks:', error.message);
      await ctx.reply('Ошибка при добавлении задач.');
    }
  });

  // Обработка квалификации
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

      const label = isStrategic ? '📊 По стратегии' : '🔥 Вне стратегии';
      await ctx.editMessageText(`${label}: ${items[idx - 1].text_raw}`);

      if (idx < items.length) {
        await sendQualificationQuestion(ctx, items[idx]);
      } else {
        ctx.session.qualificationItems = null;
        ctx.session.qualificationIndex = null;

        const { data: user } = await getUserByTelegramId(ctx.from.id);
        const { data: updatedItems } = await getTodayPlan(user.id);
        await ctx.reply(
          '✅ Квалификация завершена!\n\n' + formatPlanItems(updatedItems)
        );
      }
    } catch (error) {
      console.error('[QUALIFY] Error:', error.message);
      await ctx.reply('Ошибка при квалификации задачи.');
    }
  });
}

async function getSprintContext(userId) {
  const { data: sprint } = await getActiveSprint(userId);
  if (!sprint) {
    return '⚠️ _Нет активного спринта. Задачи будут без привязки к стратегии._\n\n';
  }

  let text = `🎯 *Спринт:* ${escapeMarkdown(sprint.goal_text)}\n`;
  const initiatives = sprint.initiatives || [];
  if (initiatives.length > 0) {
    text += '*Инициативы:*\n';
    initiatives.forEach((init, i) => {
      text += `  ${i + 1}\\. ${escapeMarkdown(init.title)}\n`;
    });
  }
  text += '\n';
  return text;
}

async function sendQualificationQuestion(ctx, item) {
  await ctx.reply(
    `Задача: ${item.text_raw}\n\nЭто стратегическая задача?`,
    Markup.inlineKeyboard([
      [
        Markup.button.callback('📊 По стратегии', `qualify_strategic_${item.id}`),
        Markup.button.callback('🔥 Вне стратегии', `qualify_fire_${item.id}`),
      ],
    ])
  );
}

module.exports = { registerPlanHandlers };
