const { createSprint, getActiveSprint } = require('../database/queries/sprints');
const { createInitiative } = require('../database/queries/initiatives');

async function startNewSprint(userId, goalText, initiativeTitles, durationDays = 14, financialGoal = null) {
  const startDate = new Date().toISOString().split('T')[0];
  const endDate = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000)
    .toISOString().split('T')[0];

  const { data: sprint, error: sprintError } = await createSprint(
    userId, startDate, endDate, goalText, financialGoal
  );

  if (sprintError) {
    return { data: null, error: sprintError };
  }

  const initiatives = [];
  for (const title of initiativeTitles) {
    const { data: initiative, error: initError } = await createInitiative(sprint.id, title);
    if (initError) {
      console.error(`[SPRINT] Failed to create initiative: ${title}`);
      continue;
    }
    initiatives.push(initiative);
  }

  console.log(`[SPRINT] Created sprint ${sprint.id} with ${initiatives.length} initiatives`);
  return { data: { ...sprint, initiatives }, error: null };
}

function formatSprint(sprint) {
  const start = new Date(sprint.start_date).toLocaleDateString('ru-RU');
  const end = new Date(sprint.end_date).toLocaleDateString('ru-RU');

  let text = `🎯 *Спринт: ${sprint.goal_text}*\n`;
  text += `📅 ${start} — ${end}\n`;
  if (sprint.financial_goal) {
    text += `💰 *Финансовая цель:* ${sprint.financial_goal}\n`;
  }
  text += '\n';

  const initiatives = sprint.initiatives || [];
  if (initiatives.length > 0) {
    text += `*Инициативы:*\n`;
    initiatives.forEach((init, i) => {
      text += `${i + 1}. ${init.title}\n`;
    });
  } else {
    text += `_Инициативы не добавлены_`;
  }

  return text;
}

function formatSprintCompact(sprint, index, total) {
  const start = new Date(sprint.start_date).toLocaleDateString('ru-RU');
  const end = new Date(sprint.end_date).toLocaleDateString('ru-RU');
  const initiatives = sprint.initiatives || [];

  let text = `🎯 *Спринт ${index + 1}/${total}*\n`;
  text += `*Цель:* ${sprint.goal_text}\n`;
  text += `📅 ${start} — ${end}\n`;
  if (sprint.financial_goal) {
    text += `💰 *Финансовая цель:* ${sprint.financial_goal}\n`;
  }

  if (initiatives.length > 0) {
    text += `📌 *Инициативы:*\n`;
    initiatives.forEach((init, i) => {
      text += `  ${i + 1}. ${init.title}\n`;
    });
  } else {
    text += `📌 _Инициативы не добавлены_`;
  }

  return text;
}

/**
 * Карточка завершения спринта.
 * stats — результат getSprintStats(), streakMax — число, lastFinancialProgress — запись или null
 */
function formatSprintCompletionCard(sprint, stats, streakMax, lastFinancialProgress) {
  const start = new Date(sprint.start_date).toLocaleDateString('ru-RU');
  const end = new Date(sprint.end_date).toLocaleDateString('ru-RU');

  let text = `🏁 *Спринт завершён!*\n\n`;
  text += `🎯 *Цель:* ${sprint.goal_text}\n`;
  text += `📅 ${start} — ${end}\n\n`;

  if (stats) {
    text += `✅ Выполнено: *${stats.done}* задач (из ${stats.totalTasks})\n`;
    text += `🎯 Стратегические: ${stats.strategicDone}\n`;
    text += `🔥 Оперативные: ${stats.fireDone}\n`;
    const sfiIcon = stats.sfi >= 70 ? '🟢' : stats.sfi >= 50 ? '🟡' : stats.sfi > 0 ? '🔴' : '';
    text += `📊 *SFI: ${stats.sfi}%* ${sfiIcon}\n`;
  }

  if (streakMax && streakMax > 0) {
    text += `🔥 Макс. стрик: *${streakMax} дн.*\n`;
  }

  if (sprint.financial_goal) {
    text += `\n💰 *Финансовая цель:* ${sprint.financial_goal}`;
    if (lastFinancialProgress) {
      text += `\n📌 Последний факт: ${lastFinancialProgress.actual_value}`;
    }
  }

  text += `\n\n_Отличная работа! Время планировать следующий спринт._`;
  return text;
}

module.exports = { startNewSprint, getActiveSprint, formatSprint, formatSprintCompact, formatSprintCompletionCard };
