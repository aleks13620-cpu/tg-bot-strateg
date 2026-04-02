const { Scenes, Markup } = require('telegraf');
const { KEYBOARD_BUTTONS } = require('../../utils/keyboards');

function switchBtn() {
  return Markup.button.callback('↔ Переключить ветку', 'ft_switch');
}

function cancelBtn() {
  return Markup.button.callback('❌ Отмена', 'ft_cancel');
}

function ctaButtons() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('📋 Добавить задачи', 'action_plan_add')],
    [Markup.button.callback('🏠 Меню', 'action_open_main_menu')],
  ]);
}

function parseBullets(text, limit = 5) {
  return text
    .split(/\n|,/g)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, limit);
}

const firstTouchScene = new Scenes.WizardScene(
  'first_touch',

  // Step 0 — goal
  async (ctx) => {
    await ctx.reply(
      '🎯 *Первый шаг*\n\n' +
        'Какую цель вы хотите держать в фокусе в ближайшие 2 недели?\n' +
        '_Одна фраза, результат._',
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[cancelBtn()]]),
      }
    );
    ctx.wizard.state.goal = null;
    ctx.wizard.state.branch = null; // 'strategy' | 'no_strategy'
    ctx.wizard.state.points = [];
    ctx.wizard.state.area = null;
    ctx.wizard.state.bandwidth = null;
    return ctx.wizard.next();
  },

  // Step 1 — capture goal (text) then screen branch
  async (ctx) => {
    if (ctx.callbackQuery) {
      const data = ctx.callbackQuery.data;
      await ctx.answerCbQuery();
      if (data === 'ft_cancel') {
        await ctx.reply('Ок, отменил. Вернуться можно через /start.', ctaButtons());
        return ctx.scene.leave();
      }
      return;
    }

    if (!ctx.message?.text) return;
    if (ctx.message.text.startsWith('/')) return ctx.scene.leave();
    if (KEYBOARD_BUTTONS.includes(ctx.message.text)) return ctx.scene.leave();

    ctx.wizard.state.goal = ctx.message.text.trim();

    await ctx.reply(
      `✅ Цель: *${ctx.wizard.state.goal}*\n\n` +
        'У вас уже есть стратегия и понятные инициативы, куда менять ситуацию?',
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('Да, есть', 'ft_branch_strategy')],
          [Markup.button.callback('Нет, хочу определить', 'ft_branch_no_strategy')],
          [cancelBtn()],
        ]),
      }
    );
    return ctx.wizard.next();
  },

  // Step 2 — branch selection
  async (ctx) => {
    if (!ctx.callbackQuery) return;
    const data = ctx.callbackQuery.data;
    await ctx.answerCbQuery();

    if (data === 'ft_cancel') {
      await ctx.reply('Ок, отменил. Вернуться можно через /start.', ctaButtons());
      return ctx.scene.leave();
    }

    if (data === 'ft_branch_strategy') {
      ctx.wizard.state.branch = 'strategy';
      await ctx.reply(
        'Ок.\n\n' +
          'Назовите до 5 точек изменений (что именно хотите поменять).\n' +
          'Можно списком, с новой строки или через запятую.',
        {
          ...Markup.inlineKeyboard([[switchBtn()], [cancelBtn()]]),
        }
      );
      return ctx.wizard.next(); // step 3
    }

    if (data === 'ft_branch_no_strategy') {
      ctx.wizard.state.branch = 'no_strategy';
      await ctx.reply(
        'Ок. Быстрый скрининг — выберите, что сейчас важнее всего.',
        {
          ...Markup.inlineKeyboard([
            [Markup.button.callback('Продажи', 'ft_area_sales')],
            [Markup.button.callback('Продукт', 'ft_area_product')],
            [Markup.button.callback('Команда', 'ft_area_team')],
            [Markup.button.callback('Финансы', 'ft_area_finance')],
            [Markup.button.callback('Личное', 'ft_area_personal')],
            [switchBtn()],
            [cancelBtn()],
          ]),
        }
      );
      return ctx.wizard.selectStep(4); // jump to no-strategy step
    }
  },

  // Step 3 — strategy branch: collect change points
  async (ctx) => {
    if (ctx.callbackQuery) {
      const data = ctx.callbackQuery.data;
      await ctx.answerCbQuery();
      if (data === 'ft_switch') {
        ctx.wizard.state.branch = 'no_strategy';
        await ctx.reply(
          'Переключаю ветку.\n\nВыберите, что сейчас важнее всего.',
          {
            ...Markup.inlineKeyboard([
              [Markup.button.callback('Продажи', 'ft_area_sales')],
              [Markup.button.callback('Продукт', 'ft_area_product')],
              [Markup.button.callback('Команда', 'ft_area_team')],
              [Markup.button.callback('Финансы', 'ft_area_finance')],
              [Markup.button.callback('Личное', 'ft_area_personal')],
              [switchBtn()],
              [cancelBtn()],
            ]),
          }
        );
        return ctx.wizard.selectStep(4);
      }
      if (data === 'ft_cancel') {
        await ctx.reply('Ок, отменил. Вернуться можно через /start.', ctaButtons());
        return ctx.scene.leave();
      }
      return;
    }

    if (!ctx.message?.text) return;
    if (ctx.message.text.startsWith('/')) return ctx.scene.leave();
    if (KEYBOARD_BUTTONS.includes(ctx.message.text)) return ctx.scene.leave();

    const points = parseBullets(ctx.message.text, 5);
    ctx.wizard.state.points = points;

    if (points.length === 0) {
      await ctx.reply('Не увидел пунктов. Напишите 1–5 точек изменений текстом.');
      return;
    }

    const buttons = points.map((p, idx) => [
      Markup.button.callback(`${idx + 1}. ${p.length > 30 ? p.slice(0, 27) + '…' : p}`, `ft_pick_point_${idx}`),
    ]);
    buttons.push([switchBtn()]);
    buttons.push([cancelBtn()]);

    await ctx.reply('Выберите одну точку, с которой начнём:', Markup.inlineKeyboard(buttons));
    return ctx.wizard.next(); // step 4 (strategy point pick)
  },

  // Step 4 — strategy point pick OR no-strategy area pick
  async (ctx) => {
    if (!ctx.callbackQuery) return;
    const data = ctx.callbackQuery.data;
    await ctx.answerCbQuery();

    if (data === 'ft_cancel') {
      await ctx.reply('Ок, отменил. Вернуться можно через /start.', ctaButtons());
      return ctx.scene.leave();
    }

    if (data === 'ft_switch') {
      // toggle
      if (ctx.wizard.state.branch === 'strategy') {
        ctx.wizard.state.branch = 'no_strategy';
        await ctx.reply(
          'Переключаю ветку.\n\nВыберите, что сейчас важнее всего.',
          {
            ...Markup.inlineKeyboard([
              [Markup.button.callback('Продажи', 'ft_area_sales')],
              [Markup.button.callback('Продукт', 'ft_area_product')],
              [Markup.button.callback('Команда', 'ft_area_team')],
              [Markup.button.callback('Финансы', 'ft_area_finance')],
              [Markup.button.callback('Личное', 'ft_area_personal')],
              [switchBtn()],
              [cancelBtn()],
            ]),
          }
        );
        return; // remain on this step, but now expects area callbacks
      }
      // from no-strategy to strategy
      ctx.wizard.state.branch = 'strategy';
      await ctx.reply(
        'Переключаю ветку.\n\nНазовите до 5 точек изменений (списком).',
        { ...Markup.inlineKeyboard([[switchBtn()], [cancelBtn()]]) }
      );
      return ctx.wizard.selectStep(3);
    }

    // no-strategy area
    if (data.startsWith('ft_area_')) {
      const map = {
        ft_area_sales: 'Продажи',
        ft_area_product: 'Продукт',
        ft_area_team: 'Команда',
        ft_area_finance: 'Финансы',
        ft_area_personal: 'Личное',
      };
      ctx.wizard.state.branch = 'no_strategy';
      ctx.wizard.state.area = map[data] || null;
      await ctx.reply(
        `Ок, фокус: *${ctx.wizard.state.area}*.\n\nСколько ресурса сейчас реально есть на это в день?`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('15–30 мин', 'ft_bw_30')],
            [Markup.button.callback('30–60 мин', 'ft_bw_60')],
            [Markup.button.callback('1–2 часа', 'ft_bw_120')],
            [Markup.button.callback('2+ часа', 'ft_bw_999')],
            [switchBtn()],
            [cancelBtn()],
          ]),
        }
      );
      return ctx.wizard.next(); // step 5 (bandwidth)
    }

    // strategy point pick
    if (data.startsWith('ft_pick_point_')) {
      ctx.wizard.state.branch = 'strategy';
      const idx = parseInt(data.replace('ft_pick_point_', ''), 10);
      const point = ctx.wizard.state.points?.[idx];
      if (!point) return;

      ctx.wizard.state.point = point;

      const steps = [
        `1) Определите “готово”: как выглядит результат по «${point}»`,
        `2) Выберите один следующий контакт/действие на 15–30 минут`,
        '3) Заблокируйте слот в календаре',
        '4) Подготовьте один артефакт (сообщение/черновик/список)',
      ];

      await ctx.reply(
        `✅ Выбрано: *${point}*\n\n` +
          'Вот 3–4 ближайших шага (коротко):\n' +
          steps.map((s) => `• ${s}`).join('\n') +
          '\n\nДальше — добавим 1–3 задачи в план.',
        { parse_mode: 'Markdown', ...ctaButtons() }
      );
      return ctx.scene.leave();
    }
  },

  // Step 5 — no-strategy bandwidth => output + CTA
  async (ctx) => {
    if (!ctx.callbackQuery) return;
    const data = ctx.callbackQuery.data;
    await ctx.answerCbQuery();

    if (data === 'ft_cancel') {
      await ctx.reply('Ок, отменил. Вернуться можно через /start.', ctaButtons());
      return ctx.scene.leave();
    }
    if (data === 'ft_switch') {
      ctx.wizard.state.branch = 'strategy';
      await ctx.reply(
        'Переключаю ветку.\n\nНазовите до 5 точек изменений (списком).',
        { ...Markup.inlineKeyboard([[switchBtn()], [cancelBtn()]]) }
      );
      return ctx.wizard.selectStep(3);
    }

    const bwMap = { ft_bw_30: '15–30 мин', ft_bw_60: '30–60 мин', ft_bw_120: '1–2 часа', ft_bw_999: '2+ часа' };
    const bw = bwMap[data];
    if (!bw) return;
    ctx.wizard.state.bandwidth = bw;

    const area = ctx.wizard.state.area || 'Фокус';
    const goal = ctx.wizard.state.goal || 'цель';

    await ctx.reply(
      `✅ Понял.\n\n` +
        `🎯 Цель: *${goal}*\n` +
        `📌 Область: *${area}*\n` +
        `⏱ Ресурс: *${bw} в день*\n\n` +
        'Первое полезное действие на сегодня:\n' +
        `• добавьте *1–3 задачи* по области «${area}»\n\n` +
        'Дальше бот поможет держать фокус и закрывать день.',
      { parse_mode: 'Markdown', ...ctaButtons() }
    );

    return ctx.scene.leave();
  }
);

module.exports = { firstTouchScene };

