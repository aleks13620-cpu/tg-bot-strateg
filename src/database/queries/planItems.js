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
    .select('*, initiative:initiatives(id, title, sprint_id, sprint:sprints(id, goal_text))')
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

async function deletePlanItem(itemId) {
  const { error } = await supabase
    .from('plan_items')
    .delete()
    .eq('id', itemId);

  if (error) {
    console.error('[DB] Error deleting plan item:', error.message);
  }
  return { error };
}

async function createPlanItemsWithDetails(userId, date, items) {
  const rows = items.map((item) => ({
    user_id: userId,
    date: date,
    text_raw: item.text_raw,
    status: 'pending',
    is_strategic: item.is_strategic || false,
    initiative_id: item.initiative_id || null,
  }));

  const { data, error } = await supabase
    .from('plan_items')
    .insert(rows)
    .select();

  if (error) {
    console.error('[DB] Error creating plan items with details:', error.message);
  }
  return { data: data || [], error };
}

async function getPlanItemsByDateRange(userId, startDate, endDate) {
  const { data, error } = await supabase
    .from('plan_items')
    .select('*, initiative:initiatives(id, title)')
    .eq('user_id', userId)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[DB] Error getting plan items by range:', error.message);
    return { data: [], error };
  }
  return { data: data || [], error: null };
}

module.exports = {
  createPlanItem,
  createPlanItems,
  createPlanItemsWithDetails,
  getPlanItemsByDate,
  getPlanItemsByDateRange,
  updatePlanItem,
  getPlanItemById,
  deletePlanItem,
};
