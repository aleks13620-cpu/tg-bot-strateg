const { Markup } = require('telegraf');
const { getUserByTelegramId } = require('../../database/queries/users');
const { getActiveSprint } = require('../../database/queries/sprints');
const { addDayPlan, getTodayPlan, formatPlanItems } = require('../../services/planning');
const { escapeMarkdown, persistentKeyboard, KEYBOARD_BUTTONS } = require('../../utils/keyboards');

function registerPlanHandlers(bot) {
  // Reply keyboard: кнопка "Добавить задачи"
  bot.hears('📋 Добавить задачи', async (ctx) => {
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
          '📋 У вас пока нет плана на сегодня.\n\n' +
          'Напишите список задач — каждая с новой строки или через запятую:',
          { parse_mode: 'Markdown' }
        );
      } else {
        await ctx.reply(
          formatPlanItems(items) + '\n\n📝 Напишите новые задачи — каждая с новой строки или через запятую:'
        );
      }
      ctx.session.awaitingPlanInput = true;
    } catch (error) {
      console.error('[PLAN] Error from reply keyboard:', error.message);
      await ctx.reply('Ошибка при загрузке плана.');
    }
  });

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
          'Напишите список задач — каждая с новой строки или через запятую:',
          { parse_mode: 'Markdown' }
        );
        ctx.session.awaitingPlanInput = true;
        return;
      }

      await ctx.reply(formatPlanItems(items), Markup.inlineKeyboard([
        [Markup.button.callback('➕ Добавить задачи', 'action_add_tasks')],
        [Markup.button.callback('✏️ Редактировать задачи', 'action_edit_tasks')],
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
          'Напишите список задач — каждая с новой строки или через запятую:',
          { parse_mode: 'Markdown' }
        );
        ctx.session.awaitingPlanInput = true;
        return;
      }

      await ctx.reply(formatPlanItems(items), Markup.inlineKeyboard([
        [Markup.button.callback('➕ Добавить задачи', 'action_add_tasks')],
        [Markup.button.callback('✏️ Редактировать задачи', 'action_edit_tasks')],
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
      '📝 Напишите новые задачи — каждая с новой строки или через запятую:',
      { parse_mode: 'Markdown' }
    );
    ctx.session.awaitingPlanInput = true;
  });

  // Обработка текстового ввода задач
  bot.on('text', async (ctx, next) => {
    if (ctx.message.text.startsWith('/')) return next();
    if (KEYBOARD_BUTTONS.includes(ctx.message.text)) {
      ctx.session.awaitingPlanInput = false;
      return next();
    }
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

      // Загружаем инициативы для квалификации
      const { data: sprint } = await getActiveSprint(user.id);
      const initiatives = sprint?.initiatives || [];

      ctx.session.qualificationItems = items;
      ctx.session.qualificationIndex = 0;
      ctx.session.qualificationInitiatives = initiatives;

      await ctx.reply(`✅ Добавлено задач: ${items.length}\n\nТеперь квалифицируем каждую задачу:`);
      await sendQualificationQuestion(ctx, items[0], initiatives);
    } catch (error) {
      console.error('[PLAN] Error adding tasks:', error.message);
      await ctx.reply('Ошибка при добавлении задач.');
    }
  });

  // Квалификация: привязка к инициативе
  bot.action(/^qualify_init_(\d+)_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    try {
      const initiativeId = parseInt(ctx.match[1]);
      const itemId = parseInt(ctx.match[2]);

      const { updatePlanItem } = require('../../database/queries/planItems');
      await updatePlanItem(itemId, { initiative_id: initiativeId, is_strategic: true });

      const items = ctx.session?.qualificationItems || [];
      const initiatives = ctx.session?.qualificationInitiatives || [];
      const idx = (ctx.session?.qualificationIndex || 0) + 1;
      ctx.session.qualificationIndex = idx;

      const initiative = initiatives.find((i) => i.id === initiativeId);
      const label = initiative ? `🎯 ${initiative.title}` : '📊 По стратегии';
      await ctx.editMessageText(`${label}: ${items[idx - 1].text_raw}`);

      if (idx < items.length) {
        await sendQualificationQuestion(ctx, items[idx], initiatives);
      } else {
        await finishQualification(ctx);
      }
    } catch (error) {
      console.error('[QUALIFY] Error:', error.message);
      await ctx.reply('Ошибка при квалификации задачи.');
    }
  });

  // Квалификация: вне стратегии
  bot.action(/^qualify_fire_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    try {
      const itemId = parseInt(ctx.match[1]);

      const { updatePlanItem } = require('../../database/queries/planItems');
      await updatePlanItem(itemId, { initiative_id: null, is_strategic: false });

      const items = ctx.session?.qualificationItems || [];
      const initiatives = ctx.session?.qualificationInitiatives || [];
      const idx = (ctx.session?.qualificationIndex || 0) + 1;
      ctx.session.qualificationIndex = idx;

      await ctx.editMessageText(`🔥 Вне стратегии: ${items[idx - 1].text_raw}`);

      if (idx < items.length) {
        await sendQualificationQuestion(ctx, items[idx], initiatives);
      } else {
        await finishQualification(ctx);
      }
    } catch (error) {
      console.error('[QUALIFY] Error:', error.message);
      await ctx.reply('Ошибка при квалификации задачи.');
    }
  });

  // Кнопка "Редактировать задачи"
  bot.action('action_edit_tasks', async (ctx) => {
    await ctx.answerCbQuery();
    try {
      const { data: user } = await getUserByTelegramId(ctx.from.id);
      if (!user) return;

      const { data: items } = await getTodayPlan(user.id);
      if (items.length === 0) {
        await ctx.reply('Нет задач для редактирования.');
        return;
      }

      await ctx.reply('✏️ Выберите задачу для редактирования:');

      for (const item of items) {
        const tag = item.initiative ? ` [${item.initiative.title}]` : item.is_strategic ? ' 📊' : ' 🔥';
        await ctx.reply(
          `${item.text_raw}${tag}`,
          Markup.inlineKeyboard([
            [
              Markup.button.callback('🗑 Удалить', `action_delete_${item.id}`),
              Markup.button.callback('🔄 Сменить инициативу', `action_requalify_${item.id}`),
            ],
          ])
        );
      }
    } catch (error) {
      console.error('[PLAN] Edit error:', error.message);
      await ctx.reply('Ошибка при загрузке задач.');
    }
  });

  // Удаление задачи
  bot.action(/^action_delete_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery('🗑');
    try {
      const itemId = parseInt(ctx.match[1]);
      const { deletePlanItem } = require('../../database/queries/planItems');
      await deletePlanItem(itemId);
      await ctx.editMessageText('🗑 Задача удалена');
    } catch (error) {
      console.error('[PLAN] Delete error:', error.message);
      await ctx.reply('Ошибка при удалении задачи.');
    }
  });

  // Переквалификация задачи — показать кнопки инициатив
  bot.action(/^action_requalify_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    try {
      const itemId = parseInt(ctx.match[1]);
      const { data: user } = await getUserByTelegramId(ctx.from.id);
      if (!user) return;

      const { data: sprint } = await getActiveSprint(user.id);
      const initiatives = sprint?.initiatives || [];

      const buttons = [];
      initiatives.forEach((init) => {
        buttons.push([
          Markup.button.callback(`🎯 ${init.title}`, `requalify_init_${init.id}_${itemId}`),
        ]);
      });
      buttons.push([
        Markup.button.callback('🔥 Вне стратегии', `requalify_fire_${itemId}`),
      ]);

      await ctx.editMessageText('К какой инициативе отнести?', Markup.inlineKeyboard(buttons));
    } catch (error) {
      console.error('[PLAN] Requalify error:', error.message);
      await ctx.reply('Ошибка.');
    }
  });

  // Переквалификация: выбрана инициатива
  bot.action(/^requalify_init_(\d+)_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    try {
      const initiativeId = parseInt(ctx.match[1]);
      const itemId = parseInt(ctx.match[2]);

      const { updatePlanItem } = require('../../database/queries/planItems');
      await updatePlanItem(itemId, { initiative_id: initiativeId, is_strategic: true });

      const { data: user } = await getUserByTelegramId(ctx.from.id);
      const { data: sprint } = await getActiveSprint(user.id);
      const initiative = (sprint?.initiatives || []).find((i) => i.id === initiativeId);
      const label = initiative ? `🎯 ${initiative.title}` : '📊 По стратегии';
      await ctx.editMessageText(`${label} ✅`);
    } catch (error) {
      console.error('[PLAN] Requalify error:', error.message);
      await ctx.reply('Ошибка.');
    }
  });

  // Переквалификация: вне стратегии
  bot.action(/^requalify_fire_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    try {
      const itemId = parseInt(ctx.match[1]);
      const { updatePlanItem } = require('../../database/queries/planItems');
      await updatePlanItem(itemId, { initiative_id: null, is_strategic: false });
      await ctx.editMessageText('🔥 Вне стратегии ✅');
    } catch (error) {
      console.error('[PLAN] Requalify error:', error.message);
      await ctx.reply('Ошибка.');
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

async function sendQualificationQuestion(ctx, item, initiatives) {
  const buttons = [];

  // Кнопка для каждой инициативы
  if (initiatives && initiatives.length > 0) {
    initiatives.forEach((init) => {
      buttons.push([
        Markup.button.callback(`🎯 ${init.title}`, `qualify_init_${init.id}_${item.id}`),
      ]);
    });
  }

  // Всегда показываем "Вне стратегии"
  buttons.push([
    Markup.button.callback('🔥 Вне стратегии', `qualify_fire_${item.id}`),
  ]);

  await ctx.reply(
    `Задача: ${item.text_raw}\n\nК какой инициативе относится?`,
    Markup.inlineKeyboard(buttons)
  );
}

async function finishQualification(ctx) {
  ctx.session.qualificationItems = null;
  ctx.session.qualificationIndex = null;
  ctx.session.qualificationInitiatives = null;

  const { data: user } = await getUserByTelegramId(ctx.from.id);
  const { data: updatedItems } = await getTodayPlan(user.id);
  await ctx.reply(
    '✅ Квалификация завершена!\n\n' + formatPlanItems(updatedItems),
    persistentKeyboard
  );
}

module.exports = { registerPlanHandlers };
