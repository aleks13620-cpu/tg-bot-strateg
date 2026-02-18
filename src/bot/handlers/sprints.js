const { Markup } = require('telegraf');
const { getUserByTelegramId } = require('../../database/queries/users');
const { getActiveSprints, completeSprint } = require('../../database/queries/sprints');
const { formatSprintCompact } = require('../../services/sprint');

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
}

module.exports = { registerSprintsHandlers };
