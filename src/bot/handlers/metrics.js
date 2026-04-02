const { Markup } = require('telegraf');
const { getActiveSprints } = require('../../database/queries/sprints');
const { createGoalMetric, getGoalMetricsBySprint, getGoalMetricById, updateGoalMetricValue } = require('../../database/queries/goalMetrics');
const { getUserByTelegramId } = require('../../database/queries/users');
const { formatMetricsBlock } = require('../../services/analytics');

const UNIT_LABELS = { num: '🔢 Штуки', rub: '💰 Рубли', pct: '📊 Проценты', bool: '✅ Да/Нет' };
const UNIT_CODES = { sht: 'num', rub: 'rub', pct: 'pct', bool: 'bool' };

async function showMetrics(ctx, userId) {
  const { data: sprints } = await getActiveSprints(userId);
  const sprint = sprints.find((s) => s.type === 'monthly_goal');

  if (!sprint) {
    return ctx.reply(
      '📊 У вас нет активной 30-дневной цели.\n\nСоздайте её через *"🚀 Создать спринт"* → *"🎯 30-дневная цель"*.',
      { parse_mode: 'Markdown' }
    );
  }

  const { data: metrics } = await getGoalMetricsBySprint(sprint.id);

  let text = `📊 *Метрики цели:*\n_${sprint.goal_text}_\n\n`;
  text += metrics.length > 0 ? formatMetricsBlock(metrics) : '_Метрики не добавлены._';

  const buttons = metrics.map((m) => [
    Markup.button.callback(`✏️ ${m.title.slice(0, 28)}`, `metric_update_${m.id}`),
  ]);

  if (metrics.length < 3) {
    buttons.push([Markup.button.callback('➕ Добавить метрику', `metric_add_${sprint.id}`)]);
  }

  await ctx.reply(text, {
    parse_mode: 'Markdown',
    ...(buttons.length > 0 ? Markup.inlineKeyboard(buttons) : {}),
  });
}

