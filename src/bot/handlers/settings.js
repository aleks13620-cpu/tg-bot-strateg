const { Markup } = require('telegraf');
const { getUserByTelegramId, updateUserSettings } = require('../../database/queries/users');
const { KEYBOARD_BUTTONS } = require('../../utils/keyboards');

const TIMEZONES = [
  { label: 'Москва (UTC+3)',      tz: 'Europe/Moscow' },
  { label: 'Киев (UTC+2/+3)',     tz: 'Europe/Kiev' },
  { label: 'Минск (UTC+3)',       tz: 'Europe/Minsk' },
  { label: 'Алматы (UTC+5)',      tz: 'Asia/Almaty' },
  { label: 'Новосибирск (UTC+7)', tz: 'Asia/Novosibirsk' },
  { label: 'Владивосток (UTC+10)', tz: 'Asia/Vladivostok' },
];

function buildSettingsMenu(user) {
  const morning  = user.reminder_morning  || '08:00';
  const evening  = user.reminder_evening  || '18:00';
  const enabled  = user.reminders_enabled !== false;
  const tz       = user.timezone || 'Europe/Moscow';

  const text =
    `⚙️ *Настройки напоминаний*\n\n` +
    `🌅 Утро: *${morning}*\n` +
    `🌆 Вечер: *${evening}*\n` +
    `🌍 Часовой пояс: *${tz}*\n` +
    `🔔 Напоминания: *${enabled ? 'включены' : 'выключены'}*`;

  const buttons = [
    [Markup.button.callback(`🌅 Изменить утро (${morning})`, 'settings_morning')],
    [Markup.button.callback(`🌆 Изменить вечер (${evening})`, 'settings_evening')],
    [Markup.button.callback('🌍 Часовой пояс', 'settings_timezone')],
    [Markup.button.callback(enabled ? '🔕 Выключить напоминания' : '🔔 Включить напоминания', 'settings_toggle_reminders')],
  ];

  return { text, keyboard: Markup.inlineKeyboard(buttons) };
}

