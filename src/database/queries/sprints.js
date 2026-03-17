const { supabase } = require('../../../config/database');

async function createSprint(userId, startDate, endDate, goalText, financialGoal = null, sprintType = 'sprint') {
  const record = {
    user_id: userId,
    start_date: startDate,
    end_date: endDate,
    goal_text: goalText,
    status: 'active',
    type: sprintType,
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

async function updateSprintFinancialGoal(sprintId, financialGoal) {
  const { data, error } = await supabase
    .from('sprints')
    .update({ financial_goal: financialGoal })
    .eq('id', sprintId)
    .select()
    .single();

  if (error) {
    console.error('[DB] Error updating sprint financial goal:', error.message);
  }
  return { data, error };
}

async function updateSprintSfiChallenge(sprintId, sfiChallenge) {
  const { data, error } = await supabase
    .from('sprints')
    .update({ sfi_challenge: sfiChallenge })
    .eq('id', sprintId)
    .select()
    .single();

  if (error) {
    console.error('[DB] Error updating sprint sfi_challenge:', error.message);
  }
  return { data, error };
}

async function getSprintById(sprintId) {
  const { data, error } = await supabase
    .from('sprints')
    .select('*, initiatives(*)')
    .eq('id', sprintId)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('[DB] Error getting sprint by id:', error.message);
    return { data: null, error };
  }
  return { data: data || null, error: null };
}

async function getAllSprints(userId) {
  const { data, error } = await supabase
    .from('sprints')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[DB] Error getting all sprints:', error.message);
    return { data: [], error };
  }
  return { data: data || [], error: null };
}

async function archiveSprint(sprintId) {
  const { data, error } = await supabase
    .from('sprints')
    .update({ status: 'archived' })
    .eq('id', sprintId)
    .select()
    .single();

  if (error) {
    console.error('[DB] Error archiving sprint:', error.message);
  }
  return { data, error };
}

async function updateSprintEndDate(sprintId, newEndDate) {
  const { data, error } = await supabase
    .from('sprints')
    .update({ end_date: newEndDate })
    .eq('id', sprintId)
    .select()
    .single();

  if (error) {
    console.error('[DB] Error updating sprint end_date:', error.message);
  }
  return { data, error };
}

module.exports = { createSprint, getActiveSprint, getActiveSprints, getSprintById, getAllSprints, completeSprint, updateSprintGoal, updateSprintFinancialGoal, updateSprintSfiChallenge, archiveSprint, updateSprintEndDate };

