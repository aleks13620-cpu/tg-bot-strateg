const { Markup } = require('telegraf');
const { supabase } = require('../../../config/database');

async function getStats() {
  const now = new Date().toISOString();
  const ago7  = new Date(Date.now() - 7  * 24 * 60 * 60 * 1000).toISOString();
  const ago30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [total, active7, active30, withSprint, topStreak] = await Promise.all([
    supabase.from('users').select('*', { count: 'exact', head: true }),
    supabase.from('users').select('*', { count: 'exact', head: true }).gt('last_active_at', ago7),
    supabase.from('users').select('*', { count: 'exact', head: true }).gt('last_active_at', ago30),
    supabase.from('sprints').select('user_id', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('users').select('streak_current').order('streak_current', { ascending: false }).limit(1).single(),
  ]);

  return {
    total:      total.count      ?? 0,
    active7:    active7.count    ?? 0,
    active30:   active30.count   ?? 0,
    withSprint: withSprint.count ?? 0,
    topStreak:  topStreak.data?.streak_current ?? 0,
  };
}

function formatStats(s) {
  const today = new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return (
    `📊 *Статистика бота* — ${today}\n\n` +
    `👥 Всего пользователей: *${s.total}*\n` +
    `🟢 Активных за 7 дней: *${s.active7}*\n` +
    `📅 Активных за 30 дней: *${s.active30}*\n` +
    `🎯 С активным спринтом: *${s.withSprint}*\n` +
    `🔥 Топ стрик: *${s.topStreak} дн.*`
  );
}

const refreshKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('🔄 Обновить', 'admin_stats_refresh')],
]);

function registerAdminHandlers(bot) {
  const adminId = process.env.ADMIN_TELEGRAM_ID;

  function isAdmin(ctx) {
    return adminId && String(ctx.from.id) === String(adminId);
  }

  bot.command('admin', async (ctx) => {
    if (!isAdmin(ctx)) return;
    try {
      const stats = await getStats();
      await ctx.reply(formatStats(stats), { parse_mode: 'Markdown', ...refreshKeyboard });
    } catch (err) {
      console.error('[ADMIN] Stats error:', err.message);
      await ctx.reply('Ошибка при загрузке статистики.');
    }
  });

  bot.action('admin_stats_refresh', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCbQuery();
    await ctx.answerCbQuery('Обновляю...');
    try {
      const stats = await getStats();
      await ctx.editMessageText(formatStats(stats), { parse_mode: 'Markdown', ...refreshKeyboard });
    } catch (err) {
      console.error('[ADMIN] Stats refresh error:', err.message);
    }
  });
}

module.exports = { registerAdminHandlers };
