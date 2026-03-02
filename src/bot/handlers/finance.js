const { Markup } = require('telegraf');
const { getUserByTelegramId } = require('../../database/queries/users');
const { getActiveSprint } = require('../../database/queries/sprints');
const { saveFinancialProgress, getFinancialProgress } = require('../../database/queries/finance');
const { KEYBOARD_BUTTONS, persistentKeyboard } = require('../../utils/keyboards');

function getMondayOfWeek(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = d.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().split('T')[0];
}

function formatProgressHistory(records, financialGoal) {
  if (records.length === 0) return '';

  let text = '\n\n📈 *История прогресса:*\n';
  records.slice(0, 5).forEach((r) => {
    const [, m, d] = r.week_start.split('-');
    text += `  Неделя с ${d}.${m}: *${r.actual_value}*\n`;
  });
  return text.trimEnd();
}

function registerFinanceHandlers(bot) {
  // /finance — показать текущую финансовую цель и историю
  bot.command('finance', async (ctx) => {
    try {
      const { data: user } = await getUserByTelegramId(ctx.from.id);
      if (!user) {
        await ctx.reply('Профиль не найден. Используйте /start.');
        return;
      }

      const { data: sprint } = await getActiveSprint(user.id);

      if (!sprint || !sprint.financial_goal) {
        await ctx.reply(
          '💰 *Финансовая цель*\n\nВ текущем спринте финансовая цель не задана.\n\n' +
          '_Финансовая цель задаётся при создании спринта._',
          { parse_mode: 'Markdown' }
        );
        return;
      }

      const { data: records } = await getFinancialProgress(user.id, sprint.id);

      let text = `💰 *Финансовая цель спринта:*\n${sprint.financial_goal}`;
      text += formatProgressHistory(records, sprint.financial_goal);
      text += '\n\nВнести актуальный прогресс на этой неделе?';

      const today = new Date().toISOString().split('T')[0];
      const weekStart = getMondayOfWeek(today);

      await ctx.reply(text, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('💰 Внести прогресс', `action_finance_input_${weekStart}`)],
        ]),
      });
      console.log(`[FINANCE] /finance shown for user ${user.id}`);
    } catch (error) {
      console.error('[FINANCE] /finance error:', error.message);
      await ctx.reply('Ошибка при загрузке финансовой цели.');
    }
  });

  // Кнопка «Внести прогресс» — запускает ввод
  bot.action(/^action_finance_input_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    try {
      const { data: user } = await getUserByTelegramId(ctx.from.id);
      if (!user) return;

      const weekStart = ctx.match[1];
      const { data: sprint } = await getActiveSprint(user.id);

      if (!sprint || !sprint.financial_goal) {
        await ctx.reply('Финансовая цель не задана.');
        return;
      }

      ctx.session.awaitingFinanceInput = { sprintId: sprint.id, weekStart };

      await ctx.reply(
        `💰 *Финансовая цель:* ${sprint.financial_goal}\n\n` +
        'Напишите ваш прогресс за эту неделю (например: _«Выручка 120 000 ₽»_ или _«2 клиента»_):',
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('⏭ Пропустить', 'action_finance_skip')],
          ]),
        }
      );
    } catch (error) {
      console.error('[FINANCE] input prompt error:', error.message);
      await ctx.reply('Ошибка.');
    }
  });

  // Пропустить ввод финцели
  bot.action('action_finance_skip', async (ctx) => {
    await ctx.answerCbQuery('⏭');
    if (ctx.session) ctx.session.awaitingFinanceInput = null;
    try {
      await ctx.editMessageText('⏭ Прогресс по финцели пропущен.');
    } catch {
      await ctx.reply('⏭ Пропущено.');
    }
  });

  // Текстовый обработчик — сохраняет прогресс
  bot.on('text', async (ctx, next) => {
    if (ctx.message.text.startsWith('/')) return next();
    if (KEYBOARD_BUTTONS.includes(ctx.message.text)) {
      if (ctx.session) ctx.session.awaitingFinanceInput = null;
      return next();
    }
    if (!ctx.session?.awaitingFinanceInput) return next();

    try {
      const { sprintId, weekStart } = ctx.session.awaitingFinanceInput;
      ctx.session.awaitingFinanceInput = null;

      const { data: user } = await getUserByTelegramId(ctx.from.id);
      if (!user) return next();

      const actualValue = ctx.message.text.trim();
      await saveFinancialProgress(user.id, sprintId, weekStart, actualValue);

      const [, m, d] = weekStart.split('-');
      await ctx.reply(
        `✅ Прогресс сохранён!\n\n💰 Неделя с ${d}.${m}: *${actualValue}*`,
        { parse_mode: 'Markdown', ...persistentKeyboard }
      );
      console.log(`[FINANCE] Progress saved for user ${user.id}: ${actualValue}`);
    } catch (error) {
      console.error('[FINANCE] save error:', error.message);
      await ctx.reply('Ошибка при сохранении прогресса.');
    }
  });
}

module.exports = { registerFinanceHandlers };
