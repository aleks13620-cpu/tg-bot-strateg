const { Markup } = require('telegraf');
const { getUserByTelegramId } = require('../../database/queries/users');
const { getActiveSprints, completeSprint, updateSprintGoal } = require('../../database/queries/sprints');
const { createInitiative, getInitiativesBySprint, updateInitiativeTitle, deleteInitiative } = require('../../database/queries/initiatives');
const { formatSprintCompact } = require('../../services/sprint');
const { KEYBOARD_BUTTONS, persistentKeyboard } = require('../../utils/keyboards');

function registerSprintsHandlers(bot) {
  // Reply keyboard: кнопка "🎯 Спринты"
  bot.hears('🎯 Спринты', async (ctx) => {
    try {
      const { data: user } = await getUserByTelegramId(ctx.from.id);
      if (!user) {
        await ctx.reply('Профиль не найден. Используйте /start.');
        return;
      }

      const { data: sprints } = await getActiveSprints(user.id);

      if (sprints.length === 0) {
        await ctx.reply(
          '📋 У вас нет активных спринтов.\n\nХотите создать?',
          Markup.inlineKeyboard([
            [Markup.button.callback('🚀 Создать спринт', 'action_new_sprint')],
          ])
        );
        return;
      }

      const header = sprints.length === 1
        ? '🎯 *Активный спринт:*'
        : `🎯 *Активных спринтов: ${sprints.length}*`;

      await ctx.reply(header, { parse_mode: 'Markdown' });

      for (let i = 0; i < sprints.length; i++) {
        const sprint = sprints[i];
        const text = formatSprintCompact(sprint, i, sprints.length);

        await ctx.reply(text, {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('✏️ Редактировать', `edit_sprint_${sprint.id}`)],
            [Markup.button.callback('✅ Завершить', `complete_sprint_${sprint.id}`)],
          ]),
        });
      }

      console.log(`[SPRINTS] Shown ${sprints.length} sprints for user ${user.id}`);
    } catch (error) {
      console.error('[SPRINTS] Error:', error.message);
      await ctx.reply('Ошибка при загрузке спринтов.');
    }
  });

  // Завершение спринта
  bot.action(/^complete_sprint_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery('Завершаю спринт...');
    try {
      const sprintId = parseInt(ctx.match[1]);
      const { error } = await completeSprint(sprintId);

      if (error) {
        await ctx.reply('Ошибка при завершении спринта.');
        return;
      }

      await ctx.editMessageText('✅ Спринт завершён!');
      console.log(`[SPRINTS] Sprint ${sprintId} completed`);
    } catch (error) {
      console.error('[SPRINTS] Complete error:', error.message);
      await ctx.reply('Ошибка при завершении спринта.');
    }
  });

  // --- Редактирование спринта ---

  // Меню редактирования спринта
  bot.action(/^edit_sprint_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    try {
      const sprintId = parseInt(ctx.match[1]);
      await ctx.reply(
        '✏️ *Что хотите изменить?*',
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('📝 Изменить цель', `edit_sprint_goal_${sprintId}`)],
            [Markup.button.callback('📋 Редактировать инициативы', `edit_sprint_inits_${sprintId}`)],
          ]),
        }
      );
    } catch (error) {
      console.error('[SPRINTS] Edit menu error:', error.message);
      await ctx.reply('Ошибка.');
    }
  });

  // Изменение цели спринта — запрос нового текста
  bot.action(/^edit_sprint_goal_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    try {
      const sprintId = parseInt(ctx.match[1]);
      ctx.session.awaitingSprintGoalEdit = sprintId;
      await ctx.reply('📝 Напишите новую цель спринта:');
    } catch (error) {
      console.error('[SPRINTS] Edit goal prompt error:', error.message);
      await ctx.reply('Ошибка.');
    }
  });

  // Показать список инициатив для редактирования
  bot.action(/^edit_sprint_inits_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    try {
      const sprintId = parseInt(ctx.match[1]);
      await showInitiativesList(ctx, sprintId);
    } catch (error) {
      console.error('[SPRINTS] Edit inits error:', error.message);
      await ctx.reply('Ошибка при загрузке инициатив.');
    }
  });

  // Переименование инициативы — запрос нового названия
  bot.action(/^rename_init_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    try {
      const initId = parseInt(ctx.match[1]);
      ctx.session.awaitingInitRename = initId;
      await ctx.reply('✏️ Напишите новое название инициативы:');
    } catch (error) {
      console.error('[SPRINTS] Rename init prompt error:', error.message);
      await ctx.reply('Ошибка.');
    }
  });

  // Удаление инициативы
  bot.action(/^delete_init_(\d+)_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    try {
      const initId = parseInt(ctx.match[1]);
      const sprintId = parseInt(ctx.match[2]);

      const { data: initiatives } = await getInitiativesBySprint(sprintId);
      if (initiatives.length <= 1) {
        await ctx.reply('❌ Нельзя удалить последнюю инициативу. В спринте должна быть хотя бы одна.');
        return;
      }

      const { error } = await deleteInitiative(initId);
      if (error) {
        await ctx.reply('Ошибка при удалении инициативы.');
        return;
      }

      await ctx.editMessageText('🗑 Инициатива удалена');
      console.log(`[SPRINTS] Initiative ${initId} deleted`);
    } catch (error) {
      console.error('[SPRINTS] Delete init error:', error.message);
      await ctx.reply('Ошибка при удалении инициативы.');
    }
  });

  // Добавление инициативы — запрос названия
  bot.action(/^add_init_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    try {
      const sprintId = parseInt(ctx.match[1]);

      const { data: initiatives } = await getInitiativesBySprint(sprintId);
      if (initiatives.length >= 5) {
        await ctx.reply('❌ Максимум 5 инициатив в спринте.');
        return;
      }

      ctx.session.awaitingInitAdd = sprintId;
      await ctx.reply('➕ Напишите название новой инициативы:');
    } catch (error) {
      console.error('[SPRINTS] Add init prompt error:', error.message);
      await ctx.reply('Ошибка.');
    }
  });

  // --- Текстовый обработчик для ввода целей и инициатив ---
  bot.on('text', async (ctx, next) => {
    if (ctx.message.text.startsWith('/')) return next();
    if (KEYBOARD_BUTTONS.includes(ctx.message.text)) {
      ctx.session.awaitingSprintGoalEdit = null;
      ctx.session.awaitingInitRename = null;
      ctx.session.awaitingInitAdd = null;
      return next();
    }

    // Изменение цели спринта
    if (ctx.session?.awaitingSprintGoalEdit) {
      const sprintId = ctx.session.awaitingSprintGoalEdit;
      ctx.session.awaitingSprintGoalEdit = null;
      try {
        const newGoal = ctx.message.text.trim();
        const { error } = await updateSprintGoal(sprintId, newGoal);
        if (error) {
          await ctx.reply('Ошибка при обновлении цели.');
          return;
        }
        await ctx.reply(`✅ Цель спринта обновлена:\n🎯 ${newGoal}`, persistentKeyboard);
        console.log(`[SPRINTS] Sprint ${sprintId} goal updated`);
      } catch (error) {
        console.error('[SPRINTS] Update goal error:', error.message);
        await ctx.reply('Ошибка при обновлении цели.');
      }
      return;
    }

    // Переименование инициативы
    if (ctx.session?.awaitingInitRename) {
      const initId = ctx.session.awaitingInitRename;
      ctx.session.awaitingInitRename = null;
      try {
        const newTitle = ctx.message.text.trim();
        const { error } = await updateInitiativeTitle(initId, newTitle);
        if (error) {
          await ctx.reply('Ошибка при переименовании инициативы.');
          return;
        }
        await ctx.reply(`✅ Инициатива переименована:\n📌 ${newTitle}`, persistentKeyboard);
        console.log(`[SPRINTS] Initiative ${initId} renamed`);
      } catch (error) {
        console.error('[SPRINTS] Rename init error:', error.message);
        await ctx.reply('Ошибка при переименовании инициативы.');
      }
      return;
    }

    // Добавление новой инициативы
    if (ctx.session?.awaitingInitAdd) {
      const sprintId = ctx.session.awaitingInitAdd;
      ctx.session.awaitingInitAdd = null;
      try {
        const title = ctx.message.text.trim();
        const { error } = await createInitiative(sprintId, title);
        if (error) {
          await ctx.reply('Ошибка при добавлении инициативы.');
          return;
        }
        await ctx.reply(`✅ Инициатива добавлена:\n📌 ${title}`, persistentKeyboard);
        console.log(`[SPRINTS] New initiative added to sprint ${sprintId}`);
      } catch (error) {
        console.error('[SPRINTS] Add init error:', error.message);
        await ctx.reply('Ошибка при добавлении инициативы.');
      }
      return;
    }

    return next();
  });
}

// Показать список инициатив с кнопками редактирования
async function showInitiativesList(ctx, sprintId) {
  const { data: initiatives } = await getInitiativesBySprint(sprintId);

  if (initiatives.length === 0) {
    await ctx.reply('📋 Инициатив нет.');
    return;
  }

  await ctx.reply('📋 *Инициативы спринта:*', { parse_mode: 'Markdown' });

  for (const init of initiatives) {
    const buttons = [
      [Markup.button.callback('✏️ Переименовать', `rename_init_${init.id}`)],
    ];
    if (initiatives.length > 1) {
      buttons.push([Markup.button.callback('🗑 Удалить', `delete_init_${init.id}_${sprintId}`)]);
    }
    await ctx.reply(`📌 ${init.title}`, Markup.inlineKeyboard(buttons));
  }

  if (initiatives.length < 5) {
    await ctx.reply(
      `Инициатив: ${initiatives.length}/5`,
      Markup.inlineKeyboard([
        [Markup.button.callback('➕ Добавить инициативу', `add_init_${sprintId}`)],
      ])
    );
  }
}

module.exports = { registerSprintsHandlers };
