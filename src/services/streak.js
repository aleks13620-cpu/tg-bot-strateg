const { supabase } = require('../../config/database');
const { getPreviousCalendarDay } = require('../utils/userCalendarDate');

/**
 * Обновляет стрик пользователя при закрытии дня.
 * Вызывается только если done > 0.
 * Возвращает { streak, isNew } или null при ошибке.
 */
async function updateStreak(userId, closeDate) {
  const { data: user, error } = await supabase
    .from('users')
    .select('streak_current, streak_max, last_close_date')
    .eq('id', userId)
    .single();

  if (error || !user) {
    console.error('[STREAK] Error loading user:', error?.message);
    return null;
  }

  const lastClose = user.last_close_date;

  // Если уже закрывали сегодня — не обновляем
  if (lastClose === closeDate) {
    return { streak: user.streak_current || 0, isNew: false };
  }

  let newStreak;
  if (lastClose && lastClose === getPreviousCalendarDay(closeDate)) {
    // Вчера тоже закрывали — продолжаем стрик
    newStreak = (user.streak_current || 0) + 1;
  } else {
    // Пропустили день(и) — стрик сбрасывается
    newStreak = 1;
  }

  const newMax = Math.max(newStreak, user.streak_max || 0);

  const { error: updateError } = await supabase
    .from('users')
    .update({
      streak_current: newStreak,
      streak_max: newMax,
      last_close_date: closeDate,
    })
    .eq('id', userId);

  if (updateError) {
    console.error('[STREAK] Error updating streak:', updateError.message);
    return null;
  }

  console.log(`[STREAK] User ${userId}: streak=${newStreak}, max=${newMax}`);
  return { streak: newStreak, isNew: true };
}

/**
 * Возвращает информацию о стрике пользователя.
 */
async function getStreakInfo(userId) {
  const { data: user, error } = await supabase
    .from('users')
    .select('streak_current, streak_max')
    .eq('id', userId)
    .single();

  if (error || !user) return { current: 0, max: 0 };
  return {
    current: user.streak_current || 0,
    max: user.streak_max || 0,
  };
}

module.exports = { updateStreak, getStreakInfo };
