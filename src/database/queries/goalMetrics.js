const { supabase } = require('../../../config/database');

async function createGoalMetric(sprintId, title, targetValue, unit) {
  const { data, error } = await supabase
    .from('goal_metrics')
    .insert({ sprint_id: sprintId, title, target_value: targetValue, unit })
    .select()
    .single();

  if (error) {
    console.error('[DB] Error creating goal metric:', error.message);
  }
  return { data, error };
}

async function getGoalMetricsBySprint(sprintId) {
  const { data, error } = await supabase
    .from('goal_metrics')
    .select('*')
    .eq('sprint_id', sprintId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[DB] Error getting goal metrics:', error.message);
    return { data: [], error };
  }
  return { data: data || [], error: null };
}

async function updateGoalMetricValue(metricId, currentValue) {
  const { data, error } = await supabase
    .from('goal_metrics')
    .update({ current_value: currentValue })
    .eq('id', metricId)
    .select()
    .single();

  if (error) {
    console.error('[DB] Error updating goal metric value:', error.message);
  }
  return { data, error };
}

async function getGoalMetricById(metricId) {
  const { data, error } = await supabase
    .from('goal_metrics')
    .select('*')
    .eq('id', metricId)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('[DB] Error getting goal metric by id:', error.message);
    return { data: null, error };
  }
  return { data: data || null, error: null };
}

async function deleteGoalMetric(metricId) {
  const { error } = await supabase
    .from('goal_metrics')
    .delete()
    .eq('id', metricId);

  if (error) {
    console.error('[DB] Error deleting goal metric:', error.message);
  }
  return { error };
}

module.exports = { createGoalMetric, getGoalMetricsBySprint, getGoalMetricById, updateGoalMetricValue, deleteGoalMetric };