function registerMetricsHandlers(bot) {

  // /metrics
  bot.command('metrics', async (ctx) => {
    const { data: user } = await getUserByTelegramId(ctx.from.id);
    if (!user) return ctx.reply('Используйте /start для начала работы.');
    await showMetrics(ctx, user.id);
  });

  // action_metrics — вход из меню
  bot.action('action_metrics', async (ctx) => {
    await ctx.answerCbQuery();
    const { data: user } = await getUserByTelegramId(ctx.from.id);
    if (!user) return;
    await showMetrics(ctx, user.id);
  });

  // metric_add_SPRINTID — начать добавление метрики
  bot.action(/^metric_add_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const sprintId = ctx.match[1];

    const { data: metrics } = await getGoalMetricsBySprint(sprintId);
    if (metrics.length >= 3) {
      return ctx.reply('Максимум 3 метрики на цель.');
    }

    ctx.session.awaitingMetricTitle = sprintId;
    delete ctx.session.awaitingMetricTarget;
    delete ctx.session.awaitingMetricInput;

    await ctx.reply(
      `📝 *Метрика ${metrics.length + 1}/3 — Название*\n\nКак называется метрика?\n_Примеры: "Выручка", "Новые клиенты", "Звонков сделано"_`,
      { parse_mode: 'Markdown' }
    );
  });

  // metric_skip_add — пропустить добавление метрик
  bot.action('metric_skip_add', async (ctx) => {
    await ctx.answerCbQuery();
    delete ctx.session.awaitingMetricTitle;
    delete ctx.session.awaitingMetricTarget;
    delete ctx.session.awaitingMetricInput;
    await ctx.reply('✅ Готово! Метрики можно добавить позже командой /metrics.');
  });

  // metric_update_METRICID — начать обновление значения
  bot.action(/^metric_update_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const metricId = ctx.match[1];

    const { data: metric } = await getGoalMetricById(metricId);
    if (!metric) return ctx.reply('Метрика не найдена.');

    ctx.session.awaitingMetricInput = { metricId, unit: metric.unit };
    delete ctx.session.awaitingMetricTitle;
    delete ctx.session.awaitingMetricTarget;

    if (metric.unit === 'bool') {
      await ctx.reply(
        `✏️ *${metric.title}* — выберите значение:`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback('✅ Да', `metric_bool_1_${metricId}`),
              Markup.button.callback('❌ Нет', `metric_bool_0_${metricId}`),
            ],
          ]),
        }
      );
    } else {
      const unitLabel = { num: 'число', rub: 'сумму в ₽', pct: 'процент (0–100)' };
      await ctx.reply(
        `✏️ *${metric.title}* — введите ${unitLabel[metric.unit] || 'значение'}:`,
        { parse_mode: 'Markdown' }
      );
    }
  });

  // metric_bool_VALUE_METRICID
  bot.action(/^metric_bool_([01])_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const value = Number(ctx.match[1]);
    const metricId = ctx.match[2];

    await updateGoalMetricValue(metricId, value);
    delete ctx.session.awaitingMetricInput;

    await ctx.reply(`✅ Обновлено: ${value === 1 ? 'Да' : 'Нет'}`);
  });

  // unit selection — metric_unit_CODE_SPRINTID
  bot.action(/^metric_unit_(sht|rub|pct|bool)_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const unitCode = ctx.match[1];
    const sprintId = ctx.match[2];
    const unit = UNIT_CODES[unitCode];

    const state = ctx.session.awaitingMetricTarget;
    if (!state) return ctx.reply('Сессия устарела. Начните заново через /metrics.');

    const { title, targetValue } = state;
    const finalTarget = unit === 'bool' ? null : targetValue;

    const { data: metric, error } = await createGoalMetric(sprintId, title, finalTarget, unit);
    delete ctx.session.awaitingMetricTarget;

    if (error) return ctx.reply('Ошибка при сохранении метрики.');

    const { data: metrics } = await getGoalMetricsBySprint(sprintId);
    const canAddMore = metrics.length < 3;

    let text = `✅ Метрика *"${metric.title}"* добавлена!`;
    if (finalTarget) text += `\nЦель: ${finalTarget} ${unit === 'rub' ? '₽' : unit === 'pct' ? '%' : 'шт.'}`;

    await ctx.reply(text, {
      parse_mode: 'Markdown',
      ...(canAddMore
        ? Markup.inlineKeyboard([
            [Markup.button.callback('➕ Добавить ещё', `metric_add_${sprintId}`)],
            [Markup.button.callback('✅ Готово', 'metric_skip_add')],
          ])
        : {}),
    });

    if (!canAddMore) {
      await ctx.reply('Достигнут максимум метрик (3). Просмотр: /metrics');
    }
  });

  // Текстовые ответы для добавления/обновления метрик — регистрируется в registerPlanHandlers через сессию
  // Здесь регистрируем через отдельный text middleware
  bot.on('text', async (ctx, next) => {
    const text = ctx.message.text.trim();

    // Шаг 1: ожидаем название метрики
    if (ctx.session.awaitingMetricTitle) {
      const sprintId = ctx.session.awaitingMetricTitle;
      delete ctx.session.awaitingMetricTitle;

      ctx.session.awaitingMetricTarget = { sprintId, title: text };

      await ctx.reply(
        `📝 *${text}* — какое целевое значение?\n\n_Введите число (или 0, если цель не числовая):_`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // Шаг 2: ожидаем целевое значение
    if (ctx.session.awaitingMetricTarget) {
      const targetValue = parseFloat(text.replace(',', '.'));
      if (isNaN(targetValue)) {
        await ctx.reply('Введите число, например: 500000');
        return;
      }

      const { sprintId, title } = ctx.session.awaitingMetricTarget;
      ctx.session.awaitingMetricTarget = { sprintId, title, targetValue };

      await ctx.reply(
        `📝 Единица измерения для *"${title}"*:`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback('🔢 Штуки', `metric_unit_sht_${sprintId}`),
              Markup.button.callback('💰 Рубли', `metric_unit_rub_${sprintId}`),
            ],
            [
              Markup.button.callback('📊 Проценты', `metric_unit_pct_${sprintId}`),
              Markup.button.callback('✅ Да/Нет', `metric_unit_bool_${sprintId}`),
            ],
          ]),
        }
      );
      return;
    }

    // Обновление значения метрики
    if (ctx.session.awaitingMetricInput) {
      const { metricId, unit } = ctx.session.awaitingMetricInput;
      const value = parseFloat(text.replace(',', '.'));

      if (isNaN(value)) {
        await ctx.reply('Введите число.');
        return;
      }

      if (unit === 'pct' && (value < 0 || value > 100)) {
        await ctx.reply('Для процентов введите число от 0 до 100.');
        return;
      }

      await updateGoalMetricValue(metricId, value);
      delete ctx.session.awaitingMetricInput;

      const unitLabel = { num: ' шт.', rub: ' ₽', pct: '%' };
      await ctx.reply(`✅ Значение обновлено: ${value}${unitLabel[unit] || ''}`);
      return;
    }

    return next();
  });
}

module.exports = { registerMetricsHandlers };
