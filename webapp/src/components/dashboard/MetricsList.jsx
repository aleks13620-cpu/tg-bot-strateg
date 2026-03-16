import { useState, useEffect } from 'react';
import { Card } from '../ui/Card.jsx';
import { ProgressBar } from '../ui/ProgressBar.jsx';
import { fmtNum, unitLabel } from '../../utils/format.js';
import { api } from '../../api/client.js';

export function MetricsList({ sprintId }) {
  const [metrics, setMetrics] = useState([]);

  useEffect(() => {
    if (!sprintId) return;
    api.getMetrics(sprintId)
      .then(({ metrics }) => setMetrics(metrics || []))
      .catch(() => {});
  }, [sprintId]);

  if (metrics.length === 0) return null;

  return (
    <Card>
      <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">📈 Метрики цели</h3>
      <div className="space-y-3">
        {metrics.map((m) => (
          <div key={m.id}>
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{m.title}</span>
              {m.unit === 'bool' ? (
                <span className="text-sm">
                  {Number(m.current_value) === 1 ? '✅ Да' : '⬜ Нет'}
                </span>
              ) : m.target_value ? (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {fmtNum(m.current_value)} / {fmtNum(m.target_value)} {unitLabel(m.unit)}
                  {' '}({m.progress_percent}%)
                </span>
              ) : (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {fmtNum(m.current_value)} {unitLabel(m.unit)}
                </span>
              )}
            </div>
            {m.unit !== 'bool' && m.target_value > 0 && (
              <ProgressBar value={m.progress_percent} />
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
