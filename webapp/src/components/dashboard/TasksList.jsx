import { useState, useEffect } from 'react';
import { Card } from '../ui/Card.jsx';
import { api } from '../../api/client.js';

function TaskRow({ task }) {
  const isDone = task.status === 'done';
  const isSkipped = task.status === 'skipped';

  return (
    <div className={`flex items-start gap-2 py-1.5 ${isSkipped ? 'opacity-40' : ''}`}>
      <span className="mt-0.5 text-base leading-none flex-shrink-0">
        {isDone ? '✅' : isSkipped ? '⏭' : '○'}
      </span>
      <div className="flex-1 min-w-0">
        <span className={`text-sm ${isDone ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-800 dark:text-gray-200'}`}>
          {task.is_day_task && !isDone && <span className="mr-1">⭐</span>}
          {task.title}
        </span>
      </div>
      {task.direction ? (
        <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0 max-w-[80px] truncate text-right">
          {task.direction}
        </span>
      ) : (
        <span className="text-xs text-orange-400 flex-shrink-0">🔥</span>
      )}
    </div>
  );
}

function TaskGroup({ title, tasks }) {
  return (
    <div className="mb-3 last:mb-0">
      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
        {title}
      </p>
      <div className="divide-y divide-gray-100 dark:divide-gray-700">
        {tasks.map((t) => <TaskRow key={t.id} task={t} />)}
      </div>
    </div>
  );
}

export function TasksList({ sprints = [] }) {
  const [tasks, setTasks] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getTodayTasks()
      .then(({ tasks, summary }) => { setTasks(tasks || []); setSummary(summary); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;
  if (tasks.length === 0) {
    return (
      <Card>
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">📋 Сегодня</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">Задачи на сегодня ещё не добавлены.</p>
      </Card>
    );
  }

  // Build sprint lookup map
  const sprintMap = Object.fromEntries(sprints.map((s) => [s.id, s]));

  // Group tasks by sprint_id
  const groups = {};
  const noSprint = [];

  for (const task of tasks) {
    if (task.sprint_id && sprintMap[task.sprint_id]) {
      if (!groups[task.sprint_id]) groups[task.sprint_id] = [];
      groups[task.sprint_id].push(task);
    } else {
      noSprint.push(task);
    }
  }

  const hasGroups = sprints.length > 0 && (Object.keys(groups).length > 0 || noSprint.length > 0);

  return (
    <Card>
      <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
        📋 Сегодня: {tasks.length} задач
      </h3>

      {hasGroups ? (
        <>
          {sprints.map((s) => {
            const group = groups[s.id];
            if (!group || group.length === 0) return null;
            return <TaskGroup key={s.id} title={s.goal} tasks={group} />;
          })}
          {noSprint.length > 0 && (
            <TaskGroup title="Общие задачи" tasks={noSprint} />
          )}
        </>
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {tasks.map((t) => <TaskRow key={t.id} task={t} />)}
        </div>
      )}

      {summary && (
        <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
          Выполнено: {summary.completed}/{summary.total} · Стратегия: {summary.strategic} · Вне: {summary.off_strategy}
        </div>
      )}
    </Card>
  );
}
