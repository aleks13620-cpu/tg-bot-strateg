const { Scenes, Markup } = require('telegraf');
const { getUserByTelegramId } = require('../../database/queries/users');
const { createReview, getActiveReview, saveReviewAnswer, completeReview, updateReviewBlock } = require('../../database/queries/quarterlyReviews');

// 9 вопросов по 4 блокам
const QUESTIONS = [
  { block: 1, idx: 0, text: '📊 *Блок 1 — Итоги квартала*\n\nЧто удалось достичь? Назовите 3 главных результата.' },
  { block: 1, idx: 1, text: 'Что НЕ удалось? Какие цели остались невыполненными?' },
  { block: 2, idx: 0, text: '🔍 *Блок 2 — Анализ*\n\nЧто стало главным препятствием в этом квартале?' },
  { block: 2, idx: 1, text: 'Какие решения или действия оказались самыми правильными?' },
  { block: 3, idx: 0, text: '⚡ *Блок 3 — Личное*\n\nКак изменился ваш уровень энергии и фокуса? Что влияло больше всего?' },
  { block: 3, idx: 1, text: 'Что хотите изменить в своих привычках или процессах работы?' },
  { block: 4, idx: 0, text: '🚀 *Блок 4 — Следующий квартал*\n\nКакова главная цель следующего квартала (один чёткий результат)?' },
  { block: 4, idx: 1, text: 'Какие 2–3 ключевые инициативы поддержат эту цель?' },
  { block: 4, idx: 2, text: 'Что самое важное сделать в первые 30 дней? Конкретный шаг №1.' },
];

const TOTAL_STEPS = QUESTIONS.length; // 9 — шаги 1..9 (шаг 0 = вводный, шаг 10 = финальный)

function continueBtn(step) {
  return Markup.inlineKeyboard([[Markup.button.callback('⏸ Продолжить позже', `qr_pause_${step}`)]]);
}

const quarterlyReviewScene = new Scenes.WizardScene(
  'quarterly_review',

  // Шаг 0: Вводный
  async (ctx) => {
    const { data: user } = await getUserByTelegramId(ctx.from.id);
    if (!user) { await ctx.reply('Используйте /start.'); return ctx.scene.leave(); }

    // Восстановление: если есть активный обзор — переходим к нужному шагу
    const { data: existing } = await getActiveReview(user.id);
    if (existing) {
      ctx.wizard.state.reviewId = existing.id;
      const resumeStep = Math.max(1, Math.min(existing.current_block, TOTAL_STEPS));
      await ctx.reply(
        `📋 У вас есть незавершённый обзор (${resumeStep - 1}/${TOTAL_STEPS} вопросов отвечено).\n\nПродолжаем с места остановки.`,
        { parse_mode: 'Markdown' }
      );
      return ctx.wizard.selectStep(resumeStep);
    }

    // Определяем квартал и год
    const now = new Date();
    const quarter = Math.floor(now.getMonth() / 3) + 1;
    const year = now.getFullYear();

    const { data: review, error } = await createReview(user.id, quarter, year);
    if (error) { await ctx.reply('Ошибка при создании обзора.'); return ctx.scene.leave(); }

    ctx.wizard.state.reviewId = review.id;

    await ctx.reply(
      `🔄 *Квартальный обзор Q${quarter} ${year}*\n\n` +
      `Это 9 вопросов по 4 блокам. Займёт 10–15 минут.\n` +
      `Можно прервать в любой момент — прогресс сохраняется.\n\n` +
      `Поехали?`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('▶️ Начать', 'qr_start')],
          [Markup.button.callback('⏸ Позже', 'qr_pause_0')],
        ]),
      }
    );
    return ctx.wizard.next();
  },

  // Шаг 1: Вопрос 1
  async (ctx) => { await handleQuestionStep(ctx, 0); },
  // Шаг 2: Вопрос 2
  async (ctx) => { await handleQuestionStep(ctx, 1); },
  // Шаг 3: Вопрос 3
  async (ctx) => { await handleQuestionStep(ctx, 2); },
  // Шаг 4: Вопрос 4
  async (ctx) => { await handleQuestionStep(ctx, 3); },
  // Шаг 5: Вопрос 5
  async (ctx) => { await handleQuestionStep(ctx, 4); },
  // Шаг 6: Вопрос 6
  async (ctx) => { await handleQuestionStep(ctx, 5); },
  // Шаг 7: Вопрос 7
  async (ctx) => { await handleQuestionStep(ctx, 6); },
  // Шаг 8: Вопрос 8
  async (ctx) => { await handleQuestionStep(ctx, 7); },
  // Шаг 9: Вопрос 9
  async (ctx) => { await handleQuestionStep(ctx, 8); },

  // Шаг 10: Финальный
  async (ctx) => {
    if (ctx.callbackQuery) {
      const data = ctx.callbackQuery.data;
      await ctx.answerCbQuery();

      if (data === 'qr_create_goal') {
        await ctx.scene.leave();
        return ctx.scene.enter('onboarding');
      }
      if (data === 'qr_finish_later') {
        await ctx.reply('✅ Обзор сохранён. Вернитесь командой /review.');
        return ctx.scene.leave();
      }
      if (data.startsWith('qr_pause_')) {
        await pauseReview(ctx);
        return;
      }
      return;
    }

    if (!ctx.message?.text) return;
    if (ctx.message.text.startsWith('/')) return ctx.scene.leave();

    // Получили фокус на 90 дней
    const focus = ctx.message.text.trim();
    const reviewId = ctx.wizard.state.reviewId;

    // Компилируем саммари из сохранённых ответов
    const summary = ctx.wizard.state.answers
      ? ctx.wizard.state.answers.map((a, i) => `${i + 1}. ${a}`).join('\n')
      : '';

    await completeReview(reviewId, summary, focus);

    await ctx.reply(
      `✅ *Квартальный обзор завершён!*\n\n` +
      `🎯 *Фокус на 90 дней:*\n_${focus}_\n\n` +
      `Хотите сразу создать 30-дневную цель на основе этого фокуса?`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🎯 Создать 30-дневную цель', 'qr_create_goal')],
          [Markup.button.callback('⏭ Позже', 'qr_finish_later')],
        ]),
      }
    );
  }
);

