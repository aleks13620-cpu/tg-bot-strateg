export function fmtMinutes(minutes) {
  if (!minutes || minutes <= 0) return '0мин';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}ч ${m}мин`;
  if (h > 0) return `${h}ч`;
  return `${m}мин`;
}

export function fmtNum(n) {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
}

export function sfiColor(current, goal) {
  if (current >= goal) return 'green';
  if (current >= goal - 5) return 'yellow';
  return 'red';
}

export function sfiTailwind(current, goal) {
  const c = sfiColor(current, goal);
  if (c === 'green') return 'text-green-600 dark:text-green-400';
  if (c === 'yellow') return 'text-yellow-500 dark:text-yellow-400';
  return 'text-red-500 dark:text-red-400';
}

export function progressBarColor(pct) {
  if (pct >= 70) return 'bg-green-500';
  if (pct >= 40) return 'bg-yellow-400';
  return 'bg-red-500';
}

export function sprintTypeName(type) {
  return type === 'monthly_goal' ? '30-дневная цель' : 'Спринт';
}

export function unitLabel(unit) {
  const map = { num: 'шт', rub: '₽', pct: '%', bool: '' };
  return map[unit] || '';
}
