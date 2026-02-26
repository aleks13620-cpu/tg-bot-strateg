const { createSprint, getActiveSprint } = require('../database/queries/sprints');
const { createInitiative } = require('../database/queries/initiatives');

async function startNewSprint(userId, goalText, initiativeTitles, durationDays = 14) {
  const startDate = new Date().toISOString().split('T')[0];
  const endDate = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000)
    .toISOString().split('T')[0];

  const { data: sprint, error: sprintError } = await createSprint(
    userId, startDate, endDate, goalText
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
  text += `📅 ${start} — ${end}\n\n`;

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

module.exports = { startNewSprint, getActiveSprint, formatSprint, formatSprintCompact };
