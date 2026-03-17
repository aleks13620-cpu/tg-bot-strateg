const { Markup } = require('telegraf');
const { getUserByTelegramId } = require('../../database/queries/users');
const { getActiveSprints, getSprintById, completeSprint, updateSprintGoal, updateSprintFinancialGoal, updateSprintSfiChallenge, archiveSprint, updateSprintEndDate } = require('../../database/queries/sprints');
const { createInitiative, getInitiativesBySprint, updateInitiativeTitle, deleteInitiative } = require('../../database/queries/initiatives');
const { formatSprintCompact, formatSprintCompletionCard } = require('../../services/sprint');
const { getSprintStats } = require('../../services/analytics');
const { getStreakInfo } = require('../../services/streak');
const { getLastFinancialProgress } = require('../../database/queries/finance');
const { KEYBOARD_BUTTONS, persistentKeyboard } = require('../../utils/keyboards');
const { getTodayDate, formatDateRu } = require('../../services/planning');

function addDaysToDate(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

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

      const today = getTodayDate();
      const expiredSprints = sprints.filter((s) => s.end_date < today);
      const currentSprints = sprints.filter((s) => s.end_date >= today);

      // Show expired sprint cards first
      for (const sprint of expiredSprints) {
        const endDate = new Date(sprint.end_date + 'T00:00:00Z');
        const nowDate = new Date(today + 'T00:00:00Z');
        const daysOverdue = Math.round((nowDate - endDate) / (1000 * 60 * 60 * 24));
        const endFormatted = formatDateRu(sprint.end_date);

        const text =
          `⚠️ *Спринт просрочен на ${daysOverdue} дн.*\n` +
          `🎯 Цель: ${sprint.goal_text}\n` +
          `📅 Завершился: ${endFormatted}`;

        await ctx.reply(text, {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback('📦 Архивировать', `archive_sprint_${sprint.id}`),
              Markup.button.callback('📅 Продолжить', `extend_sprint_${sprint.id}`),
            ],
          ]),
        });
      }

      if (currentSprints.length === 0) {
        console.log(`[SPRINTS] Shown ${expiredSprints.length} expired sprints for user ${user.id}`);
        return;
      }

      const header = currentSprints.length === 1
        ? '🎯 *Активный спринт:*'
        : `🎯 *Активных спринтов: ${currentSprints.length}*`;

      await ctx.reply(header, { parse_mode: 'Markdown' });

      for (let i = 0; i < currentSprints.length; i++) {
        const sprint = currentSprints[i];
        const text = formatSprintCompact(sprint, i, currentSprints.length);

        await ctx.reply(text, {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('➕ Добавить инициативу', `add_init_${sprint.id}`)],
            [Markup.button.callback('✏️ Редактировать', `edit_sprint_${sprint.id}`)],
            [Markup.button.callback('✅ Завершить', `complete_sprint_${sprint.id}`)],
          ]),
        });
      }

      console.log(`[SPRINTS] Shown ${currentSprints.length} current + ${expiredSprints.length} expired sprints for user ${user.id}`);
    } catch (error) {
      console.error('[SPRINTS] Error:', error.message);
      await ctx.reply('Ошибка при загрузке спринтов.');
    }
  });

  // Завершение спринта
  bot.action(/^complete_sprint_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery('Завершаю спринт...');
    try {
      const sprintId = ctx.match[1];
      const { data: user } = await getUserByTelegramId(ctx.from.id);
      if (!user) return;

      // Загружаем данные спринта ДО завершения
      const { data: sprint } = await getSprintById(sprintId);

      const { error } = await completeSprint(sprintId);
      if (error) {
        await ctx.reply('Ошибка при завершении спринта.');
        return;
      }

      await ctx.editMessageText('✅ Завершаю спринт...');

      // Формируем карточку завершения
      try {
        const [stats, streakInfo, { data: lastFinance }] = await Promise.all([
          sprint ? getSprintStats(user.id, sprint.start_date, sprint.end_date, sprint.id) : Promise.resolve(null),
          getStreakInfo(user.id),
          sprint ? getLastFinancialProgress(user.id, sprintId) : Promise.resolve({ data: null }),
        ]);

        const card = formatSprintCompletionCard(sprint, stats, streakInfo.max, lastFinance);
        await ctx.reply(card, { parse_mode: 'Markdown' });
      } catch (cardError) {
        console.error('[SPRINTS] Card error:', cardError.message);
        await ctx.reply('✅ Спринт завершён!');
      }

      console.log(`[SPRINTS] Sprint ${sprintId} completed for user ${user.id}`);
    } catch (error) {
      console.error('[SPRINTS] Complete error:', error.message);
      await ctx.reply('Ошибка при завершении спринта.');
    }
  });

  // --- Редактирование спринта ---

  // Меню редактирования спринта (только UUID без подчёркиваний, иначе захватит edit_sprint_goal_/inits_/fin_/sfi_)
  bot.action(/^edit_sprint_([^_]+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    try {
      const sprintId = ctx.match[1];
      await ctx.reply(
        '✏️ *Что хотите изменить?*',
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('📝 Изменить цель', `edit_sprint_goal_${sprintId}`)],
            [Markup.button.callback('📋 Редактировать направления', `edit_sprint_inits_${sprintId}`)],
            [Markup.button.callback('💰 Изменить финцель', `edit_sprint_fin_${sprintId}`)],
            [Markup.button.callback('🏆 SFI-цель (%)', `edit_sprint_sfi_${sprintId}`)],
          ]),
        }
      );
    } catch (error) {
      console.error('[SPRINTS] Edit menu error:', error.message);
      await ctx.reply('Ошибка.');
    }
  });

  // Изменение цели спринта — запрос нового текста
  bot.action(/^edit_sprint_goal_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    try {
      const sprintId = ctx.match[1];
      ctx.session.awaitingSprintGoalEdit = sprintId;
      await ctx.reply('📝 Напишите новую цель спринта:');
    } catch (error) {
      console.error('[SPRINTS] Edit goal prompt error:', error.message);
      await ctx.reply('Ошибка.');
    }
  });

  // Изменение финансовой цели — сначала выбор валюты
  bot.action(/^edit_sprint_fin_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    try {
      const sprintId = ctx.match[1];
      await ctx.reply(
        '💰 *Финансовая цель спринта*\n\nВыберите валюту:',
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback('₽ Рубли', `fin_cur_rub_${sprintId}`),
              Markup.button.callback('$ Доллары', `fin_cur_usd_${sprintId}`),
              Markup.button.callback('€ Евро', `fin_cur_eur_${sprintId}`),
            ],
            [Markup.button.callback('🗑 Убрать финцель', `clear_sprint_fin_${sprintId}`)],
            [Markup.button.callback('❌ Отмена', 'cancel_sprint_fin_edit')],
          ]),
        }
      );
    } catch (error) {
      console.error('[SPRINTS] Edit fin goal prompt error:', error.message);
      await ctx.reply('Ошибка.');
    }
  });

  // Выбор валюты — запрашиваем сумму
  bot.action(/^fin_cur_(rub|usd|eur)_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    try {
      const currCode = ctx.match[1];
      const sprintId = ctx.match[2];
      const symbols = { rub: '₽', usd: '$', eur: '€' };
      const symbol = symbols[currCode];
      ctx.session.awaitingSprintFinAmount = { sprintId, symbol };
      await ctx.editMessageText(
        `💰 Введите сумму в ${symbol} (например: *1 500 000*):`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'cancel_sprint_fin_edit')]]),
        }
      );
    } catch (error) {
      console.error('[SPRINTS] Currency select error:', error.message);
      await ctx.reply('Ошибка.');
    }
  });

  // Очистить финансовую цель
  bot.action(/^clear_sprint_fin_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    try {
      const sprintId = ctx.match[1];
      ctx.session.awaitingSprintFinEdit = null;
      await updateSprintFinancialGoal(sprintId, null);
      await ctx.editMessageText('✅ Финансовая цель убрана.');
    } catch (error) {
      console.error('[SPRINTS] Clear fin goal error:', error.message);
      await ctx.reply('Ошибка.');
    }
  });

  // Отмена редактирования финцели
  bot.action('cancel_sprint_fin_edit', async (ctx) => {
    await ctx.answerCbQuery();
    if (ctx.session) ctx.session.awaitingSprintFinAmount = null;
    await ctx.editMessageText('❌ Отменено.');
  });

  // Установить SFI-цель спринта
  bot.action(/^edit_sprint_sfi_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    try {
      const sprintId = ctx.match[1];
      ctx.session.awaitingSprintSfiEdit = sprintId;
      await ctx.reply(
        '🏆 Введите целевой SFI для спринта (число от 1 до 100, например: 70):',
        Markup.inlineKeyboard([
          [Markup.button.callback('🗑 Убрать цель', `clear_sprint_sfi_${sprintId}`)],
          [Markup.button.callback('❌ Отмена', 'cancel_sprint_sfi_edit')],
        ])
      );
    } catch (error) {
      console.error('[SPRINTS] Edit SFI prompt error:', error.message);
      await ctx.reply('Ошибка.');
    }
  });

  // Очистить SFI-цель
  bot.action(/^clear_sprint_sfi_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    try {
      const sprintId = ctx.match[1];
      ctx.session.awaitingSprintSfiEdit = null;
      await updateSprintSfiChallenge(sprintId, null);
      await ctx.editMessageText('✅ SFI-цель убрана.');
    } catch (error) {
      console.error('[SPRINTS] Clear SFI goal error:', error.message);
      await ctx.reply('Ошибка.');
    }
  });

  // Отмена редактирования SFI-цели
  bot.action('cancel_sprint_sfi_edit', async (ctx) => {
    await ctx.answerCbQuery();
    if (ctx.session) ctx.session.awaitingSprintSfiEdit = null;
    await ctx.editMessageText('❌ Отменено.');
  });

  // Показать список инициатив для редактирования
  bot.action(/^edit_sprint_inits_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    try {
      const sprintId = ctx.match[1];
      await showInitiativesList(ctx, sprintId);
    } catch (error) {
      console.error('[SPRINTS] Edit inits error:', error.message);
      await ctx.reply('Ошибка при загрузке инициатив.');
    }
  });

  // Переименование инициативы — запрос нового названия
  bot.action(/^rename_init_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    try {
      const initId = ctx.match[1];
      ctx.session.awaitingInitRename = initId;
      await ctx.reply('✏️ Напишите новое название направления:');
    } catch (error) {
      console.error('[SPRINTS] Rename init prompt error:', error.message);
      await ctx.reply('Ошибка.');
    }
  });

  // Удаление инициативы
  bot.action(/^delete_init_([^_]+)_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    try {
      const initId = ctx.match[1];
      const sprintId = ctx.match[2];

      const { data: initiatives } = await getInitiativesBySprint(sprintId);
      if (initiatives.length <= 1) {
        await ctx.reply('❌ Нельзя удалить последнее направление. В спринте должно быть хотя бы одно.');
        return;
      }

      const { error } = await deleteInitiative(initId);
      if (error) {
        await ctx.reply('Ошибка при удалении инициативы.');
        return;
      }

      await ctx.editMessageText('🗑 Направление удалено');
      console.log(`[SPRINTS] Initiative ${initId} deleted`);
    } catch (error) {
      console.error('[SPRINTS] Delete init error:', error.message);
      await ctx.reply('Ошибка при удалении инициативы.');
    }
  });

  // Добавление инициативы — запрос названия
  bot.action(/^add_init_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    try {
      const sprintId = ctx.match[1];

      const { data: initiatives } = await getInitiativesBySprint(sprintId);
      if (initiatives.length >= 5) {
        await ctx.reply('❌ Максимум 5 направлений в спринте.');
        return;
      }

      ctx.session.awaitingInitAdd = sprintId;
      await ctx.reply('➕ Напишите название нового направления:');
    } catch (error) {
      console.error('[SPRINTS] Add init prompt error:', error.message);
      await ctx.reply('Ошибка.');
    }
  });

  // Archive an expired sprint
  bot.action(/^archive_sprint_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery('📦');
    try {
      const sprintId = ctx.match[1];
      const { data: user } = await getUserByTelegramId(ctx.from.id);
      if (!user) return;

      const { data: sprint } = await getSprintById(sprintId);
      const { error } = await archiveSprint(sprintId);
      if (error) {
        await ctx.reply('Ошибка при архивировании спринта.');
        return;
      }

      await ctx.editMessageText('📦 Архивирую спринт...');

      try {
        const [stats, streakInfo, { data: lastFinance }] = await Promise.all([
          sprint ? getSprintStats(user.id, sprint.start_date, sprint.end_date, sprint.id) : Promise.resolve(null),
          getStreakInfo(user.id),
          sprint ? getLastFinancialProgress(user.id, sprintId) : Promise.resolve({ data: null }),
        ]);

        const card = formatSprintCompletionCard(sprint, stats, streakInfo.max, lastFinance);
        await ctx.reply(card + '\n\n📦 Спринт архивирован', { parse_mode: 'Markdown' });
      } catch (cardError) {
        console.error('[SPRINTS] Archive card error:', cardError.message);
        await ctx.reply('📦 Спринт архивирован');
      }

      console.log(`[SPRINTS] Sprint ${sprintId} archived for user ${user.id}`);
    } catch (error) {
      console.error('[SPRINTS] Archive error:', error.message);
      await ctx.reply('Ошибка при архивировании спринта.');
    }
  });

  // Extend an expired sprint — show duration options
  bot.action(/^extend_sprint_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    try {
      const sprintId = ctx.match[1];
      await ctx.editMessageReplyMarkup(
        Markup.inlineKeyboard([
          [
            Markup.button.callback('+7 дн', `extend_days_7_${sprintId}`),
            Markup.button.callback('+14 дн', `extend_days_14_${sprintId}`),
            Markup.button.callback('+30 дн', `extend_days_30_${sprintId}`),
          ],
        ]).reply_markup
      );
    } catch (error) {
      console.error('[SPRINTS] Extend prompt error:', error.message);
      await ctx.reply('Ошибка.');
    }
  });

  // Apply extension days
  bot.action(/^extend_days_(\d+)_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery('📅');
    try {
      const days = parseInt(ctx.match[1], 10);
      const sprintId = ctx.match[2];

      const { data: sprint } = await getSprintById(sprintId);
      if (!sprint) {
        await ctx.reply('Спринт не найден.');
        return;
      }

      const newEndDate = addDaysToDate(sprint.end_date, days);
      const { error } = await updateSprintEndDate(sprintId, newEndDate);
      if (error) {
        await ctx.reply('Ошибка при продлении спринта.');
        return;
      }

      await ctx.editMessageText(`✅ Спринт продлён до ${formatDateRu(newEndDate)}`);
      console.log(`[SPRINTS] Sprint ${sprintId} extended by ${days} days to ${newEndDate}`);
    } catch (error) {
      console.error('[SPRINTS] Extend days error:', error.message);
      await ctx.reply('Ошибка при продлении спринта.');
    }
  });

  // --- Текстовый обработчик для ввода целей и инициатив ---
  bot.on('text', async (ctx, next) => {
    if (ctx.message.text.startsWith('/')) return next();
    if (KEYBOARD_BUTTONS.includes(ctx.message.text)) {
      ctx.session.awaitingSprintGoalEdit = null;
      ctx.session.awaitingSprintFinAmount = null;
      ctx.session.awaitingSprintSfiEdit = null;
      ctx.session.awaitingInitRename = null;
      ctx.session.awaitingInitAdd = null;
      return next();
    }

    // Установка SFI-цели спринта
    if (ctx.session?.awaitingSprintSfiEdit) {
      const sprintId = ctx.session.awaitingSprintSfiEdit;
      ctx.session.awaitingSprintSfiEdit = null;
      try {
        const value = parseInt(ctx.message.text.trim(), 10);
        if (isNaN(value) || value < 1 || value > 100) {
          await ctx.reply('❌ Введите число от 1 до 100.');
          ctx.session.awaitingSprintSfiEdit = sprintId;
          return;
        }
        const { error } = await updateSprintSfiChallenge(sprintId, value);
        if (error) {
          await ctx.reply('Ошибка при обновлении SFI-цели.');
          return;
        }
        await ctx.reply(`✅ SFI-цель установлена: *${value}%*`, { parse_mode: 'Markdown', ...persistentKeyboard });
        console.log(`[SPRINTS] Sprint ${sprintId} sfi_challenge set to ${value}`);
      } catch (error) {
        console.error('[SPRINTS] Update SFI goal error:', error.message);
        await ctx.reply('Ошибка при обновлении SFI-цели.');
      }
      return;
    }

    // Изменение финансовой цели спринта (с выбором валюты)
    if (ctx.session?.awaitingSprintFinAmount) {
      const { sprintId, symbol } = ctx.session.awaitingSprintFinAmount;
      ctx.session.awaitingSprintFinAmount = null;
      try {
        const raw = ctx.message.text.trim().replace(/[\s,]/g, '');
        const value = parseFloat(raw);
        if (isNaN(value) || value <= 0) {
          await ctx.reply(`❌ Введите положительное число, например: *1 500 000*`, { parse_mode: 'Markdown' });
          ctx.session.awaitingSprintFinAmount = { sprintId, symbol };
          return;
        }
        const formatted = Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
        const finGoal = `${formatted} ${symbol}`;
        const { error } = await updateSprintFinancialGoal(sprintId, finGoal);
        if (error) {
          await ctx.reply('Ошибка при обновлении финансовой цели.');
          return;
        }
        await ctx.reply(`✅ Финансовая цель: *${finGoal}*`, { parse_mode: 'Markdown', ...persistentKeyboard });
        console.log(`[SPRINTS] Sprint ${sprintId} financial goal set to ${finGoal}`);
      } catch (error) {
        console.error('[SPRINTS] Update fin goal error:', error.message);
        await ctx.reply('Ошибка при обновлении финансовой цели.');
      }
      return;
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
        await ctx.reply(`✅ Направление переименовано:\n📌 ${newTitle}`, persistentKeyboard);
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
        await ctx.reply(`✅ Направление добавлено:\n📌 ${title}`, persistentKeyboard);
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

  await ctx.reply('📌 *Направления спринта:*', { parse_mode: 'Markdown' });

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
      `Направлений: ${initiatives.length}/5`,
      Markup.inlineKeyboard([
        [Markup.button.callback('➕ Добавить направление', `add_init_${sprintId}`)],
      ])
    );
  }
}

module.exports = { registerSprintsHandlers };