function registerSettingsHandlers(bot) {

  // /settings
  bot.command('settings', async (ctx) => {
    const { data: user } = await getUserByTelegramId(ctx.from.id);
    if (!user) return ctx.reply('Используйте /start.');
    const { text, keyboard } = buildSettingsMenu(user);
    await ctx.reply(text, { parse_mode: 'Markdown', ...keyboard });
  });

  // Кнопка ⚙️ из главного меню (перехватывает заглушку из start.js)
  bot.action('action_settings', async (ctx) => {
    await ctx.answerCbQuery();
    const { data: user } = await getUserByTelegramId(ctx.from.id);
    if (!user) return;
    const { text, keyboard } = buildSettingsMenu(user);
    await ctx.reply(text, { parse_mode: 'Markdown', ...keyboard });
  });

  // Изменить время утра
  bot.action('settings_morning', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session.awaitingMorningTime = true;
    delete ctx.session.awaitingEveningTime;
    await ctx.reply(
      '🌅 Выберите время утреннего напоминания или введите своё (формат ЧЧ:ММ):',
      Markup.inlineKeyboard([
        [
          Markup.button.callback('7:00',  'settings_morning_700'),
          Markup.button.callback('8:00',  'settings_morning_800'),
          Markup.button.callback('9:00',  'settings_morning_900'),
          Markup.button.callback('10:00', 'settings_morning_1000'),
        ],
      ])
    );
  });

  // Изменить время вечера
  bot.action('settings_evening', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session.awaitingEveningTime = true;
    delete ctx.session.awaitingMorningTime;
    await ctx.reply(
      '🌆 Выберите время вечернего напоминания или введите своё (формат ЧЧ:ММ):',
      Markup.inlineKeyboard([
        [
          Markup.button.callback('17:00', 'settings_evening_1700'),
          Markup.button.callback('18:00', 'settings_evening_1800'),
          Markup.button.callback('19:00', 'settings_evening_1900'),
          Markup.button.callback('20:00', 'settings_evening_2000'),
        ],
      ])
    );
  });

  // Быстрый выбор времени утра
  bot.action(/^settings_morning_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const raw = ctx.match[1]; // "800" → "8:00"
    const time = raw.length === 3 ? `${raw[0]}:${raw.slice(1)}` : `${raw.slice(0, 2)}:${raw.slice(2)}`;
    await saveTimeSetting(ctx, 'morning', time);
  });

  // Быстрый выбор времени вечера
  bot.action(/^settings_evening_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const raw = ctx.match[1];
    const time = `${raw.slice(0, 2)}:${raw.slice(2)}`;
    await saveTimeSetting(ctx, 'evening', time);
  });

  // Часовой пояс
  bot.action('settings_timezone', async (ctx) => {
    await ctx.answerCbQuery();
    const buttons = TIMEZONES.map((t) => [
      Markup.button.callback(t.label, `settings_tz_${t.tz.replace('/', '_')}`),
    ]);
    await ctx.reply('🌍 Выберите часовой пояс:', Markup.inlineKeyboard(buttons));
  });

  bot.action(/^settings_tz_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const tzRaw = ctx.match[1].replace('_', '/');
    // Восстанавливаем полный tz (Asia/Almaty имеет один /, Europe/Moscow тоже)
    const found = TIMEZONES.find((t) => t.tz.replace('/', '_') === ctx.match[1]);
    const tz = found ? found.tz : tzRaw;

    const { data: user } = await getUserByTelegramId(ctx.from.id);
    if (!user) return;
    await updateUserSettings(user.id, { timezone: tz });
    await ctx.reply(`✅ Часовой пояс: *${tz}*`, { parse_mode: 'Markdown' });
  });

  // Включить/выключить напоминания
  bot.action('settings_toggle_reminders', async (ctx) => {
    await ctx.answerCbQuery();
    const { data: user } = await getUserByTelegramId(ctx.from.id);
    if (!user) return;
    const newVal = !(user.reminders_enabled !== false);
    await updateUserSettings(user.id, { remindersEnabled: newVal });
    await ctx.reply(newVal ? '🔔 Напоминания *включены*.' : '🔕 Напоминания *выключены*.', { parse_mode: 'Markdown' });
  });

  // Текстовый ввод времени
  bot.on('text', async (ctx, next) => {
    if (ctx.message.text.startsWith('/')) return next();
    if (KEYBOARD_BUTTONS.includes(ctx.message.text)) {
      delete ctx.session.awaitingMorningTime;
      delete ctx.session.awaitingEveningTime;
      return next();
    }

    if (ctx.session?.awaitingMorningTime) {
      const time = parseTimeHHMM(ctx.message.text);
      if (!time) {
        await ctx.reply('Неверный формат. Введите время как ЧЧ:ММ, например: *09:30*', { parse_mode: 'Markdown' });
        return;
      }
      await saveTimeSetting(ctx, 'morning', time);
      return;
    }

    if (ctx.session?.awaitingEveningTime) {
      const time = parseTimeHHMM(ctx.message.text);
      if (!time) {
        await ctx.reply('Неверный формат. Введите время как ЧЧ:ММ, например: *19:00*', { parse_mode: 'Markdown' });
        return;
      }
      await saveTimeSetting(ctx, 'evening', time);
      return;
    }

    return next();
  });
}

async function saveTimeSetting(ctx, type, time) {
  const { data: user } = await getUserByTelegramId(ctx.from.id);
  if (!user) return;

  const field = type === 'morning' ? { reminderMorning: time } : { reminderEvening: time };
  await updateUserSettings(user.id, field);

  delete ctx.session.awaitingMorningTime;
  delete ctx.session.awaitingEveningTime;

  const label = type === 'morning' ? '🌅 Утреннее' : '🌆 Вечернее';
  await ctx.reply(`✅ ${label} напоминание: *${time}*`, { parse_mode: 'Markdown' });
}

function parseTimeHHMM(text) {
  const match = text.trim().match(/^(\d{1,2})[:\.](\d{2})$/);
  if (!match) return null;
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

module.exports = { registerSettingsHandlers };
