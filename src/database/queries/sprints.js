const { supabase } = require('../../../config/database');

async function createSprint(userId, startDate, endDate, goalText, financialGoal = null) {
  const record = {
    user_id: userId,
    start_date: startDate,
    end_date: endDate,
    goal_text: goalText,
    status: 'active',
  };
  if (financialGoal) record.financial_goal = financialGoal;

  const { data, error } = await supabase
    .from('sprints')
    .insert(record)
    .select()
    .single();

  if (error) {
    console.error('[DB] Error creating sprint:', error.message);
  }
  return { data, error };
}

async function getActiveSprint(userId) {
  const { data, error } = await supabase
    .from('sprints')
    .select('*, initiatives(*)')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('[DB] Error getting active sprint:', error.message);
    return { data: null, error };
  }

  return { data: data || null, error: null };
}

async function getActiveSprints(userId) {
  const { data, error } = await supabase
    .from('sprints')
    .select('*, initiatives(*)')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[DB] Error getting active sprints:', error.message);
    return { data: [], error };
  }

  return { data: data || [], error: null };
}

async function completeSprint(sprintId) {
  const { data, error } = await supabase
    .from('sprints')
    .update({ status: 'completed' })
    .eq('id', sprintId)
    .select()
    .single();

  if (error) {
    console.error('[DB] Error completing sprint:', error.message);
  }
  return { data, error };
}

async function updateSprintGoal(sprintId, goalText) {
  const { data, error } = await supabase
    .from('sprints')
    .update({ goal_text: goalText })
    .eq('id', sprintId)
    .select()
    .single();

  if (error) {
    console.error('[DB] Error updating sprint goal:', error.message);
  }
  return { data, error };
}

module.exports = { createSprint, getActiveSprint, getActiveSprints, completeSprint, updateSprintGoal };
