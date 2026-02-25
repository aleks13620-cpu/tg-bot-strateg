const { Markup } = require('telegraf');
const { getUserByTelegramId } = require('../../database/queries/users');
const { getActiveSprint, getActiveSprints } = require('../../database/queries/sprints');
const { addDayPlan, getTodayPlan, formatPlanMessages, getTodayDate } = require('../../services/planning');
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
        await sendPlanMessages(ctx, items);
        await ctx.reply('📝 Напишите новые задачи — каждая с новой строки или через запятую:');
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

      await sendPlanMessages(ctx, items, {
        buttons: Markup.inlineKeyboard([
          [Markup.button.callback('➕ Добавить задачи', 'action_add_tasks')],
          [Markup.button.callback('✏️ Редактировать задачи', 'action_edit_tasks')],
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

      await sendPlanMessages(ctx, items, {
        buttons: Markup.inlineKeyboard([
          [Markup.button.callback('➕ Добавить задачи', 'action_add_tasks')],
          [Markup.button.callback('✏️ Редактировать задачи', 'action_edit_tasks')],
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
      '📝 Напишите новые задачи — каждая с новой строки или через запятую:',
      { parse_mode: 'Markdown' }
    );
    ctx.session.awaitingPlanInput = true;
  });

  // Обработчик пересланных сообщений (должен быть ДО bot.on('text'))
  bot.on('message', async (ctx, next) => {
    const msg = ctx.message;
    const isForwarded = !!(msg.forward_origin || msg.forward_date);
    if (!isForwarded) return next();

    const text = (msg.text || msg.caption || '').trim();
    if (!text) {
      await ctx.reply('Пересланное сообщение не содержит текста.');
      return;
    }

    try {
      const { data: user } = await getUserByTelegramId(ctx.from.id);
      if (!user) {
        await ctx.reply('Профиль не найден. Используйте /start.');
        return;
      }

      const { createPlanItems } = require('../../database/queries/planItems');
      const { data: items, error } = await createPlanItems(user.id, getTodayDate(), [text]);
      if (error || !items || items.length === 0) {
        await ctx.reply('Ошибка при добавлении задачи.');
        return;
      }

      console.log(`[PLAN] User ${user.id} added forwarded task: "${text}"`);

      const { data: sprints } = await getActiveSprints(user.id);
      ctx.session.qualificationItems = items;
      ctx.session.qualificationIndex = 0;
      ctx.session.qualificationSprints = sprints;
      ctx.session.qualificationSelectedSprint = null;
      ctx.session.qualificationInitiatives = [];

      await ctx.reply(`✅ Задача из пересланного сообщения:\n"${text}"\n\nКвалифицируем:`);
      await startQualificationForItem(ctx, items[0], sprints);
    } catch (error) {
      console.error('[PLAN] Forwarded message error:', error.message);
      await ctx.reply('Ошибка при обработке пересланного сообщения.');
    }
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

      // Загружаем ВСЕ активные спринты для квалификации
      const { data: sprints } = await getActiveSprints(user.id);

      ctx.session.qualificationItems = items;
      ctx.session.qualificationIndex = 0;
      ctx.session.qualificationSprints = sprints;
      ctx.session.qualificationSelectedSprint = null;
      ctx.session.qualificationInitiatives = [];

      await ctx.reply(`✅ Добавлено задач: ${items.length}\n\nТеперь квалифицируем каждую задачу:`);
      await startQualificationForItem(ctx, items[0], sprints);
    } catch (error) {
      console.error('[PLAN] Error adding tasks:', error.message);
      await ctx.reply('Ошибка при добавлении задач.');
    }
  });

  // Квалификация шаг 1: выбор спринта
  bot.action(/^qualify_sprint_(\d+)_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    try {
      const sprintId = parseInt(ctx.match[1]);
      const itemId = parseInt(ctx.match[2]);

      const sprints = ctx.session?.qualificationSprints || [];
      const sprint = sprints.find((s) => s.id === sprintId);
      if (!sprint) {
        await ctx.reply('Спринт не найден. Попробуйте ещё раз.');
        return;
      }

      ctx.session.qualificationSelectedSprint = sprint;
      const initiatives = sprint.initiatives || [];
      ctx.session.qualificationInitiatives = initiatives;

      const items = ctx.session?.qualificationItems || [];
      const idx = ctx.session?.qualificationIndex || 0;
      const item = items[idx];

      await ctx.editMessageText(`🎯 Спринт выбран: ${sprint.goal_text}`);

      if (initiatives.length === 0) {
        // Нет инициатив — сразу стратегическая задача без инициативы
        const { updatePlanItem } = require('../../database/queries/planItems');
        await updatePlanItem(item.id, { initiative_id: null, is_strategic: true });

        const nextIdx = idx + 1;
        ctx.session.qualificationIndex = nextIdx;
        await ctx.reply(`📊 В спринт (без инициатив): ${item.text_raw}`);

        if (nextIdx < items.length) {
          await startQualificationForItem(ctx, items[nextIdx], sprints);
        } else {
          await finishQualification(ctx);
        }
      } else {
        await sendQualificationQuestion(ctx, item, initiatives);
      }
    } catch (error) {
      console.error('[QUALIFY] Sprint select error:', error.message);
      await ctx.reply('Ошибка при выборе спринта.');
    }
  });

  // Квалификация шаг 2: привязка к инициативе
  bot.action(/^qualify_init_(\d+)_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    try {
      const initiativeId = parseInt(ctx.match[1]);
      const itemId = parseInt(ctx.match[2]);

      const { updatePlanItem } = require('../../database/queries/planItems');
      await updatePlanItem(itemId, { initiative_id: initiativeId, is_strategic: true });

      const items = ctx.session?.qualificationItems || [];
      const sprints = ctx.session?.qualificationSprints || [];
      const initiatives = ctx.session?.qualificationInitiatives || [];
      const idx = (ctx.session?.qualificationIndex || 0) + 1;
      ctx.session.qualificationIndex = idx;

      const initiative = initiatives.find((i) => i.id === initiativeId);
      const label = initiative ? `🎯 ${initiative.title}` : '📊 По стратегии';
      await ctx.editMessageText(`${label}: ${items[idx - 1].text_raw}`);

      if (idx < items.length) {
        await startQualificationForItem(ctx, items[idx], sprints);
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
      const sprints = ctx.session?.qualificationSprints || [];
      const idx = (ctx.session?.qualificationIndex || 0) + 1;
      ctx.session.qualificationIndex = idx;

      await ctx.editMessageText(`🔥 Вне стратегии: ${items[idx - 1].text_raw}`);

      if (idx < items.length) {
        await startQualificationForItem(ctx, items[idx], sprints);
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

  // Переквалификация задачи — показать выбор спринта или инициатив
  bot.action(/^action_requalify_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    try {
      const itemId = parseInt(ctx.match[1]);
      const { data: user } = await getUserByTelegramId(ctx.from.id);
      if (!user) return;

      const { data: sprints } = await getActiveSprints(user.id);

      if (!sprints || sprints.length === 0) {
        await ctx.editMessageText(
          'К какой инициативе отнести?',
          Markup.inlineKeyboard([[Markup.button.callback('🔥 Вне стратегии', `requalify_fire_${itemId}`)]])
        );
        return;
      }

      if (sprints.length === 1) {
        const initiatives = sprints[0].initiatives || [];
        const buttons = initiatives.map((init) => [
          Markup.button.callback(`🎯 ${init.title}`, `requalify_init_${init.id}_${itemId}`),
        ]);
        buttons.push([Markup.button.callback('🔥 Вне стратегии', `requalify_fire_${itemId}`)]);
        await ctx.editMessageText('К какой инициативе отнести?', Markup.inlineKeyboard(buttons));
        return;
      }

      // Несколько спринтов — выбор спринта
      ctx.session.requalifySprints = sprints;
      const buttons = sprints.map((s) => [
        Markup.button.callback(
          `🎯 ${s.goal_text.length > 40 ? s.goal_text.substring(0, 40) + '…' : s.goal_text}`,
          `requalify_sprint_${s.id}_${itemId}`
        ),
      ]);
      buttons.push([Markup.button.callback('🔥 Вне стратегии', `requalify_fire_${itemId}`)]);
      await ctx.editMessageText('В какой спринт?', Markup.inlineKeyboard(buttons));
    } catch (error) {
      console.error('[PLAN] Requalify error:', error.message);
      await ctx.reply('Ошибка.');
    }
  });

  // Переквалификация: выбор спринта (шаг 1 при нескольких спринтах)
  bot.action(/^requalify_sprint_(\d+)_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    try {
      const sprintId = parseInt(ctx.match[1]);
      const itemId = parseInt(ctx.match[2]);
      const sprints = ctx.session?.requalifySprints || [];
      const sprint = sprints.find((s) => s.id === sprintId);
      if (!sprint) {
        await ctx.reply('Спринт не найден.');
        return;
      }
      const initiatives = sprint.initiatives || [];
      if (initiatives.length === 0) {
        const { updatePlanItem } = require('../../database/queries/planItems');
        await updatePlanItem(itemId, { initiative_id: null, is_strategic: true });
        await ctx.editMessageText('📊 По стратегии ✅');
        return;
      }
      const buttons = initiatives.map((init) => [
        Markup.button.callback(`🎯 ${init.title}`, `requalify_init_${init.id}_${itemId}`),
      ]);
      buttons.push([Markup.button.callback('🔥 Вне стратегии', `requalify_fire_${itemId}`)]);
      await ctx.editMessageText('В какую инициативу?', Markup.inlineKeyboard(buttons));
    } catch (error) {
      console.error('[PLAN] Requalify sprint error:', error.message);
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

      // Ищем название инициативы из session (requalify или qualification)
      const sessionSprints = ctx.session?.requalifySprints || ctx.session?.qualificationSprints || [];
      let label = '📊 По стратегии';
      for (const s of sessionSprints) {
        const found = (s.initiatives || []).find((i) => i.id === initiativeId);
        if (found) { label = `🎯 ${found.title}`; break; }
      }
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

// Отправка плана несколькими сообщениями (по одному на спринт)
async function sendPlanMessages(ctx, items, { buttons, date, sprints } = {}) {
  const d = date || getTodayDate();
  let activeSprints = sprints;
  if (!activeSprints) {
    try {
      const { data: user } = await getUserByTelegramId(ctx.from.id);
      if (user) {
        const { data } = await getActiveSprints(user.id);
        activeSprints = data || [];
      }
    } catch (e) {
      activeSprints = [];
    }
  }
  const messages = formatPlanMessages(items, d, activeSprints);

  if (messages.length === 0) {
    await ctx.reply('📋 На сегодня задач нет.\n\nНажмите "📋 Добавить задачи" чтобы добавить.');
    return;
  }

  for (let i = 0; i < messages.length - 1; i++) {
    await ctx.reply(messages[i]);
  }

  const lastMsg = messages[messages.length - 1];
  if (buttons) {
    await ctx.reply(lastMsg, buttons);
  } else {
    await ctx.reply(lastMsg);
  }
}

async function getSprintContext(userId) {
  const { data: sprints } = await getActiveSprints(userId);
  if (!sprints || sprints.length === 0) {
    return '⚠️ _Нет активного спринта. Задачи будут без привязки к стратегии._\n\n';
  }

  let text = '';
  for (const sprint of sprints) {
    text += `🎯 *Спринт:* ${escapeMarkdown(sprint.goal_text)}\n`;
    const initiatives = sprint.initiatives || [];
    if (initiatives.length > 0) {
      text += '*Инициативы:*\n';
      initiatives.forEach((init, i) => {
        text += `  ${i + 1}\\. ${escapeMarkdown(init.title)}\n`;
      });
    }
  }
  text += '\n';
  return text;
}

async function sendQualificationQuestion(ctx, item, initiatives) {
  const buttons = [];

  if (initiatives && initiatives.length > 0) {
    initiatives.forEach((init) => {
      buttons.push([
        Markup.button.callback(`🎯 ${init.title}`, `qualify_init_${init.id}_${item.id}`),
      ]);
    });
  }

  buttons.push([
    Markup.button.callback('🔥 Вне стратегии', `qualify_fire_${item.id}`),
  ]);

  await ctx.reply(
    `Задача: *${item.text_raw}*\n\nК какой инициативе относится?`,
    { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }
  );
}

// Запускает квалификацию для одной задачи с учётом числа спринтов
async function startQualificationForItem(ctx, item, sprints) {
  if (!sprints || sprints.length === 0) {
    await ctx.reply(
      `Задача: *${item.text_raw}*\n\nК какой инициативе относится?`,
      { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[
        Markup.button.callback('🔥 Вне стратегии', `qualify_fire_${item.id}`),
      ]]) }
    );
    return;
  }

  if (sprints.length === 1) {
    // Один спринт — пропускаем выбор спринта, сразу инициативы
    ctx.session.qualificationSelectedSprint = sprints[0];
    const initiatives = sprints[0].initiatives || [];
    ctx.session.qualificationInitiatives = initiatives;

    if (initiatives.length === 0) {
      // Нет инициатив — автоматически стратегическая
      const { updatePlanItem } = require('../../database/queries/planItems');
      await updatePlanItem(item.id, { initiative_id: null, is_strategic: true });

      const items = ctx.session?.qualificationItems || [];
      const idx = (ctx.session?.qualificationIndex || 0) + 1;
      ctx.session.qualificationIndex = idx;
      await ctx.reply(`📊 В спринт (без инициатив): ${item.text_raw}`);

      if (idx < items.length) {
        await startQualificationForItem(ctx, items[idx], sprints);
      } else {
        await finishQualification(ctx);
      }
      return;
    }

    await sendQualificationQuestion(ctx, item, initiatives);
    return;
  }

  // Несколько спринтов — шаг 1: выбор спринта
  const buttons = sprints.map((s) => [
    Markup.button.callback(
      `🎯 ${s.goal_text.length > 40 ? s.goal_text.substring(0, 40) + '…' : s.goal_text}`,
      `qualify_sprint_${s.id}_${item.id}`
    ),
  ]);
  buttons.push([Markup.button.callback('🔥 Вне стратегии', `qualify_fire_${item.id}`)]);

  await ctx.reply(
    `Задача: *${item.text_raw}*\n\nВ какой спринт?`,
    { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }
  );
}

async function finishQualification(ctx) {
  ctx.session.qualificationItems = null;
  ctx.session.qualificationIndex = null;
  ctx.session.qualificationInitiatives = null;
  ctx.session.qualificationSprints = null;
  ctx.session.qualificationSelectedSprint = null;
  ctx.session.requalifySprints = null;

  const { data: user } = await getUserByTelegramId(ctx.from.id);
  const { data: updatedItems } = await getTodayPlan(user.id);
  await ctx.reply('✅ Квалификация завершена!');
  await sendPlanMessages(ctx, updatedItems, { buttons: persistentKeyboard });
}

module.exports = { registerPlanHandlers, sendPlanMessages };