// Обработка вопросного шага (qIdx — индекс в массиве QUESTIONS)
async function handleQuestionStep(ctx, qIdx) {
  const q = QUESTIONS[qIdx];
  const reviewId = ctx.wizard.state.reviewId;

  if (ctx.callbackQuery) {
    const data = ctx.callbackQuery.data;
    await ctx.answerCbQuery();

    if (data === 'qr_start') {
      // Показываем первый вопрос
      await ctx.reply(
        `${q.text}\n\n_Вопрос ${qIdx + 1}/${TOTAL_STEPS}_`,
        { parse_mode: 'Markdown', ...continueBtn(qIdx + 1) }
      );
      return;
    }

    if (data.startsWith('qr_pause_')) {
      await pauseReview(ctx);
      return;
    }
    return;
  }

  if (!ctx.message?.text) return;
  if (ctx.message.text.startsWith('/')) return ctx.scene.leave();

  const answer = ctx.message.text.trim();

  // Fire & forget — сохраняем ответ без блокировки
  if (reviewId) {
    saveReviewAnswer(reviewId, q.block, q.idx, q.text.replace(/\*|_/g, ''), answer)
      .catch((e) => console.error('[REVIEW] Save answer error:', e.message));
    updateReviewBlock(reviewId, qIdx + 2)
      .catch(() => {});
  }

  // Сохраняем ответ в state для финального саммари
  if (!ctx.wizard.state.answers) ctx.wizard.state.answers = [];
  ctx.wizard.state.answers[qIdx] = answer;

  const nextQIdx = qIdx + 1;

  if (nextQIdx < TOTAL_STEPS) {
    const nextQ = QUESTIONS[nextQIdx];
    await ctx.reply(
      `${nextQ.text}\n\n_Вопрос ${nextQIdx + 1}/${TOTAL_STEPS}_`,
      { parse_mode: 'Markdown', ...continueBtn(nextQIdx + 1) }
    );
    return ctx.wizard.next();
  }

  // Все вопросы отвечены → финальный шаг
  await ctx.reply(
    `🎉 *Отлично! Все вопросы пройдены.*\n\n` +
    `Последний шаг — сформулируйте ваш *главный фокус на следующие 90 дней* одной фразой:\n\n` +
    `_Например: "Выйти на 500к выручки через продажи в B2B"_`,
    { parse_mode: 'Markdown', ...continueBtn(TOTAL_STEPS + 1) }
  );
  return ctx.wizard.next();
}

async function pauseReview(ctx) {
  const reviewId = ctx.wizard.state.reviewId;
  const step = ctx.wizard.cursor;
  if (reviewId) {
    updateReviewBlock(reviewId, step).catch(() => {});
  }
  await ctx.reply('⏸ Прогресс сохранён. Вернитесь командой /review.');
  return ctx.scene.leave();
}

// Обработчик паузы как action (регистрируется глобально)
quarterlyReviewScene.action(/^qr_pause_\d+$/, async (ctx) => {
  await ctx.answerCbQuery();
  await pauseReview(ctx);
});

quarterlyReviewScene.action('qr_start', async (ctx) => {
  await ctx.answerCbQuery();
  const q = QUESTIONS[0];
  await ctx.reply(
    `${q.text}\n\n_Вопрос 1/${TOTAL_STEPS}_`,
    { parse_mode: 'Markdown', ...continueBtn(1) }
  );
  return ctx.wizard.selectStep(1);
});

module.exports = { quarterlyReviewScene };
