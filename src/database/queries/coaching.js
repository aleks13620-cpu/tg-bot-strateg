const { supabase } = require('../../../config/database');

async function saveCoachingQuestion(userId, questionText) {
  const { data, error } = await supabase
    .from('coaching_questions')
    .insert({ user_id: userId, question_text: questionText })
    .select()
    .single();

  if (error) {
    console.error('[COACHING] Error saving question:', error.message);
    return { data: null, error };
  }
  return { data, error: null };
}

async function saveCoachingAnswer(questionId, answerText) {
  const { data, error } = await supabase
    .from('coaching_questions')
    .update({ user_answer: answerText })
    .eq('id', questionId)
    .select()
    .single();

  if (error) {
    console.error('[COACHING] Error saving answer:', error.message);
    return { data: null, error };
  }
  return { data, error: null };
}

async function getLastUnansweredQuestion(userId) {
  const { data, error } = await supabase
    .from('coaching_questions')
    .select('*')
    .eq('user_id', userId)
    .is('user_answer', null)
    .order('asked_at', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('[COACHING] Error getting question:', error.message);
  }
  return { data: data || null, error: null };
}

module.exports = { saveCoachingQuestion, saveCoachingAnswer, getLastUnansweredQuestion };
