const { Markup } = require('telegraf');
const { getUserByTelegramId } = require('../../database/queries/users');
const { getPlanItemsByDate, updatePlanItem } = require('../../database/queries/planItems');
const { getDayStats, formatDayStats } = require('../../services/analytics');
const { getTodayDate } = require('../../services/planning');
const { generateCoaching } = require('../../services/coaching/simpleCoaching');
const { saveCoachingAnswer, getLastUnansweredQuestion } = require('../../database/queries/coaching');

function registerDayCloseHandlers(bot) {
  // Команда /close — закрытие дня
  bot.command('close', async (ctx) => {
    await startDayClose(ctx);
  });

  // Кнопка закрытия дня (можно добавить в меню позже через напоминания)
  bot.action('action_close_day', async (ctx) => {
    await ctx.answerCbQuery();
    await startDayClose(ctx);
  });

  // Отметка задачи как выполненной
  bot.action(/^dayclose_done_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery('✅');
    await handleTaskStatus(ctx, parseInt(ctx.match[1]), 'done');
  });

  // Отметка задачи как пропущенной
  bot.action(/^dayclose_skip_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery('⏭');
    await handleTaskStatus(ctx, parseInt(ctx.match[1]), 'skipped');
  });

  // Показать итоги после отметки всех задач
  bot.action('dayclose_summary', async (ctx) => {
    await ctx.answerCbQuery();
    try {
      const { data: user } = await getUserByTelegramId(ctx.from.id);
      if (!user) return;

      const date = getTodayDate();
      const stats = await getDayStats(user.id, date);
      await ctx.reply(formatDayStats(stats), { parse_mode: 'Markdown' });

      // Коучинг после итогов дня
      const coaching = await generateCoaching(user.id, date);
      if (coaching) {
        if (coaching.questionId) {
          // Вопрос — предлагаем ответить
          await ctx.reply(coaching.message, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('💬 Ответить', `coaching_answer_${coaching.questionId}`)],
              [Markup.button.callback('⏭ Пропустить', 'coaching_skip')],
            ]),
          });
        } else {
          // Мотивационное сообщение — без кнопок
          await ctx.reply(coaching.message);
        }
      }
    } catch (error) {
      console.error('[DAYCLOSE] Summary error:', error.message);
      await ctx.reply('Ошибка при формировании итогов.');
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
    await ctx.editMessageText('⏭ Вопрос пропущен. Хорошего вечера!');
  });

  // Обработка текстового ответа на коучинг
  bot.on('text', async (ctx, next) => {
    if (ctx.message.text.startsWith('/')) return next();
    if (!ctx.session?.awaitingCoachingAnswer) return next();

    try {
      const questionId = ctx.session.awaitingCoachingAnswer;
      ctx.session.awaitingCoachingAnswer = null;

      await saveCoachingAnswer(questionId, ctx.message.text);
      await ctx.reply('✅ Спасибо за ответ! Рефлексия — ключ к стратегическому фокусу.');
    } catch (error) {
      console.error('[COACHING] Answer error:', error.message);
      await ctx.reply('Ошибка при сохранении ответа.');
    }
  });
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

    // Отправляем каждую задачу с кнопками
    for (const item of pendingItems) {
      const strategic = item.is_strategic ? ' 📊' : ' 🔥';
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
