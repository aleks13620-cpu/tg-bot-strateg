const { supabase } = require('../../../config/database');

async function findOrCreateUser(telegramId) {
  const { data: existing, error: findError } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', telegramId)
    .single();

  // PGRST116 = "not found" — нормальная ситуация для нового пользователя
  if (findError && findError.code !== 'PGRST116') {
    console.error('[DB] Error finding user:', findError.message);
    return { data: null, error: findError };
  }

  if (existing) {
    return { data: existing, error: null };
  }

  const { data: newUser, error: createError } = await supabase
    .from('users')
    .insert({ telegram_id: telegramId })
    .select()
    .single();

  if (createError) {
    console.error('[DB] Error creating user:', createError.message);
  }

  return { data: newUser, error: createError };
}

async function getUserByTelegramId(telegramId) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', telegramId)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('[DB] Error getting user:', error.message);
    return { data: null, error };
  }

  return { data: data || null, error: null };
}

async function touchUserActivity(userId) {
  await supabase
    .from('users')
    .update({ last_active_at: new Date().toISOString() })
    .eq('id', userId);
}

/**
 * Проверяет, была ли подсказка уже показана.
 * Если нет — помечает как показанную (fire & forget) и возвращает true.
 * Если уже показана — возвращает false.
 */
async function checkHintAndMark(userId, key) {
  const { data } = await supabase
    .from('users')
    .select('meta')
    .eq('id', userId)
    .single();

  const meta = data?.meta || {};
  if (meta[key]) return false;

  // Помечаем как показанную (fire & forget — не блокируем ответ)
  supabase
    .from('users')
    .update({ meta: { ...meta, [key]: true } })
    .eq('id', userId)
    .then(() => {});

  return true;
}

// Сохраняет ожидающую дату для ввода задач (fire & forget, для serverless-совместимости)
function setPendingPlanDate(userId, date) {
  supabase.from('users').select('meta').eq('id', userId).single()
    .then(({ data }) => {
      const meta = data?.meta || {};
      return supabase.from('users').update({ meta: { ...meta, pendingPlanDate: date } }).eq('id', userId);
    })
    .catch(() => {});
}

// Сбрасывает ожидающую дату после обработки задач (fire & forget)
function clearPendingPlanDate(userId) {
  supabase.from('users').select('meta').eq('id', userId).single()
    .then(({ data }) => {
      const meta = { ...(data?.meta || {}) };
      delete meta.pendingPlanDate;
      return supabase.from('users').update({ meta }).eq('id', userId);
    })
    .catch(() => {});
}

async function updateUserSettings(userId, { reminderMorning, reminderEvening, remindersEnabled, timezone } = {}) {
  const updates = {};
  if (reminderMorning  !== undefined) updates.reminder_morning   = reminderMorning;
  if (reminderEvening  !== undefined) updates.reminder_evening   = reminderEvening;
  if (remindersEnabled !== undefined) updates.reminders_enabled  = remindersEnabled;
  if (timezone         !== undefined) updates.timezone           = timezone;

  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();

  if (error) {
    console.error('[DB] Error updating user settings:', error.message);
  }
  return { data, error };
}

module.exports = { findOrCreateUser, getUserByTelegramId, touchUserActivity, checkHintAndMark, setPendingPlanDate, clearPendingPlanDate, updateUserSettings };
