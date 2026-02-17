const { getUserByTelegramId } = require('../../database/queries/users');
const { getActiveSprint } = require('../../database/queries/sprints');
const { getSprintStats, formatSprintStats, getDayStats, formatDayStats } = require('../../services/analytics');
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
}

async function showProgress(ctx) {
  try {
    const { data: user } = await getUserByTelegramId(ctx.from.id);
    if (!user) {
      await ctx.reply('Профиль не найден. Используйте /start.');
      return;
    }

    // Статистика за сегодня
    const date = getTodayDate();
    const dayStats = await getDayStats(user.id, date);

    let response = formatDayStats(dayStats) + '\n\n';

    // Статистика за спринт
    const { data: sprint } = await getActiveSprint(user.id);
    if (sprint) {
      const sprintStats = await getSprintStats(user.id, sprint.start_date, sprint.end_date);
      response += '---\n\n' + formatSprintStats(sprintStats);
    } else {
      response += '_Нет активного спринта для отображения общей статистики._';
    }

    await ctx.reply(response, { parse_mode: 'Markdown' });
    console.log(`[PROGRESS] Shown for user ${user.id}`);
  } catch (error) {
    console.error('[PROGRESS] Error:', error.message);
    await ctx.reply('Ошибка при загрузке аналитики.');
  }
}

module.exports = { registerProgressHandlers };
