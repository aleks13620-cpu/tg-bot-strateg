const { Markup } = require('telegraf');
const { getUserByTelegramId } = require('../../database/queries/users');
const { createReview, getActiveReview, getCompletedReviews } = require('../../database/queries/quarterlyReviews');

function registerReviewHandlers(bot) {

  // /review — начать или продолжить квартальный обзор
  bot.command('review', async (ctx) => {
    const { data: user } = await getUserByTelegramId(ctx.from.id);
    if (!user) return ctx.reply('Используйте /start.');

    const { data: active } = await getActiveReview(user.id);

    if (active) {
      await ctx.reply(
        `📋 У вас есть незавершённый обзор (блок ${active.current_block}).\n\nПродолжить?`,
        Markup.inlineKeyboard([
          [Markup.button.callback('▶️ Продолжить', 'review_start')],
          [Markup.button.callback('🔄 Начать заново', 'review_restart')],
        ])
      );
      return;
    }

    await ctx.scene.enter('quarterly_review');
  });

  // /reviews — история завершённых обзоров
  bot.command('reviews', async (ctx) => {
    const { data: user } = await getUserByTelegramId(ctx.from.id);
    if (!user) return ctx.reply('Используйте /start.');

    const { data: reviews } = await getCompletedReviews(user.id);

    if (!reviews || reviews.length === 0) {
      return ctx.reply('📋 Завершённых квартальных обзоров пока нет.\n\nНачните первый командой /review.');
    }

    let text = '📋 *Завершённые квартальные обзоры:*\n\n';
    reviews.forEach((r) => {
      const date = new Date(r.completed_at).toLocaleDateString('ru-RU');
      text += `🔹 Q${r.quarter} ${r.year} — ${date}\n`;
      if (r.focus_90_days) {
        const preview = r.focus_90_days.length > 60 ? r.focus_90_days.slice(0, 57) + '…' : r.focus_90_days;
        text += `  _Фокус: ${preview}_\n`;
      }
    });

    await ctx.reply(text, { parse_mode: 'Markdown' });
  });

  // Продолжить существующий обзор
  bot.action('review_start', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.scene.enter('quarterly_review');
  });

  // Начать заново (старый обзор помечаем как abandoned — просто входим в сцену, createReview создаст новый)
  bot.action('review_restart', async (ctx) => {
    await ctx.answerCbQuery();
    const { data: user } = await getUserByTelegramId(ctx.from.id);
    if (!user) return;

    // Помечаем старый как completed с пустым саммари чтобы не мешал
    const { data: active } = await getActiveReview(user.id);
    if (active) {
      const { completeReview } = require('../../database/queries/quarterlyReviews');
      await completeReview(active.id, '', '');
    }

    await ctx.scene.enter('quarterly_review');
  });

  // Кнопка из weekly reminder
  bot.action('review_skip', async (ctx) => {
    await ctx.answerCbQuery('⏭');
    await ctx.editMessageReplyMarkup(null).catch(() => {});
  });
}

module.exports = { registerReviewHandlers };
