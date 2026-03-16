import { Card } from '../ui/Card.jsx';
import { fmtMinutes } from '../../utils/format.js';

export function TimeStats({ data }) {
  if (!data || data.empty) return null;
  const { time } = data;
  if (!time || time.total_minutes === 0) return null;

  const pct = time.strategic_percent || 0;
  const barColor = pct >= 70 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-400' : 'bg-red-500';

  return (
    <Card>
      <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
        ⏱ Время · {fmtMinutes(time.total_minutes)}
      </h3>

      {/* Split bar */}
      <div className="flex rounded-full overflow-hidden h-4 mb-1">
        <div
          className={`${barColor} transition-all duration-300`}
          style={{ width: `${pct}%` }}
        />
        <div
          className="bg-orange-300 dark:bg-orange-600 transition-all duration-300"
          style={{ width: `${100 - pct}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-3">
        <span>Стратегия {pct}%</span>
        <span>Вне {100 - pct}%</span>
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-300">🎯 На стратегию</span>
          <span className="font-medium text-green-600 dark:text-green-400">
            {fmtMinutes(time.strategic_minutes)} ({pct}%)
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-300">🔥 Вне стратегии</span>
          <span className="font-medium text-orange-500 dark:text-orange-400">
            {fmtMinutes(time.off_strategy_minutes)} ({100 - pct}%)
          </span>
        </div>
      </div>
    </Card>
  );
}
