const { supabase } = require('../../../config/database');

async function saveFinancialProgress(userId, sprintId, weekStart, actualValue) {
  const { data, error } = await supabase
    .from('financial_progress')
    .insert({ user_id: userId, sprint_id: sprintId, week_start: weekStart, actual_value: actualValue })
    .select()
    .single();

  if (error) {
    console.error('[DB] Error saving financial progress:', error.message);
  }
  return { data, error };
}

async function getFinancialProgress(userId, sprintId) {
  const { data, error } = await supabase
    .from('financial_progress')
    .select('*')
    .eq('user_id', userId)
    .eq('sprint_id', sprintId)
    .order('week_start', { ascending: false });

  if (error) {
    console.error('[DB] Error getting financial progress:', error.message);
    return { data: [], error };
  }
  return { data: data || [], error: null };
}

async function getLastFinancialProgress(userId, sprintId) {
  const { data, error } = await supabase
    .from('financial_progress')
    .select('*')
    .eq('user_id', userId)
    .eq('sprint_id', sprintId)
    .order('week_start', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('[DB] Error getting last financial progress:', error.message);
    return { data: null, error };
  }
  return { data: data || null, error: null };
}

module.exports = { saveFinancialProgress, getFinancialProgress, getLastFinancialProgress };
