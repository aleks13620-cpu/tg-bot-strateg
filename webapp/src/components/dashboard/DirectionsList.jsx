import { Card } from '../ui/Card.jsx';
import { ProgressBar } from '../ui/ProgressBar.jsx';
import { fmtMinutes } from '../../utils/format.js';

export function DirectionsList({ directions }) {
  if (!directions || directions.length === 0) return null;

  return (
    <Card>
      <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">📊 По направлениям</h3>
      <div className="space-y-3">
        {directions.map((d, i) => (
          <div key={i} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{d.name}</span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {d.completed}/{d.total} ({d.completion_rate}%)
              </span>
            </div>
            <ProgressBar value={d.completion_rate} />
            {d.time_minutes > 0 && (
              <div className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                ⏱ {fmtMinutes(d.time_minutes)}
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
