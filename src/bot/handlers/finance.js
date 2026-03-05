const { Markup } = require('telegraf');
const { getUserByTelegramId } = require('../../database/queries/users');
const { getAllSprints } = require('../../database/queries/sprints');
const { saveFinancialProgress, getFinancialProgress } = require('../../database/queries/finance');
const { parseFinancialGoal, formatFinProgressBar, buildFinChartUrl } = require('../../services/analytics');
const { KEYBOARD_BUTTONS, persistentKeyboard } = require('../../utils/keyboards');

function getMondayOfWeek(date) {
  const d = new Date(date);
  const day = d.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().split('T')[0];
}

function formatNum(n, symbol) {
  const s = Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return symbol ? `${s} ${symbol}` : s;
}

function formatProgressHistory(records, symbol) {
  if (!records || records.length === 0) return '';
  let text = '\n📅 *Недели:*\n';
  records.slice(0, 5).forEach((r) => {
    const [, m, d] = r.week_start.split('-');
    const v = parseFloat(String(r.actual_value).replace(/[^\d.]/g, ''));
    const valStr = isNaN(v) ? String(r.actual_value) : formatNum(v, symbol);
    text += `  ${d}.${m}: *${valStr}*\n`;
  });
  return text.trimEnd();
}

function registerFinanceHandlers(bot) {
  // /finance — прогресс по всем спринтам с финансовой целью
  bot.command('finance', async (ctx) => {
    try {
      const { data: user } = await getUserByTelegramId(ctx.from.id);
      if (!user) {
        await ctx.reply('Профиль не найден. Используйте /start.');
        return;
      }

      const { data: allSprints } = await getAllSprints(user.id);
      const finSprints = (allSprints || []).filter((s) => s.financial_goal);

      if (finSprints.length === 0) {
        await ctx.reply(
          '💰 *Финансовые цели*\n\nФинансовые цели ещё не заданы.\n\n_Задайте финансовую цель в настройках спринта: 🎯 Спринты → ✏️ Редактировать → 💰 Изменить финцель_',
          { parse_mode: 'Markdown' }
        );
        return;
      }

      // Загружаем прогресс по каждому спринту с финцелью
      const sprintData = await Promise.all(
        finSprints.map(async (sprint) => {
          const goal = parseFinancialGoal(sprint.financial_goal);
          const { data: records } = await getFinancialProgress(user.id, sprint.id);
          const actual = (records || []).reduce((sum, r) => {
            const v = parseFloat(String(r.actual_value).replace(/[^\d.]/g, ''));
            return sum + (isNaN(v) ? 0 : v);
          }, 0);
          const pct = goal ? Math.min(100, Math.round((actual / goal.amount) * 100)) : 0;
          return { sprint, goal, records: records || [], actual, pct };
        })
      );

      let text = '💰 *Финансовые цели:*\n\n';
      const buttons = [];
      const chartItems = [];

      for (const { sprint, goal, records, actual, pct } of sprintData) {
        if (!goal) continue;
        const icon = sprint.status === 'active' ? '🟢' : '✅';
        const label = sprint.goal_text.length > 28 ? sprint.goal_text.slice(0, 25) + '…' : sprint.goal_text;

        text += `${icon} *${label}*\n`;
        text += formatFinProgressBar(actual, goal.amount, goal.symbol);
        text += formatProgressHistory(records, goal.symbol);
        text += '\n\n';

        chartItems.push({ label: sprint.goal_text.length > 12 ? sprint.goal_text.slice(0, 10) + '…' : sprint.goal_text, pct });
      }

      // Кнопка "Внести" только для активного спринта (первый активный с финцелью)
      const activeFin = sprintData.find((d) => d.sprint.status === 'active' && d.goal);
      if (activeFin) {
        const weekStart = getMondayOfWeek(new Date());
        buttons.push([Markup.button.callback('💰 Внести за эту неделю', `action_finance_input_${weekStart}`)]);
      }

      await ctx.reply(text.trimEnd(), {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(buttons),
      });

      // График если есть ≥2 спринта с финцелями
      if (chartItems.length >= 2) {
        const chartUrl = buildFinChartUrl(
          chartItems.map((c) => c.label),
          chartItems.map((c) => c.pct)
        );
        try {
          await ctx.replyWithPhoto(chartUrl, { caption: '📊 Достижение финцелей по спринтам' });
        } catch (chartErr) {
          console.error('[FINANCE] Chart error:', chartErr.message);
        }
      }

      console.log(`[FINANCE] /finance shown for user ${user.id}`);
    } catch (error) {
      console.error('[FINANCE] /finance error:', error.message);
      await ctx.reply('Ошибка при загрузке финансовых целей.');
    }
  });

  // Кнопка «Внести прогресс» — запускает ввод
  bot.action(/^action_finance_input_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    try {
      const { data: user } = await getUserByTelegramId(ctx.from.id);
      if (!user) return;

      const weekStart = ctx.match[1];
      const { data: allSprints } = await getAllSprints(user.id);
      const sprint = (allSprints || []).find((s) => s.status === 'active' && s.financial_goal);

      if (!sprint) {
        await ctx.reply('Нет активного спринта с финансовой целью.');
        return;
      }

      const goal = parseFinancialGoal(sprint.financial_goal);
      ctx.session.awaitingFinanceInput = { sprintId: sprint.id, weekStart };

      const symbolHint = goal ? ` в ${goal.symbol}` : '';
      await ctx.reply(
        `💰 *Финансовая цель:* ${sprint.financial_goal}\n\n` +
        `Введите сумму за эту неделю${symbolHint} (например: *150 000*):`,
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

  // Текстовый обработчик — сохраняет числовой прогресс
  bot.on('text', async (ctx, next) => {
    if (ctx.message.text.startsWith('/')) return next();
    if (KEYBOARD_BUTTONS.includes(ctx.message.text)) {
      if (ctx.session) ctx.session.awaitingFinanceInput = null;
      return next();
    }
    if (!ctx.session?.awaitingFinanceInput) return next();

    try {
      const { sprintId, weekStart } = ctx.session.awaitingFinanceInput;

      const raw = ctx.message.text.trim().replace(/[\s,]/g, '');
      const value = parseFloat(raw);
      if (isNaN(value) || value <= 0) {
        await ctx.reply('❌ Введите положительное число, например: *150 000*', { parse_mode: 'Markdown' });
        return; // keep session active
      }

      ctx.session.awaitingFinanceInput = null;

      const { data: user } = await getUserByTelegramId(ctx.from.id);
      if (!user) return next();

      await saveFinancialProgress(user.id, sprintId, weekStart, value);

      // Показываем прогресс после сохранения
      const { data: allSprints } = await getAllSprints(user.id);
      const sprint = (allSprints || []).find((s) => s.id === sprintId);
      const goal = sprint ? parseFinancialGoal(sprint.financial_goal) : null;

      const [, m, d] = weekStart.split('-');
      const valStr = goal ? formatNum(value, goal.symbol) : String(Math.round(value));

      let text = `✅ Прогресс сохранён!\n\n💰 Неделя с ${d}.${m}: *${valStr}*`;

      if (goal) {
        const { data: records } = await getFinancialProgress(user.id, sprintId);
        const total = (records || []).reduce((sum, r) => {
          const v = parseFloat(String(r.actual_value).replace(/[^\d.]/g, ''));
          return sum + (isNaN(v) ? 0 : v);
        }, 0);
        text += `\n\n${formatFinProgressBar(total, goal.amount, goal.symbol)}`;
      }

      await ctx.reply(text, { parse_mode: 'Markdown', ...persistentKeyboard });
      console.log(`[FINANCE] Progress saved for user ${user.id}: ${value}`);
    } catch (error) {
      console.error('[FINANCE] save error:', error.message);
      await ctx.reply('Ошибка при сохранении прогресса.');
    }
  });
}

module.exports = { registerFinanceHandlers };
