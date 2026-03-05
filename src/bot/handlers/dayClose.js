const { Markup } = require('telegraf');
const { getUserByTelegramId } = require('../../database/queries/users');
const { getPlanItemsByDate, updatePlanItem, createPlanItemsWithDetails } = require('../../database/queries/planItems');
const { getDayStats, formatDayStats } = require('../../services/analytics');
const { getTodayDate, getTomorrowDate, formatDateRu } = require('../../services/planning');
const { generateCoaching } = require('../../services/coaching/simpleCoaching');
const { saveCoachingAnswer, getLastUnansweredQuestion } = require('../../database/queries/coaching');
const { persistentKeyboard, KEYBOARD_BUTTONS } = require('../../utils/keyboards');
const { sendPlanMessages } = require('./plan');
const { updateStreak } = require('../../services/streak');

function registerDayCloseHandlers(bot) {
  // Reply keyboard: кнопка "Закрыть день"
  bot.hears('🌙 Закрыть день', async (ctx) => {
    await startDayClose(ctx);
  });

  // Команда /close — закрытие дня
  bot.command('close', async (ctx) => {
    await startDayClose(ctx);
  });

  // Кнопка закрытия дня
  bot.action('action_close_day', async (ctx) => {
    await ctx.answerCbQuery();
    await startDayClose(ctx);
  });

  // Отметка задачи как выполненной
  bot.action(/^dayclose_done_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery('✅');
    await handleTaskStatus(ctx, ctx.match[1], 'done');
  });

  // Отметка задачи как пропущенной
  bot.action(/^dayclose_skip_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery('⏭');
    await handleTaskStatus(ctx, ctx.match[1], 'skipped');
  });

  // Показать итоги после отметки всех задач
  bot.action('dayclose_summary', async (ctx) => {
    await ctx.answerCbQuery();
    try {
      const { data: user } = await getUserByTelegramId(ctx.from.id);
      if (!user) return;

      const date = getTodayDate();
      const stats = await getDayStats(user.id, date);

      // Обновляем стрик если есть выполненные задачи
      let streakResult = null;
      if (stats && stats.done > 0) {
        streakResult = await updateStreak(user.id, date);
      }

      let summaryText = formatDayStats(stats);

      // Маленькие победы
      const winMsg = getSmallWinMessage(streakResult, stats);
      if (winMsg) summaryText += `\n\n${winMsg}`;

      await ctx.reply(summaryText, { parse_mode: 'Markdown' });

      // Проверяем skipped задачи для переноса
      const { data: items } = await getPlanItemsByDate(user.id, date);
      const skippedItems = items.filter((i) => i.status === 'skipped');

      if (skippedItems.length > 0) {
        let msg = `📋 Незавершённые задачи (${skippedItems.length}):\n\n`;
        skippedItems.forEach((item, i) => {
          const tag = item.initiative ? ` [${item.initiative.title}]` : '';
          msg += `${i + 1}. ${item.text_raw}${tag}\n`;
        });
        const tomorrow = getTomorrowDate();
        msg += `\nПеренести на ${formatDateRu(tomorrow)}?`;

        // Сохраняем в сессию
        ctx.session.carryOverItems = skippedItems.map((item) => ({
          id: item.id,
          text_raw: item.text_raw,
          initiative_id: item.initiative_id,
          is_strategic: item.is_strategic,
        }));

        await ctx.reply(msg, Markup.inlineKeyboard([
          [Markup.button.callback('✅ Перенести все', 'dayclose_carry_all')],
          [Markup.button.callback('⏭ Не переносить', 'dayclose_carry_skip')],
        ]));
      } else {
        await showCoaching(ctx, user.id, date);
      }
    } catch (error) {
      console.error('[DAYCLOSE] Summary error:', error.message);
      await ctx.reply('Ошибка при формировании итогов.');
    }
  });

  // Перенести все задачи на завтра
  bot.action('dayclose_carry_all', async (ctx) => {
    await ctx.answerCbQuery('Переношу...');
    try {
      const { data: user } = await getUserByTelegramId(ctx.from.id);
      if (!user) return;

      const date = getTodayDate();
      const { data: allItems } = await getPlanItemsByDate(user.id, date);
      const skipped = allItems.filter((i) => i.status === 'skipped');
      const carryItems = skipped.map((item) => ({
        id: item.id,
        text_raw: item.text_raw,
        initiative_id: item.initiative_id,
        is_strategic: item.is_strategic,
      }));

      if (carryItems.length === 0) {
        await ctx.editMessageText('Нет задач для переноса.');
        return;
      }

      const tomorrow = getTomorrowDate();

      // Создаём копии на завтра
      await createPlanItemsWithDetails(user.id, tomorrow, carryItems);

      // Обновляем оригиналы: status → moved
      for (const item of carryItems) {
        await updatePlanItem(item.id, { status: 'moved' });
      }

      ctx.session.carryOverItems = null;

      await ctx.editMessageText(`✅ Перенесено задач: ${carryItems.length} на ${formatDateRu(tomorrow)}`);

      // Показать план на завтра
      const { data: tomorrowItems } = await getPlanItemsByDate(user.id, tomorrow);
      if (tomorrowItems.length > 0) {
        await sendPlanMessages(ctx, tomorrowItems, { date: tomorrow });
      }

      // Коучинг
      await showCoaching(ctx, user.id, date);
    } catch (error) {
      console.error('[DAYCLOSE] Carry all error:', error.message);
      await ctx.reply('Ошибка при переносе задач.');
    }
  });

  // Не переносить задачи
  bot.action('dayclose_carry_skip', async (ctx) => {
    await ctx.answerCbQuery('⏭');
    try {
      ctx.session.carryOverItems = null;
      await ctx.editMessageText('⏭ Задачи не перенесены.');

      const { data: user } = await getUserByTelegramId(ctx.from.id);
      if (!user) return;

      const date = getTodayDate();
      await showCoaching(ctx, user.id, date);
    } catch (error) {
      console.error('[DAYCLOSE] Carry skip error:', error.message);
    }
  });

  // Кнопка "Ответить" на коучинговый вопрос
  bot.action(/^coaching_answer_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const questionId = parseInt(ctx.match[1]);
    ctx.session.awaitingCoachingAnswer = questionId;
    await ctx.reply('💬 Напишите ваш ответ:');
  });

  // Кнопка "Пропустить" коучинг
  bot.action('coaching_skip', async (ctx) => {
    await ctx.answerCbQuery('⏭');
    await ctx.editMessageText('⏭ Вопрос пропущен.');
    await ctx.reply('Хорошего вечера!', persistentKeyboard);
  });

  // Обработка текстового ответа на коучинг
  bot.on('text', async (ctx, next) => {
    if (ctx.message.text.startsWith('/')) return next();
    if (KEYBOARD_BUTTONS.includes(ctx.message.text)) {
      ctx.session.awaitingCoachingAnswer = null;
      return next();
    }
    if (!ctx.session?.awaitingCoachingAnswer) return next();

    try {
      const questionId = ctx.session.awaitingCoachingAnswer;
      ctx.session.awaitingCoachingAnswer = null;

      await saveCoachingAnswer(questionId, ctx.message.text);
      await ctx.reply('✅ Спасибо за ответ! Рефлексия — ключ к стратегическому фокусу.', persistentKeyboard);
    } catch (error) {
      console.error('[COACHING] Answer error:', error.message);
      await ctx.reply('Ошибка при сохранении ответа.');
    }
  });
}

