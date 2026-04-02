const { getDayStats } = require('../analytics');
const { getIsoCalendarWeekday } = require('../../utils/userCalendarDate');
const { saveCoachingQuestion } = require('../../database/queries/coaching');
const { generateAiText } = require('../ai/client');
const { buildCoachingQuestionPrompt } = require('../ai/prompts');
const {
  LOW_SFI_QUESTIONS,
  TOO_MANY_FIRE_QUESTIONS,
  FRIDAY_MESSAGES,
  HIGH_SFI_MESSAGES,
  ALL_SKIPPED_QUESTIONS,
  RECOVERY_QUESTIONS,
  MEDIUM_SFI_MESSAGES,
  pickRandom,
} = require('./questionTemplates');

async function buildReflectiveQuestion(userId, stats, fallbackQuestion) {
  const prompt = buildCoachingQuestionPrompt(stats);
  const { text, source } = await generateAiText({
    prompt,
    fallbackText: fallbackQuestion,
  });
  const { data } = await saveCoachingQuestion(userId, text);
  return {
    message: `🤔 *Вопрос для размышления:*\n\n${text}`,
    questionId: data?.id || null,
    source,
  };
}

/**
 * Анализирует статистику дня и возвращает коучинговое сообщение (если нужно).
 * Возвращает { message, questionId } или null если коучинг не нужен.
 */
async function generateCoaching(userId, date) {
  const stats = await getDayStats(userId, date);
  if (!stats || stats.total === 0) return null;

  const isFriday = getIsoCalendarWeekday(date) === 5;

  // Правило 1: Пятница — мотивационное сообщение
  if (isFriday) {
    return { message: pickRandom(FRIDAY_MESSAGES), questionId: null };
  }

  // Правило 2: Все задачи пропущены (явный стоп-фактор)
  if (stats.done === 0 && stats.skipped > 0) {
    const question = pickRandom(ALL_SKIPPED_QUESTIONS);
    return buildReflectiveQuestion(userId, stats, question);
  }

  // Правило 3: Ничего не сделано, но и пропусков нет — нейтральный выход
  if (stats.done === 0) return null;

  // Правило 4: Много "пожаров" как отдельный стоп-фактор
  if (stats.fireDone >= 3) {
    const question = pickRandom(TOO_MANY_FIRE_QUESTIONS);
    return buildReflectiveQuestion(userId, stats, question);
  }

  // Правило 5: SFI < 50% — вопрос про фокус
  if (stats.sfi < 50) {
    const question = pickRandom(LOW_SFI_QUESTIONS);
    return buildReflectiveQuestion(userId, stats, question);
  }

  // Правило 6: Восстановление, если сделано мало и есть пропуски
  if (stats.done <= 1 && stats.skipped >= 1) {
    const question = pickRandom(RECOVERY_QUESTIONS);
    return buildReflectiveQuestion(userId, stats, question);
  }

  // Правило 7: SFI >= 70% — похвала
  if (stats.sfi >= 70) {
    return { message: pickRandom(HIGH_SFI_MESSAGES), questionId: null };
  }

  // Правило 8: SFI 50-69% — лёгкое напоминание
  return { message: pickRandom(MEDIUM_SFI_MESSAGES), questionId: null };
}

module.exports = { generateCoaching };
