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

module.exports = { findOrCreateUser, getUserByTelegramId, touchUserActivity };
