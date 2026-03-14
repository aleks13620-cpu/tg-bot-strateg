const { Markup } = require('telegraf');
const { getUserByTelegramId } = require('../../database/queries/users');
const { getSprintById, getAllSprints } = require('../../database/queries/sprints');
const { getSprintStats, formatSprintStats, getDayStats, formatDayStats, getWeekStats, formatWeekStats, buildSfiChartUrl, formatAllSprintsStats } = require('../../services/analytics');
const { getTodayDate } = require('../../services/planning');

function registerProgressHandlers(bot) {
  bot.command('progress', async (ctx) => {
    await showProgress(ctx);
  });

  bot.action('action_analytics', async (ctx) => {
    await ctx.answerCbQuery();
    await showProgress(ctx);
  });

  // Статистика по конкретному спринту
  bot.action(/^action_sprint_stats_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    try {
      const sprintId = ctx.match[1];
      const { data: user } = await getUserByTelegramId(ctx.from.id);
      if (!user) return;

      const { data: sprint } = await getSprintById(sprintId);
      if (!sprint) {
        await ctx.reply('Спринт не найден.');
        return;
      }

      const stats = await getSprintStats(user.id, sprint.start_date, sprint.end_date, sprint.id);
      const statusLabel = sprint.status === 'active' ? '🟢 Активный' : '✅ Завершён';
      const [, sm, sd] = sprint.start_date.split('-');
      const [, em, ed] = sprint.end_date.split('-');
      const dateRange = `${sd}.${sm} – ${ed}.${em}`;

      let text = `🎯 *${sprint.goal_text}*\n`;
      text += `${statusLabel} · ${dateRange}\n\n`;
      text += formatSprintStats(stats);

      const buttons = [[Markup.button.callback('◀ Назад к списку', 'action_analytics')]];
      if (stats && stats.sfi > 0) {
        buttons.unshift([Markup.button.callback('📊 По всем спринтам', 'action_all_sprints_stats')]);
      }

      try {
        await ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
      } catch {
        await ctx.reply(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
      }
    } catch (error) {
      console.error('[PROGRESS] Sprint stats error:', error.message);
      await ctx.reply('Ошибка при загрузке статистики спринта.');
    }
  });

  // Статистика по всем спринтам + график
  bot.action('action_all_sprints_stats', async (ctx) => {
    await ctx.answerCbQuery();
    try {
      const { data: user } = await getUserByTelegramId(ctx.from.id);
      if (!user) return;

      const { data: sprints } = await getAllSprints(user.id);
      if (!sprints || sprints.length === 0) {
        await ctx.reply('Спринтов пока нет.');
        return;
      }

      // Получаем статистику по каждому спринту
      const sprintDataList = await Promise.all(
        sprints.map(async (sprint) => ({
          sprint,
          stats: await getSprintStats(user.id, sprint.start_date, sprint.end_date, sprint.id),
        }))
      );

      const text = formatAllSprintsStats(sprintDataList);
      const buttons = [[Markup.button.callback('◀ Назад', 'action_analytics')]];

      try {
        await ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
      } catch {
        await ctx.reply(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
      }

      // Отправляем график если есть данные (минимум 2 спринта с задачами)
      const valid = sprintDataList.filter((s) => s.stats && s.stats.done > 0);
      if (valid.length >= 2) {
        const chartData = valid.slice(0, 10).reverse(); // хронологический порядок, макс 10
        const labels = chartData.map((s) => {
          const name = s.sprint.goal_text;
          return name.length > 12 ? name.slice(0, 10) + '…' : name;
        });
        const sfiValues = chartData.map((s) => s.stats.sfi);
        const chartUrl = buildSfiChartUrl(labels, sfiValues);

        try {
          await ctx.replyWithPhoto(chartUrl, { caption: '📊 SFI по спринтам' });
        } catch (chartErr) {
          console.error('[PROGRESS] Chart error:', chartErr.message);
        }
      }
    } catch (error) {
      console.error('[PROGRESS] All sprints stats error:', error.message);
      await ctx.reply('Ошибка при загрузке статистики.');
    }
  });

  // Итоги недели с навигацией
  bot.action(/^action_week_stats_(-?\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const offset = parseInt(ctx.match[1], 10);
    await showWeekStats(ctx, offset);
  });
}

async function showProgress(ctx) {
  try {
    const { data: user } = await getUserByTelegramId(ctx.from.id);
    if (!user) {
      await ctx.reply('Профиль не найден. Используйте /start.');
      return;
    }

    const date = getTodayDate();
    const [dayStats, { data: sprints }] = await Promise.all([
      getDayStats(user.id, date),
      getAllSprints(user.id),
    ]);

    const dayText = formatDayStats(dayStats);

    // Кнопки выбора спринта (макс 5)
    const buttons = [];
    if (sprints && sprints.length > 0) {
      const shown = sprints.slice(0, 5);
      for (const sprint of shown) {
        const icon = sprint.status === 'active' ? '🟢' : '✅';
        const label = sprint.goal_text.length > 28 ? sprint.goal_text.slice(0, 25) + '…' : sprint.goal_text;
        buttons.push([Markup.button.callback(`${icon} ${label}`, `action_sprint_stats_${sprint.id}`)]);
      }
      if (sprints.length > 1) {
        buttons.push([Markup.button.callback('📊 По всем спринтам', 'action_all_sprints_stats')]);
      }
    }
    buttons.push([Markup.button.callback('📅 Итоги недели', 'action_week_stats_0')]);

    const suffix = sprints && sprints.length > 0
      ? '\n\n📈 *Выбери спринт для статистики:*'
      : '';

    await ctx.reply(dayText + suffix, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(buttons),
    });
  } catch (error) {
    console.error('[PROGRESS] Error:', error.message);
    await ctx.reply('Ошибка при загрузке аналитики.');
  }
}

function getWeekRange(offset) {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() + mondayOffset + offset * 7);
  weekStart.setHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  return {
    start: weekStart.toISOString().split('T')[0],
    end: weekEnd.toISOString().split('T')[0],
  };
}

async function showWeekStats(ctx, offset) {
  try {
    const { data: user } = await getUserByTelegramId(ctx.from.id);
    if (!user) {
      await ctx.reply('Профиль не найден. Используйте /start.');
      return;
    }

    const { start, end } = getWeekRange(offset);
    const prev = getWeekRange(offset - 1);
    const [stats, prevStats] = await Promise.all([
      getWeekStats(user.id, start, end),
      getWeekStats(user.id, prev.start, prev.end),
    ]);

    const text = formatWeekStats(stats, start, end, prevStats);

    const navButtons = [Markup.button.callback('◀ Пред. неделя', `action_week_stats_${offset - 1}`)];
    if (offset < 0) {
      navButtons.push(Markup.button.callback('След. неделя ▶', `action_week_stats_${offset + 1}`));
    }

    try {
      await ctx.editMessageText(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([navButtons]) });
    } catch {
      await ctx.reply(text, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([navButtons]) });
    }
  } catch (error) {
    console.error('[PROGRESS] Week stats error:', error.message);
    await ctx.reply('Ошибка при загрузке недельной аналитики.');
  }
}

module.exports = { registerProgressHandlers };