function getSmallWinMessage(streakResult, stats) {
  const messages = [];

  if (streakResult && streakResult.isNew) {
    const s = streakResult.streak;
    if (s === 3) messages.push('🔥 *3 дня подряд!* Ты в потоке — так держать!');
    else if (s === 7) messages.push('🏆 *Неделя без пропусков!* Это феноменально!');
    else if (s === 14) messages.push('🌟 *14 дней подряд!* Это уже привычка на всю жизнь!');
    else if (s === 30) messages.push('🚀 *30 дней подряд!* Ты — машина продуктивности!');
  }

  if (stats && stats.sfi >= 80 && stats.done > 0) {
    messages.push('🎯 *SFI 80%+!* Сегодня ты в стратегическом фокусе!');
  }

  return messages.length > 0 ? messages.join('\n') : null;
}

async function showCoaching(ctx, userId, date) {
  try {
    const coaching = await generateCoaching(userId, date);
    if (coaching) {
      if (coaching.questionId) {
        await ctx.reply(coaching.message, {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('💬 Ответить', `coaching_answer_${coaching.questionId}`)],
            [Markup.button.callback('⏭ Пропустить', 'coaching_skip')],
          ]),
        });
      } else {
        await ctx.reply(coaching.message, persistentKeyboard);
      }
    } else {
      await ctx.reply('Хорошего вечера!', persistentKeyboard);
    }
  } catch (error) {
    console.error('[COACHING] Error:', error.message);
    await ctx.reply('Хорошего вечера!', persistentKeyboard);
  }
}

async function startDayClose(ctx) {
  try {
    const { data: user } = await getUserByTelegramId(ctx.from.id);
    if (!user) {
      await ctx.reply('Профиль не найден. Используйте /start.');
      return;
    }

    const date = getTodayDate();
    const { data: items } = await getPlanItemsByDate(user.id, date);

    if (items.length === 0) {
      await ctx.reply('📋 На сегодня задач нет. Нечего закрывать.');
      return;
    }

    const pendingItems = items.filter((i) => i.status === 'pending');

    if (pendingItems.length === 0) {
      const stats = await getDayStats(user.id, date);
      await ctx.reply(
        '✅ Все задачи уже отмечены!\n\n' + formatDayStats(stats),
        { parse_mode: 'Markdown' }
      );
      return;
    }

    await ctx.reply(
      '🌙 *Закрытие дня*\n\n' +
      `Осталось задач: ${pendingItems.length}\n` +
      'Отметьте статус каждой задачи:',
      { parse_mode: 'Markdown' }
    );

    for (const item of pendingItems) {
      const strategic = item.initiative
        ? ` 🎯 ${item.initiative.title}`
        : item.is_strategic ? ' 📊' : ' 🔥';
      await ctx.reply(
        `${item.text_raw}${strategic}`,
        Markup.inlineKeyboard([
          [
            Markup.button.callback('✅ Сделано', `dayclose_done_${item.id}`),
            Markup.button.callback('⏭ Пропущено', `dayclose_skip_${item.id}`),
          ],
        ])
      );
    }

    await ctx.reply(
      'После отметки всех задач нажмите кнопку ниже:',
      Markup.inlineKeyboard([
        [Markup.button.callback('📊 Показать итоги дня', 'dayclose_summary')],
      ])
    );
  } catch (error) {
    console.error('[DAYCLOSE] Error:', error.message);
    await ctx.reply('Ошибка при закрытии дня.');
  }
}

async function handleTaskStatus(ctx, itemId, status) {
  try {
    const { error } = await updatePlanItem(itemId, { status });
    if (error) {
      await ctx.reply('Ошибка при обновлении задачи.');
      return;
    }

    const icon = status === 'done' ? '✅' : '⏭';
    await ctx.editMessageText(`${icon} ${ctx.callbackQuery.message.text}`);
  } catch (error) {
    console.error('[DAYCLOSE] Status update error:', error.message);
  }
}

module.exports = { registerDayCloseHandlers };
