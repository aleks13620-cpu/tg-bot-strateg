const { supabase } = require('../../../config/database');

async function createReview(userId, quarter, year) {
  const { data, error } = await supabase
    .from('quarterly_reviews')
    .insert({ user_id: userId, quarter, year })
    .select()
    .single();

  if (error) {
    console.error('[DB] Error creating quarterly review:', error.message);
  }
  return { data, error };
}

async function getActiveReview(userId) {
  const { data, error } = await supabase
    .from('quarterly_reviews')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'in_progress')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('[DB] Error getting active review:', error.message);
    return { data: null, error };
  }
  return { data: data || null, error: null };
}

async function getCompletedReviews(userId) {
  const { data, error } = await supabase
    .from('quarterly_reviews')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false });

  if (error) {
    console.error('[DB] Error getting completed reviews:', error.message);
    return { data: [], error };
  }
  return { data: data || [], error: null };
}

async function saveReviewAnswer(reviewId, block, qIdx, qText, answer) {
  const { data, error } = await supabase
    .from('review_answers')
    .insert({ review_id: reviewId, block, question_idx: qIdx, question_text: qText, answer })
    .select()
    .single();

  if (error) {
    console.error('[DB] Error saving review answer:', error.message);
  }
  return { data, error };
}

async function completeReview(reviewId, summary, focus90) {
  const { data, error } = await supabase
    .from('quarterly_reviews')
    .update({
      status: 'completed',
      summary,
      focus_90_days: focus90,
      completed_at: new Date().toISOString(),
    })
    .eq('id', reviewId)
    .select()
    .single();

  if (error) {
    console.error('[DB] Error completing review:', error.message);
  }
  return { data, error };
}

async function updateReviewBlock(reviewId, currentBlock) {
  const { error } = await supabase
    .from('quarterly_reviews')
    .update({ current_block: currentBlock })
    .eq('id', reviewId);

  if (error) {
    console.error('[DB] Error updating review block:', error.message);
  }
  return { error };
}

module.exports = { createReview, getActiveReview, getCompletedReviews, saveReviewAnswer, completeReview, updateReviewBlock };
