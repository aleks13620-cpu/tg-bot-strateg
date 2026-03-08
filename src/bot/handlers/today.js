const { Markup } = require('telegraf');
const { getUserByTelegramId } = require('../../database/queries/users');
const { getPlanItemsByDate, updatePlanItem } = require('../../database/queries/planItems');
const { getTodayDate } = require('../../services/planning');
const { getActiveSprint } = require('../../database/queries/sprints');
const { getStreakInfo } = require('../../services/streak');
const { getDayStats, formatSprintProgressBar } = require('../../services/analytics');
const { getStaleMessage } = require('../../services/reminder');
const { getUncoveredInitiativesMessage } = require('./plan');

function sortItems(items) {
  return [...items].sort((a, b) => {
    if (a.is_key_task && !b.is_key_task) return -1;
    if (!a.is_key_task && b.is_key_task) return 1;
    return 0;
  });
}

function formatTodayList(items) {
  if (items.length === 0) {
    return '📋 На сегодня задач нет.\n\nИспользуйте кнопку *«📋 Добавить задачи»* чтобы запланировать день.';
  }

  let text = '📋 *План на сегодня:*\n\n';
  let num = 1;

  // Группируем: по инициативам, по стратегии без инициативы, вне стратегии
  const byInitiative = {};
  const strategicItems = [];
  const fireItems = [];

  sortItems(items).forEach((item) => {
    if (item.initiative) {
      const title = item.initiative.title;
      if (!byInitiative[title]) byInitiative[title] = [];
      byInitiative[title].push(item);
    } else if (item.is_strategic) {
      strategicItems.push(item);
    } else {
      fireItems.push(item);
    }
  });

  const hasStrategic = Object.keys(byInitiative).length > 0 || strategicItems.length > 0;

  for (const [title, groupItems] of Object.entries(byInitiative)) {
    text += `📌 *${title}:*\n`;
    for (const item of groupItems) {
      const icon = item.status === 'done' ? '✅' : item.status === 'skipped' ? '⏭' : '⬜';
      text += `  ${num}. ${icon} ${item.text_raw}${item.is_key_task ? ' ⭐' : ''}\n`;
      num++;
    }
  }

  if (strategicItems.length > 0) {
    text += `📊 *По стратегии:*\n`;
    for (const item of strategicItems) {
      const icon = item.status === 'done' ? '✅' : item.status === 'skipped' ? '⏭' : '⬜';
      text += `  ${num}. ${icon} ${item.text_raw}${item.is_key_task ? ' ⭐' : ''}\n`;
      num++;
    }
  }

  if (fireItems.length > 0) {
    if (hasStrategic) text += `\n🔥 *Вне стратегии:*\n`;
    for (const item of fireItems) {
      const icon = item.status === 'done' ? '✅' : item.status === 'skipped' ? '⏭' : '⬜';
      text += `  ${num}. ${icon} ${item.text_raw}${item.is_key_task ? ' ⭐' : ''}\n`;
      num++;
    }
  }

  const done = items.filter((i) => i.status === 'done').length;
  const total = items.length;
  text += `\n✅ Выполнено: ${done}/${total}`;
  if (done === total && total > 0) text += ' 🎉';

  return text;
}

function buildTodayKeyboard(items) {
  const pendingItems = sortItems(items).filter((i) => i.status === 'pending');
  if (pendingItems.length === 0) return null;

  const buttons = pendingItems.map((item) => {
    const label = item.text_raw.length > 28 ? item.text_raw.slice(0, 25) + '...' : item.text_raw;
    return [
      Markup.button.callback(`✅ ${label}`, `today_done_${item.id}`),
      Markup.button.callback('⏭', `today_skip_${item.id}`),
    ];
  });

  return Markup.inlineKeyboard(buttons);
}

