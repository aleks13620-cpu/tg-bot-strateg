const { getDayStats } = require('../analytics');
const { saveCoachingQuestion } = require('../../database/queries/coaching');
const {
  LOW_SFI_QUESTIONS,
  TOO_MANY_FIRE_QUESTIONS,
  FRIDAY_MESSAGES,
  HIGH_SFI_MESSAGES,
  ALL_SKIPPED_QUESTIONS,
  MEDIUM_SFI_MESSAGES,
  pickRandom,
} = require('./questionTemplates');

/**
 * Анализирует статистику дня и возвращает коучинговое сообщение (если нужно).
 * Возвращает { message, questionId } или null если коучинг не нужен.
 */
async function generateCoaching(userId, date) {
  const stats = await getDayStats(userId, date);
  if (!stats || stats.total === 0) return null;

  const isFriday = new Date(date).getDay() === 5;

  // Правило 1: Пятница — мотивационное сообщение
  if (isFriday) {
    return { message: pickRandom(FRIDAY_MESSAGES), questionId: null };
  }

  // Правило 2: Все задачи пропущены (done === 0, но задачи были)
  if (stats.done === 0 && stats.skipped > 0) {
    const question = pickRandom(ALL_SKIPPED_QUESTIONS);
    const { data } = await saveCoachingQuestion(userId, question);
    return {
      message: `🤔 *Вопрос для размышления:*\n\n${question}`,
      questionId: data?.id || null,
    };
  }

  if (stats.done === 0) return null;

  // Правило 3: SFI < 50% — вопрос про фокус
  if (stats.sfi < 50) {
    const question = pickRandom(LOW_SFI_QUESTIONS);
    const { data } = await saveCoachingQuestion(userId, question);
    return {
      message: `🤔 *Вопрос для размышления:*\n\n${question}`,
      questionId: data?.id || null,
    };
  }

  // Правило 4: >3 задач вне стратегии — вопрос про делегирование
  if (stats.fireDone > 3) {
    const question = pickRandom(TOO_MANY_FIRE_QUESTIONS);
    const { data } = await saveCoachingQuestion(userId, question);
    return {
      message: `🤔 *Вопрос для размышления:*\n\n${question}`,
      questionId: data?.id || null,
    };
  }

  // Правило 5: SFI >= 70% — похвала
  if (stats.sfi >= 70) {
    return { message: pickRandom(HIGH_SFI_MESSAGES), questionId: null };
  }

  // Правило 6: SFI 50-69% — лёгкое напоминание
  return { message: pickRandom(MEDIUM_SFI_MESSAGES), questionId: null };
}

module.exports = { generateCoaching };
