const { supabase } = require('../../../config/database');

async function createPlanItem(userId, date, textRaw) {
  const { data, error } = await supabase
    .from('plan_items')
    .insert({
      user_id: userId,
      date: date,
      text_raw: textRaw,
      status: 'pending',
      is_strategic: false,
    })
    .select()
    .single();

  if (error) {
    console.error('[DB] Error creating plan item:', error.message);
  }
  return { data, error };
}

async function createPlanItems(userId, date, texts) {
  const rows = texts.map((text) => ({
    user_id: userId,
    date: date,
    text_raw: text,
    status: 'pending',
    is_strategic: false,
  }));

  const { data, error } = await supabase
    .from('plan_items')
    .insert(rows)
    .select();

  if (error) {
    console.error('[DB] Error creating plan items:', error.message);
  }
  return { data: data || [], error };
}

async function getPlanItemsByDate(userId, date) {
  const { data, error } = await supabase
    .from('plan_items')
    .select('*')
    .eq('user_id', userId)
    .eq('date', date)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[DB] Error getting plan items:', error.message);
    return { data: [], error };
  }
  return { data: data || [], error: null };
}

async function updatePlanItem(itemId, updates) {
  const { data, error } = await supabase
    .from('plan_items')
    .update(updates)
    .eq('id', itemId)
    .select()
    .single();

  if (error) {
    console.error('[DB] Error updating plan item:', error.message);
  }
  return { data, error };
}

async function getPlanItemById(itemId) {
  const { data, error } = await supabase
    .from('plan_items')
    .select('*')
    .eq('id', itemId)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('[DB] Error getting plan item:', error.message);
    return { data: null, error };
  }
  return { data: data || null, error: null };
}

module.exports = {
  createPlanItem,
  createPlanItems,
  getPlanItemsByDate,
  updatePlanItem,
  getPlanItemById,
};
