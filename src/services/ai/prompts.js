function buildCoachingQuestionPrompt(stats) {
  return [
    'Ты коуч по продуктивности для предпринимателя.',
    'Сгенерируй 1 короткий вопрос для вечерней рефлексии на русском языке.',
    'Ограничения: до 140 символов, без воды, без эмодзи, только один вопросительный знак.',
    'Фокус: стратегический приоритет и следующий конкретный шаг.',
    `Данные дня: total=${stats.total}, done=${stats.done}, skipped=${stats.skipped}, pending=${stats.pending}, sfi=${stats.sfi}, fireDone=${stats.fireDone}.`,
    'Верни только текст вопроса без пояснений.',
  ].join('\n');
}

module.exports = { buildCoachingQuestionPrompt };
