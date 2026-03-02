const { Markup } = require('telegraf');
const { getUserByTelegramId } = require('../../database/queries/users');
const { getActiveSprint } = require('../../database/queries/sprints');
const { getSprintStats, formatSprintStats, getDayStats, formatDayStats, getWeekStats, formatWeekStats } = require('../../services/analytics');
const { getTodayDate } = require('../../services/planning');

function registerProgressHandlers(bot) {
  // Команда /progress
  bot.command('progress', async (ctx) => {
    await showProgress(ctx);
  });

  // Кнопка "Аналитика" из главного меню
  bot.action('action_analytics', async (ctx) => {
    await ctx.answerCbQuery();
    await showProgress(ctx);
  });

  // Итоги недели — текущая неделя (offset=0) и навигация
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
    const dayStats = await getDayStats(user.id, date);
    let response = formatDayStats(dayStats) + '\n\n';

    const { data: sprint } = await getActiveSprint(user.id);
    if (sprint) {
      const sprintStats = await getSprintStats(user.id, sprint.start_date, sprint.end_date);
      response += '---\n\n' + formatSprintStats(sprintStats);
    } else {
      response += '_Нет активного спринта для отображения общей статистики._';
    }

    await ctx.reply(response, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('📊 Итоги недели', 'action_week_stats_0')],
      ]),
    });
    console.log(`[PROGRESS] Shown for user ${user.id}`);
  } catch (error) {
    console.error('[PROGRESS] Error:', error.message);
    await ctx.reply('Ошибка при загрузке аналитики.');
  }
}

// Вычисляет начало и конец недели с учётом смещения (0 = текущая, -1 = прошлая, ...)
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

    // Прошлая неделя для сравнения
    const prev = getWeekRange(offset - 1);
    const [stats, prevStats, { data: activeSprint }] = await Promise.all([
      getWeekStats(user.id, start, end),
      getWeekStats(user.id, prev.start, prev.end),
      getActiveSprint(user.id),
    ]);

    const financialGoal = activeSprint?.financial_goal || null;
    const text = formatWeekStats(stats, start, end, prevStats, financialGoal);

    // Навигация: нельзя уйти вперёд текущей недели
    const navButtons = [];
    navButtons.push(Markup.button.callback('◀ Пред. неделя', `action_week_stats_${offset - 1}`));
    if (offset < 0) {
      navButtons.push(Markup.button.callback('След. неделя ▶', `action_week_stats_${offset + 1}`));
    }

    const keyboard = Markup.inlineKeyboard([navButtons]);

    // Если сообщение уже существует — редактируем, иначе отправляем новое
    try {
      await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
    } catch {
      await ctx.reply(text, { parse_mode: 'Markdown', ...keyboard });
    }

    console.log(`[PROGRESS] Week stats shown for user ${user.id}, offset=${offset}`);
  } catch (error) {
    console.error('[PROGRESS] Week stats error:', error.message);
    await ctx.reply('Ошибка при загрузке недельной аналитики.');
  }
}

module.exports = { registerProgressHandlers };
