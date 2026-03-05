const { Markup } = require('telegraf');
const { getUserByTelegramId, checkHintAndMark } = require('../../database/queries/users');
const { getActiveSprints, getSprintById } = require('../../database/queries/sprints');
const { getPlanItemById } = require('../../database/queries/planItems');
const { addDayPlanForDate, getTodayPlan, getPlanForDate, formatPlanMessages, getTodayDate, parseDateInput, formatDateRu } = require('../../services/planning');
const { escapeMarkdown, persistentKeyboard, KEYBOARD_BUTTONS, buildDatePickerKeyboard } = require('../../utils/keyboards');

function registerPlanHandlers(bot) {
  // Reply keyboard: кнопка "Добавить задачи" — показываем дейтпикер
  bot.hears('📋 Добавить задачи', async (ctx) => {
    try {
      const { data: user } = await getUserByTelegramId(ctx.from.id);
      if (!user) {
        await ctx.reply('Профиль не найден. Используйте /start.');
        return;
      }
      const sprintContext = await getSprintContext(user.id);
      await ctx.reply(
        sprintContext + '📅 На какую дату добавить задачи?',
        { parse_mode: 'Markdown', ...buildDatePickerKeyboard(14) }
      );

      // Подсказка: первое использование /plan
      const showHint = await checkHintAndMark(user.id, 'hint_first_plan');
      if (showHint) {
        await ctx.reply(
          '💡 *Подсказка:*\nПривяжите задачи к направлениям спринта — они зачтутся как стратегические.\n' +
          'SFI = доля стратегических задач среди выполненных. Цель: *70%+*',
          { parse_mode: 'Markdown' }
        );
      }
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

  // Кнопка "Добавить задачи" к существующему плану — показываем дейтпикер
  bot.action('action_add_tasks', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('📅 На какую дату добавить задачи?', buildDatePickerKeyboard(14));
  });

  // Выбор даты из дейтпикера (для добавления задач и пересланных сообщений)
  bot.action(/^pick_date_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const dateParam = ctx.match[1];

    if (dateParam === 'manual') {
      ctx.session.awaitingDateInput = true;
      await ctx.reply('Введите дату в формате ДД.ММ (например, 15.03):');
      return;
    }

    // dateParam = 'YYYY-MM-DD'
    ctx.session.selectedDate = dateParam;
    const dateLabel = formatDateRu(dateParam);

    // Если есть ожидающее пересланное сообщение — создаём задачу
    if (ctx.session.pendingForwardText) {
      const text = ctx.session.pendingForwardText;
      ctx.session.pendingForwardText = null;

      try {
        const { data: user } = await getUserByTelegramId(ctx.from.id);
        const { createPlanItems } = require('../../database/queries/planItems');
        const { data: items, error } = await createPlanItems(user.id, dateParam, [text]);
        if (error || !items || items.length === 0) {
          await ctx.reply('Ошибка при добавлении задачи.');
          return;
        }
        const { data: sprints } = await getActiveSprints(user.id);
        ctx.session.qualificationItems = items;
        ctx.session.qualificationIndex = 0;
        ctx.session.qualificationSprints = sprints;
        ctx.session.qualificationSelectedSprint = null;
        ctx.session.qualificationInitiatives = [];
        ctx.session.qualificationKeyTaskSet = false;
        ctx.session.qualificationMessageId = null;
        ctx.session.qualificationDate = dateParam;
        await ctx.reply(`✅ Задача на ${dateLabel}:\n"${text}"\n\nКвалифицируем:`);
        await startQualificationForItem(ctx, items[0], sprints);
      } catch (error) {
        console.error('[PLAN] Forward date pick error:', error.message);
        await ctx.reply('Ошибка при добавлении задачи.');
      }
      return;
    }

    // Обычное добавление задач
    ctx.session.awaitingPlanInput = true;
    await ctx.reply(`📝 Напишите задачи на ${dateLabel} — каждая с новой строки или через запятую:`);
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

      // Сохраняем текст и показываем дейтпикер
      ctx.session.pendingForwardText = text;
      const preview = text.length > 100 ? text.slice(0, 100) + '…' : text;
      await ctx.reply(
        `📌 Добавить как задачу:\n"${preview}"\n\n📅 На какую дату?`,
        buildDatePickerKeyboard(14)
      );
    } catch (error) {
      console.error('[PLAN] Forwarded message error:', error.message);
      await ctx.reply('Ошибка при обработке пересланного сообщения.');
    }
  });

  // Обработка текстового ввода: ввод даты вручную или список задач
  bot.on('text', async (ctx, next) => {
    if (ctx.message.text.startsWith('/')) return next();
    if (KEYBOARD_BUTTONS.includes(ctx.message.text)) {
      ctx.session.awaitingPlanInput = false;
      ctx.session.awaitingDateInput = false;
      ctx.session.pendingForwardText = null;
      return next();
    }

    // Ввод даты вручную
    if (ctx.session?.awaitingDateInput) {
      ctx.session.awaitingDateInput = false;
      const iso = parseDateInput(ctx.message.text);
      if (!iso) {
        await ctx.reply('Неверная дата или она в прошлом. Введите в формате ДД.ММ (например, 15.03):');
        ctx.session.awaitingDateInput = true;
        return;
      }
      ctx.session.selectedDate = iso;
      const dateLabel = formatDateRu(iso);

      // Если есть ожидающее пересланное сообщение
      if (ctx.session.pendingForwardText) {
        const text = ctx.session.pendingForwardText;
        ctx.session.pendingForwardText = null;
        try {
          const { data: user } = await getUserByTelegramId(ctx.from.id);
          const { createPlanItems } = require('../../database/queries/planItems');
          const { data: items, error } = await createPlanItems(user.id, iso, [text]);
          if (error || !items || items.length === 0) {
            await ctx.reply('Ошибка при добавлении задачи.');
            return;
          }
          const { data: sprints } = await getActiveSprints(user.id);
          ctx.session.qualificationItems = items;
          ctx.session.qualificationIndex = 0;
          ctx.session.qualificationSprints = sprints;
          ctx.session.qualificationSelectedSprint = null;
          ctx.session.qualificationInitiatives = [];
          ctx.session.qualificationKeyTaskSet = false;
          ctx.session.qualificationMessageId = null;
          ctx.session.qualificationDate = iso;
          await ctx.reply(`✅ Задача на ${dateLabel}:\n"${text}"\n\nКвалифицируем:`);
          await startQualificationForItem(ctx, items[0], sprints);
        } catch (err) {
          console.error('[PLAN] Forward manual date error:', err.message);
          await ctx.reply('Ошибка при добавлении задачи.');
        }
        return;
      }

      ctx.session.awaitingPlanInput = true;
      await ctx.reply(`📝 Напишите задачи на ${dateLabel} — каждая с новой строки или через запятую:`);
      return;
    }

    if (!ctx.session?.awaitingPlanInput) return next();

    try {
      const { data: user } = await getUserByTelegramId(ctx.from.id);
      if (!user) {
        await ctx.reply('Профиль не найден. Используйте /start.');
        return;
      }

      ctx.session.awaitingPlanInput = false;
      const date = ctx.session.selectedDate || getTodayDate();
      ctx.session.qualificationDate = date;
      ctx.session.selectedDate = null;

      const { data: items, error } = await addDayPlanForDate(user.id, ctx.message.text, date);

      if (error) {
        await ctx.reply('Ошибка: ' + error.message);
        return;
      }

      console.log(`[PLAN] User ${user.id} added ${items.length} tasks for ${date}`);

      const { data: sprints } = await getActiveSprints(user.id);
      ctx.session.qualificationItems = items;
      ctx.session.qualificationIndex = 0;
      ctx.session.qualificationSprints = sprints;
      ctx.session.qualificationSelectedSprint = null;
      ctx.session.qualificationInitiatives = [];
      ctx.session.qualificationKeyTaskSet = false;
      ctx.session.qualificationMessageId = null;

      await ctx.reply(`✅ Добавлено задач: ${items.length} на ${formatDateRu(date)}\n\nТеперь квалифицируем каждую задачу:`);
      await startQualificationForItem(ctx, items[0], sprints);
    } catch (error) {
      console.error('[PLAN] Error adding tasks:', error.message);
      await ctx.reply('Ошибка при добавлении задач.');
    }
  });

  // Квалификация шаг 1: выбор спринта
  bot.action(/^qualify_sprint_([^_]+)_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    try {
      const sprintId = ctx.match[1];
      const itemId = ctx.match[2];

      // Fetch from DB — не полагаемся на сессию (serverless теряет её между запросами)
      const { data: sprint } = await getSprintById(sprintId);
      if (!sprint) {
        await ctx.reply('Спринт не найден. Попробуйте ещё раз.');
        return;
      }

      ctx.session.qualificationSelectedSprint = sprint;
      const initiatives = sprint.initiatives || [];
      ctx.session.qualificationInitiatives = initiatives;

      const { data: item } = await getPlanItemById(itemId);

      await ctx.editMessageText(`🎯 Спринт выбран: ${sprint.goal_text}`);

      if (initiatives.length === 0) {
        const { updatePlanItem } = require('../../database/queries/planItems');
        await updatePlanItem(itemId, { initiative_id: null, is_strategic: true });
        await askKeyTaskQuestion(ctx, item || { id: itemId, text_raw: '' });
      } else {
        await sendQualificationQuestion(ctx, item || { id: itemId, text_raw: '' }, initiatives);
      }
    } catch (error) {
      console.error('[QUALIFY] Sprint select error:', error.message);
      await ctx.reply('Ошибка при выборе спринта.');
    }
  });

  // Квалификация шаг 2: привязка к инициативе
  bot.action(/^qualify_init_([^_]+)_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    try {
      const initiativeId = ctx.match[1];
      const itemId = ctx.match[2];

      const { updatePlanItem } = require('../../database/queries/planItems');
      await updatePlanItem(itemId, { initiative_id: initiativeId, is_strategic: true });

      const initiatives = ctx.session?.qualificationInitiatives || [];
      const initiative = initiatives.find((i) => String(i.id) === initiativeId);
      const label = initiative ? `🎯 ${initiative.title}` : '📊 По стратегии';

      const { data: item } = await getPlanItemById(itemId);
      const itemText = item?.text_raw || '';
      await ctx.editMessageText(`${label}: ${itemText}`);

      await askKeyTaskQuestion(ctx, item || { id: itemId, text_raw: itemText });
    } catch (error) {
      console.error('[QUALIFY] Error:', error.message);
      await ctx.reply('Ошибка при квалификации задачи.');
    }
  });

  // Квалификация: вне стратегии
  bot.action(/^qualify_fire_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    try {
      const itemId = ctx.match[1];

      const { updatePlanItem } = require('../../database/queries/planItems');
      await updatePlanItem(itemId, { initiative_id: null, is_strategic: false });

      const { data: item } = await getPlanItemById(itemId);
      const itemText = item?.text_raw || '';
      await ctx.editMessageText(`🔥 Вне стратегии: ${itemText}`);

      await askKeyTaskQuestion(ctx, item || { id: itemId, text_raw: itemText });
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
  bot.action(/^action_delete_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery('🗑');
    try {
      const itemId = ctx.match[1];
      const { deletePlanItem } = require('../../database/queries/planItems');
      await deletePlanItem(itemId);
      await ctx.editMessageText('🗑 Задача удалена');
    } catch (error) {
      console.error('[PLAN] Delete error:', error.message);
      await ctx.reply('Ошибка при удалении задачи.');
    }
  });

  // Переквалификация задачи — показать выбор спринта или инициатив
  bot.action(/^action_requalify_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    try {
      const itemId = ctx.match[1];
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
  bot.action(/^requalify_sprint_([^_]+)_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    try {
      const sprintId = ctx.match[1];
      const itemId = ctx.match[2];
      const sprints = ctx.session?.requalifySprints || [];
      const sprint = sprints.find((s) => String(s.id) === sprintId);
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
  bot.action(/^requalify_init_([^_]+)_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    try {
      const initiativeId = ctx.match[1];
      const itemId = ctx.match[2];

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
  bot.action(/^requalify_fire_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    try {
      const itemId = ctx.match[1];
      const { updatePlanItem } = require('../../database/queries/planItems');
      await updatePlanItem(itemId, { initiative_id: null, is_strategic: false });
      await ctx.editMessageText('🔥 Вне стратегии ✅');
    } catch (error) {
      console.error('[PLAN] Requalify error:', error.message);
      await ctx.reply('Ошибка.');
    }
  });

  // Задача дня: да
  bot.action(/^key_task_yes_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery('⭐');
    try {
      const itemId = ctx.match[1];
      const { updatePlanItem } = require('../../database/queries/planItems');
      await updatePlanItem(itemId, { is_key_task: true });
      ctx.session.qualificationKeyTaskSet = true;
      await ctx.editMessageText('⭐ Задача дня!');
      await advanceToNextQualification(ctx);
    } catch (error) {
      console.error('[PLAN] Key task yes error:', error.message);
    }
  });

  // Задача дня: нет
  bot.action(/^key_task_no_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    try {
      await ctx.editMessageText('Ок');
      await advanceToNextQualification(ctx);
    } catch (error) {
      console.error('[PLAN] Key task no error:', error.message);
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
      text += '*Направления:*\n';
      initiatives.forEach((init, i) => {
        text += `  ${i + 1}\\. ${escapeMarkdown(init.title)}\n`;
      });
    }
  }
  text += '\n';
  return text;
}

// Шапка с прогрессом и контекстом спринта для qualification-сообщений
function buildQualificationHeader(ctx) {
  const items = ctx.session?.qualificationItems || [];
  const idx = ctx.session?.qualificationIndex || 0;
  const sprint = ctx.session?.qualificationSelectedSprint;

  const parts = [];
  if (items.length > 1) {
    parts.push(`📋 Задача ${idx + 1}/${items.length}`);
  }
  if (sprint) {
    const name = sprint.goal_text.length > 35
      ? sprint.goal_text.slice(0, 35) + '…'
      : sprint.goal_text;
    parts.push(`🎯 ${name}`);
  }
  return parts.length > 0 ? parts.join(' · ') + '\n\n' : '';
}

// Редактирует сохранённое сообщение квалификации или создаёт новое (и сохраняет message_id)
async function editOrReplyQualification(ctx, text, opts) {
  const msgId = ctx.session.qualificationMessageId;
  if (msgId) {
    try {
      await ctx.telegram.editMessageText(ctx.chat.id, msgId, undefined, text, opts);
      return;
    } catch {
      // fallback to reply if message too old / deleted
    }
  }
  const sent = await ctx.reply(text, opts);
  ctx.session.qualificationMessageId = sent.message_id;
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

  const header = buildQualificationHeader(ctx);
  await editOrReplyQualification(
    ctx,
    `${header}Задача: *${item.text_raw}*\n\nК какой инициативе относится?`,
    { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }
  );
}

// Запускает квалификацию для одной задачи с учётом числа спринтов
async function startQualificationForItem(ctx, item, sprints) {
  if (!sprints || sprints.length === 0) {
    const header = buildQualificationHeader(ctx);
    await editOrReplyQualification(
      ctx,
      `${header}Задача: *${item.text_raw}*\n\nК какой инициативе относится?`,
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
      await askKeyTaskQuestion(ctx, item);
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

  const header = buildQualificationHeader(ctx);
  await editOrReplyQualification(
    ctx,
    `${header}Задача: *${item.text_raw}*\n\nВ какой спринт?`,
    { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }
  );
}

async function advanceToNextQualification(ctx) {
  const items = ctx.session?.qualificationItems || [];
  const sprints = ctx.session?.qualificationSprints || [];
  const idx = (ctx.session?.qualificationIndex || 0) + 1;
  ctx.session.qualificationIndex = idx;

  if (idx < items.length) {
    await startQualificationForItem(ctx, items[idx], sprints);
  } else {
    await finishQualification(ctx);
  }
}

async function askKeyTaskQuestion(ctx, item) {
  if (!item) {
    await advanceToNextQualification(ctx);
    return;
  }
  if (ctx.session.qualificationKeyTaskSet) {
    await advanceToNextQualification(ctx);
    return;
  }

  const header = buildQualificationHeader(ctx);
  await editOrReplyQualification(
    ctx,
    `${header}⭐ Сделать задачей дня?\n_${item.text_raw}_`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('⭐ Да', `key_task_yes_${item.id}`),
          Markup.button.callback('Нет', `key_task_no_${item.id}`),
        ],
      ]),
    }
  );
}

async function finishQualification(ctx) {
  const date = ctx.session.qualificationDate || getTodayDate();

  ctx.session.qualificationItems = null;
  ctx.session.qualificationIndex = null;
  ctx.session.qualificationInitiatives = null;
  ctx.session.qualificationSprints = null;
  ctx.session.qualificationSelectedSprint = null;
  ctx.session.qualificationDate = null;
  ctx.session.requalifySprints = null;
  ctx.session.qualificationKeyTaskSet = null;
  ctx.session.qualificationMessageId = null;

  const { data: user } = await getUserByTelegramId(ctx.from.id);
  const { data: updatedItems } = await getPlanForDate(user.id, date);
  await ctx.reply('✅ Квалификация завершена!');
  await sendPlanMessages(ctx, updatedItems, { buttons: persistentKeyboard, date });

  // Подсказка: первая квалификация задач
  const showHint = await checkHintAndMark(user.id, 'hint_first_qualify');
  if (showHint) {
    await ctx.reply(
      '💡 *SFI — Strategic Focus Index*\n' +
      'Доля выполненных задач, связанных с направлениями спринта.\n' +
      'Цель: *70%+* — работа над главным, а не текучкой.',
      { parse_mode: 'Markdown' }
    );
  }
}

module.exports = { registerPlanHandlers, sendPlanMessages };
