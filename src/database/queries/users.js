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

/** Ключи в users.meta для восстановления шагов day close / weekly review после потери session */
const DAY_CLOSE_PENDING_META_KEYS = {
  coachingQuestionId: 'dc_coaching_question_id',
  actualTimeManualItemId: 'dc_actual_time_manual_item_id',
  weeklySimplifyItemId: 'dc_weekly_simplify_item_id',
  weeklyRescheduleItemId: 'dc_weekly_reschedule_item_id',
};

function getDayClosePendingFromMeta(meta) {
  const m = meta || {};
  const q = m[DAY_CLOSE_PENDING_META_KEYS.coachingQuestionId];
  const n = q != null && q !== '' ? Number(q) : NaN;
  return {
    coachingQuestionId: Number.isFinite(n) ? n : null,
    actualTimeManualItemId: m[DAY_CLOSE_PENDING_META_KEYS.actualTimeManualItemId] || null,
    weeklySimplifyItemId: m[DAY_CLOSE_PENDING_META_KEYS.weeklySimplifyItemId] || null,
    weeklyRescheduleItemId: m[DAY_CLOSE_PENDING_META_KEYS.weeklyRescheduleItemId] || null,
  };
}

async function mergeUserMeta(userId, mutator) {
  const { data, error } = await supabase
    .from('users')
    .select('meta')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('[DB] mergeUserMeta read:', error.message);
    return { error };
  }

  const meta = { ...(data?.meta || {}) };
  mutator(meta);

  const { error: upError } = await supabase
    .from('users')
    .update({ meta })
    .eq('id', userId);

  if (upError) {
    console.error('[DB] mergeUserMeta update:', upError.message);
  }
  return { error: upError };
}

async function setDayClosePendingField(userId, field, value) {
  const key = DAY_CLOSE_PENDING_META_KEYS[field];
  if (!key) {
    return { error: new Error(`Unknown day close pending field: ${field}`) };
  }
  return mergeUserMeta(userId, (meta) => {
    if (value == null || value === '') {
      delete meta[key];
    } else if (field === 'coachingQuestionId') {
      meta[key] = Number(value);
    } else {
      meta[key] = String(value);
    }
  });
}

async function clearDayClosePendingField(userId, field) {
  return setDayClosePendingField(userId, field, null);
}

async function clearAllDayClosePending(userId) {
  return mergeUserMeta(userId, (meta) => {
    Object.values(DAY_CLOSE_PENDING_META_KEYS).forEach((k) => {
      delete meta[k];
    });
  });
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

/**
 * Показывать ли алерт сегодня (не чаще 1 раза в день по ключу).
 * Если нужно показать — сразу помечает как показанный и возвращает true.
 */
async function shouldShowDailyAlert(userId, key, date) {
  const { data, error } = await supabase
    .from('users')
    .select('meta')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('[DB] shouldShowDailyAlert read:', error.message);
    return false;
  }

  const meta = data?.meta || {};
  if (meta[key] === date) return false;

  const { error: upError } = await supabase
    .from('users')
    .update({ meta: { ...meta, [key]: date } })
    .eq('id', userId);

  if (upError) {
    console.error('[DB] shouldShowDailyAlert update:', upError.message);
    return false;
  }

  return true;
}

module.exports = {
  findOrCreateUser,
  getUserByTelegramId,
  touchUserActivity,
  checkHintAndMark,
  setPendingPlanDate,
  clearPendingPlanDate,
  updateUserSettings,
  getDayClosePendingFromMeta,
  setDayClosePendingField,
  clearDayClosePendingField,
  clearAllDayClosePending,
  shouldShowDailyAlert,
};