function registerTodayHandlers(bot) {
  // /today — показать план на сегодня с кнопками
  bot.command('today', async (ctx) => {
    await showToday(ctx);
  });

  // Inline-кнопка из утреннего напоминания
  bot.action('action_today_plan', async (ctx) => {
    await ctx.answerCbQuery();
    await showToday(ctx);
  });

  // /done — быстро отметить первую pending-задачу выполненной
  bot.command('done', async (ctx) => {
    try {
      const { data: user } = await getUserByTelegramId(ctx.from.id);
      if (!user) {
        await ctx.reply('Профиль не найден. Используйте /start.');
        return;
      }

      const date = getTodayDate();
      const { data: items } = await getPlanItemsByDate(user.id, date);
      const pending = items.find((i) => i.status === 'pending');

      if (!pending) {
        await ctx.reply('✅ Нет незавершённых задач на сегодня. Всё сделано! 🎉');
        return;
      }

      await updatePlanItem(pending.id, { status: 'done' });
      console.log(`[TODAY] /done: task ${pending.id} marked done for user ${user.id}`);

      await showToday(ctx);
    } catch (error) {
      console.error('[TODAY] /done error:', error.message);
      await ctx.reply('Ошибка при обновлении задачи.');
    }
  });

  // Отметить задачу выполненной через инлайн-кнопку
  bot.action(/^today_done_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery('✅');
    await handleTodayStatus(ctx, ctx.match[1], 'done');
  });

  // Пропустить задачу через инлайн-кнопку
  bot.action(/^today_skip_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery('⏭');
    await handleTodayStatus(ctx, ctx.match[1], 'skipped');
  });

  // Устаревшие задачи: выполнено
  bot.action(/^stale_done_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery('✅');
    await handleStaleAction(ctx, ctx.match[1], 'done');
  });

  // Устаревшие задачи: пропустить
  bot.action(/^stale_skip_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery('⏭');
    await handleStaleAction(ctx, ctx.match[1], 'skipped');
  });

  // Устаревшие задачи: перенести на сегодня
  bot.action(/^stale_today_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery('📅');
    await handleStaleAction(ctx, ctx.match[1], 'today');
  });
}

async function showToday(ctx) {
  try {
    const { data: user } = await getUserByTelegramId(ctx.from.id);
    if (!user) {
      await ctx.reply('Профиль не найден. Используйте /start.');
      return;
    }

    const date = getTodayDate();
    const [{ data: items }, { data: sprint }, streak, stats] = await Promise.all([
      getPlanItemsByDate(user.id, date),
      getActiveSprint(user.id),
      getStreakInfo(user.id),
      getDayStats(user.id, date),
    ]);

    let header = '';
    if (sprint) {
      const sfi = stats && stats.done > 0 ? stats.sfi : null;
      header += `🎯 *${sprint.goal_text}*\n`;
      header += formatSprintProgressBar(sprint, sfi) + '\n';
    }
    if (streak.current >= 2) {
      header += `🔥 Стрик: ${streak.current} дн.\n`;
    }
    if (header) header += '\n';

    const text = header + formatTodayList(items);
    const keyboard = buildTodayKeyboard(items);

    const options = { parse_mode: 'Markdown' };
    if (keyboard) Object.assign(options, keyboard);

    await ctx.reply(text, options);

    if (items.length > 0) {
      const uncoveredMsg = await getUncoveredInitiativesMessage(user.id, date);
      if (uncoveredMsg) {
        await ctx.reply(uncoveredMsg, { parse_mode: 'Markdown' });
      }
    }

    console.log(`[TODAY] Shown for user ${user.id}, tasks=${items.length}`);
  } catch (error) {
    console.error('[TODAY] showToday error:', error.message);
    await ctx.reply('Ошибка при загрузке задач.');
  }
}

async function handleTodayStatus(ctx, itemId, status) {
  try {
    const { data: user } = await getUserByTelegramId(ctx.from.id);
    if (!user) return;

    const { error } = await updatePlanItem(itemId, { status });
    if (error) {
      await ctx.reply('Ошибка при обновлении задачи.');
      return;
    }

    // Перерисовываем список
    const date = getTodayDate();
    const { data: items } = await getPlanItemsByDate(user.id, date);
    const text = formatTodayList(items);
    const keyboard = buildTodayKeyboard(items);

    const editOptions = { parse_mode: 'Markdown' };
    if (keyboard) Object.assign(editOptions, keyboard);

    try {
      await ctx.editMessageText(text, editOptions);
    } catch {
      await ctx.reply(text, editOptions);
    }
  } catch (error) {
    console.error('[TODAY] Status update error:', error.message);
  }
}

async function handleStaleAction(ctx, itemId, action) {
  try {
    const { data: user } = await getUserByTelegramId(ctx.from.id);
    if (!user) return;

    if (action === 'done') {
      await updatePlanItem(itemId, { status: 'done' });
    } else if (action === 'skipped') {
      await updatePlanItem(itemId, { status: 'skipped' });
    } else if (action === 'today') {
      await updatePlanItem(itemId, { date: getTodayDate() });
    }

    // Перерисовываем сообщение с оставшимися stale задачами
    const staleMsg = await getStaleMessage(user.id);
    if (!staleMsg) {
      await ctx.editMessageText('✅ Все устаревшие задачи обработаны!');
    } else {
      try {
        await ctx.editMessageText(staleMsg.text, { parse_mode: 'Markdown', ...staleMsg.keyboard });
      } catch {
        await ctx.reply(staleMsg.text, { parse_mode: 'Markdown', ...staleMsg.keyboard });
      }
    }
  } catch (error) {
    console.error('[STALE] Action error:', error.message);
  }
}

module.exports = { registerTodayHandlers };
