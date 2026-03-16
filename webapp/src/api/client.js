const BASE = import.meta.env.VITE_API_URL || '';

export async function apiRequest(path, options = {}) {
  const tg = window.Telegram?.WebApp;
  const initData = tg?.initData || '';

  const res = await fetch(BASE + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `TelegramWebApp ${initData}`,
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  getActiveSprint: () => apiRequest('/api/webapp/sprints/active'),
  getFocus: (period) => apiRequest(`/api/webapp/analytics/focus?period=${period}`),
  getTodayTasks: () => apiRequest('/api/webapp/tasks/today'),
  getMetrics: (sprintId) =>
    apiRequest(`/api/webapp/metrics${sprintId ? `?sprint_id=${sprintId}` : ''}`),
};
