const { supabase } = require('../../../config/database');

async function createInitiative(sprintId, title) {
  const { data, error } = await supabase
    .from('initiatives')
    .insert({
      sprint_id: sprintId,
      title: title,
    })
    .select()
    .single();

  if (error) {
    console.error('[DB] Error creating initiative:', error.message);
  }
  return { data, error };
}

async function getInitiativesBySprint(sprintId) {
  const { data, error } = await supabase
    .from('initiatives')
    .select('*')
    .eq('sprint_id', sprintId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[DB] Error getting initiatives:', error.message);
    return { data: [], error };
  }

  return { data: data || [], error: null };
}

async function updateInitiativeTitle(initiativeId, title) {
  const { data, error } = await supabase
    .from('initiatives')
    .update({ title })
    .eq('id', initiativeId)
    .select()
    .single();

  if (error) {
    console.error('[DB] Error updating initiative:', error.message);
  }
  return { data, error };
}

async function deleteInitiative(initiativeId) {
  const { error } = await supabase
    .from('initiatives')
    .delete()
    .eq('id', initiativeId);

  if (error) {
    console.error('[DB] Error deleting initiative:', error.message);
  }
  return { error };
}

module.exports = { createInitiative, getInitiativesBySprint, updateInitiativeTitle, deleteInitiative };
