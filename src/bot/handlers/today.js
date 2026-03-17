const { Markup } = require('telegraf');
const { getUserByTelegramId } = require('../../database/queries/users');
const { getPlanItemsByDate, updatePlanItem } = require('../../database/queries/planItems');
const { getTodayDate, formatDateRu } = require('../../services/planning');
const { buildStaleDatePickerKeyboard } = require('../../utils/keyboards');
const { getActiveSprint } = require('../../database/queries/sprints');
const { getStreakInfo } = require('../../services/streak');
const { getDayStats, formatSprintProgressBar } = require('../../services/analytics');
const { getStaleMessage } = require('../../services/reminder');
const { getUncoveredInitiativesMessage } = require('./plan');

// Escape special chars for MarkdownV2
function escV2(text) {
  if (text === null || text === undefined) return '';
  return String(text).replace(/[_*[\]()~`>#+=|{}.!\-\\]/g, '\\$&');
}

function sortItems(items) {
  return [...items].sort((a, b) => {
    if (a.is_key_task && !b.is_key_task) return -1;
    if (!a.is_key_task && b.is_key_task) return 1;
    return 0;
  });
}

// Returns { text, keyboard } — single pass guarantees text numbering matches button order
function buildTodayMessage(items, stats) {
  if (items.length === 0) {
    return {
      text: '📋 На сегодня задач нет\\.\n\nИспользуйте кнопку *«📋 Добавить задачи»* чтобы запланировать день\\.',
      keyboard: null,
    };
  }

  const done = items.filter((i) => i.status === 'done').length;
  const total = items.length;
  let completionLine = `✅ Выполнено: ${done}/${total}`;
  if (stats && stats.done > 0) {
    const sfiIcon = stats.sfi >= 70 ? '🟢' : stats.sfi >= 50 ? '🟡' : stats.sfi > 0 ? '🔴' : '';
    completionLine += ` · SFI ${stats.sfi}%${sfiIcon ? ' ' + sfiIcon : ''}`;
  }
  if (done === total && total > 0) completionLine += ' 🎉';
  completionLine += '\n\n';

  // Build display-ordered list once
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
  let taskList = '';
  let num = 1;
  const keyboardRows = [];

  function renderItem(item) {
    const taskText = escV2(item.text_raw) + (item.is_key_task ? ' ⭐' : '');
    if (item.status === 'done') {
      taskList += `  ${num}\\. ~${taskText}~ ✅\n`;
    } else if (item.status === 'skipped') {
      taskList += `  ${num}\\. ⏭ ${taskText}\n`;
    } else {
      // pending (or any other) — add button
      taskList += `  ${num}\\. ⬜ ${taskText}\n`;
      const label = item.text_raw.length > 30 ? item.text_raw.slice(0, 27) + '...' : item.text_raw;
      keyboardRows.push([
        Markup.button.callback(`✅ ${label}`, `today_done_${item.id}`),
        Markup.button.callback('⏭', `today_skip_${item.id}`),
        Markup.button.callback('📅', `today_postpone_${item.id}`),
      ]);
    }
    num++;
  }

  for (const [title, groupItems] of Object.entries(byInitiative)) {
    taskList += `📌 *${escV2(title)}:*\n`;
    groupItems.forEach(renderItem);
  }

  if (strategicItems.length > 0) {
    taskList += `📊 *По стратегии:*\n`;
    strategicItems.forEach(renderItem);
  }

  if (fireItems.length > 0) {
    if (hasStrategic) taskList += `\n🔥 *Вне стратегии:*\n`;
    fireItems.forEach(renderItem);
  }

  return {
    text: completionLine + taskList,
    keyboard: keyboardRows.length > 0 ? Markup.inlineKeyboard(keyboardRows) : null,
  };
}

function buildSprintFooter(sprint, streak, sfi) {
  if (!sprint && (!streak || streak.current < 2)) return '';

  let footer = '\n────────────────\n';

  if (sprint) {
    footer += `🎯 *${escV2(sprint.goal_text)}*\n`;
    footer += escV2(formatSprintProgressBar(sprint, sfi)) + '\n';

    const today = new Date().toISOString().split('T')[0];
    if (sprint.end_date < today) {
      const end = new Date(sprint.end_date + 'T00:00:00Z');
      const now = new Date(today + 'T00:00:00Z');
      const daysAgo = Math.round((now - end) / (1000 * 60 * 60 * 24));
      footer += `\n⚠️ Спринт завершился ${daysAgo} дн\\. назад — откройте /sprints чтобы архивировать или продолжить\n`;
    }
  }

  if (streak && streak.current >= 2) {
    footer += `🔥 Стрик: ${streak.current} дн\\.\n`;
  }

  return footer;
}

function registerTodayHandlers(bot) {
  bot.command('today', async (ctx) => {
    await showToday(ctx);
  });

  bot.action('action_today_plan', async (ctx) => {
    await ctx.answerCbQuery();
    await showToday(ctx);
  });

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

  // Mark done via inline button
  bot.action(/^today_done_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery('✅');
    await handleTodayStatus(ctx, ctx.match[1], 'done');
  });

  // Skip via inline button
  bot.action(/^today_skip_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery('⏭');
    await handleTodayStatus(ctx, ctx.match[1], 'skipped');
  });

  // Postpone to tomorrow via inline button
  bot.action(/^today_postpone_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery('📅');
    const itemId = ctx.match[1];
    try {
      const { data: user } = await getUserByTelegramId(ctx.from.id);
      if (!user) return;

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowDate = tomorrow.toISOString().split('T')[0];

      await updatePlanItem(itemId, { date: tomorrowDate });

      const date = getTodayDate();
      const [{ data: items }, { data: sprint }, streak, stats] = await Promise.all([
        getPlanItemsByDate(user.id, date),
        getActiveSprint(user.id),
        getStreakInfo(user.id),
        getDayStats(user.id, date),
      ]);

      const sfi = stats && stats.done > 0 ? stats.sfi : null;
      const { text: msgText, keyboard } = buildTodayMessage(items, stats);
      const text = msgText + buildSprintFooter(sprint, streak, sfi);

      const editOptions = { parse_mode: 'MarkdownV2' };
      if (keyboard) Object.assign(editOptions, keyboard);

      try {
        await ctx.editMessageText(text, editOptions);
      } catch {
        // ignore edit errors
      }
    } catch (error) {
      console.error('[TODAY] postpone error:', error.message);
    }
  });

  // Stale tasks: done
  bot.action(/^stale_done_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery('✅');
    await handleStaleAction(ctx, ctx.match[1], 'done');
  });

  // Stale tasks: skip
  bot.action(/^stale_skip_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery('⏭');
    await handleStaleAction(ctx, ctx.match[1], 'skipped');
  });

  // Stale tasks: move to today
  bot.action(/^stale_today_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery('📅');
    await handleStaleAction(ctx, ctx.match[1], 'today');
  });

  // Stale tasks: pick other date
  bot.action(/^stale_other_date_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const itemId = ctx.match[1];
    await ctx.reply('📅 На какую дату перенести задачу?', buildStaleDatePickerKeyboard(itemId));
  });

  // Stale tasks: date picked
  bot.action(/^stale_move_([^_]+)_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery('📅');
    try {
      const itemId = ctx.match[1];
      const newDate = ctx.match[2];
      const { data: user } = await getUserByTelegramId(ctx.from.id);
      if (!user) return;

      await updatePlanItem(itemId, { date: newDate });
      await ctx.editMessageText(`📅 Задача перенесена на ${formatDateRu(newDate)}`);
    } catch (error) {
      console.error('[STALE] Move error:', error.message);
    }
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

    const sfi = stats && stats.done > 0 ? stats.sfi : null;
    const { text: msgText, keyboard } = buildTodayMessage(items, stats);
    const text = msgText + buildSprintFooter(sprint, streak, sfi);

    console.log('[TODAY] MESSAGE PREVIEW:\n' + text.slice(0, 300));

    const options = { parse_mode: 'MarkdownV2' };
    if (keyboard) Object.assign(options, keyboard);

    // При нажатии кнопки — редактируем сообщение на месте (без скролла к низу)
    // При команде /today — отправляем новое сообщение
    if (ctx.callbackQuery) {
      try {
        await ctx.editMessageText(text, options);
      } catch {
        await ctx.reply(text, options);
      }
    } else {
      await ctx.reply(text, options);
    }

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

    const date = getTodayDate();
    const [{ data: items }, { data: sprint }, streak, stats] = await Promise.all([
      getPlanItemsByDate(user.id, date),
      getActiveSprint(user.id),
      getStreakInfo(user.id),
      getDayStats(user.id, date),
    ]);

    const sfi = stats && stats.done > 0 ? stats.sfi : null;
    const { text: msgText, keyboard } = buildTodayMessage(items, stats);
    const text = msgText + buildSprintFooter(sprint, streak, sfi);

    const editOptions = { parse_mode: 'MarkdownV2' };
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
