import { Card } from '../ui/Card.jsx';
import { ProgressBar } from '../ui/ProgressBar.jsx';
import { sfiTailwind, sfiColor } from '../../utils/format.js';

const SFI_COLORS = {
  green: 'bg-green-500',
  yellow: 'bg-yellow-400',
  red: 'bg-red-500',
};

const STATUS_LABELS = {
  above: '▲ выше нормы',
  on_target: '≈ в норме',
  below: '▼ ниже нормы',
};

export function FocusStats({ data }) {
  if (!data || data.empty) return null;

  const { sfi, strategic, off_strategy, total_tasks, completed_tasks } = data;
  const color = sfiColor(sfi.current, sfi.goal);
  const barColor = SFI_COLORS[color];

  return (
    <Card>
      <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">🎯 Стратегический фокус</h3>

      {/* SFI карточки */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 text-center">
          <div className={`text-2xl font-bold ${sfiTailwind(sfi.current, sfi.goal)}`}>
            {sfi.current}%
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Сейчас</div>
          <div className={`text-xs font-medium mt-0.5 ${sfiTailwind(sfi.current, sfi.goal)}`}>
            {STATUS_LABELS[sfi.status]}
          </div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-gray-700 dark:text-gray-200">{sfi.goal}%</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Норма</div>
        </div>
      </div>

      {/* SFI прогресс-бар */}
      <div className="mb-4">
        <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
          <span>SFI</span>
          <span>{sfi.current}% / цель {sfi.goal}%</span>
        </div>
        <div className="relative w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
          <div
            className={`${barColor} h-2.5 rounded-full transition-all duration-300`}
            style={{ width: `${Math.min(100, sfi.current)}%` }}
          />
          {/* Маркер цели */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-gray-600 dark:bg-gray-300"
            style={{ left: `${Math.min(100, sfi.goal)}%` }}
          />
        </div>
      </div>

      {/* Задачи */}
      <div className="border-t border-gray-100 dark:border-gray-700 pt-3 space-y-1">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-300">📊 Всего выполнено</span>
          <span className="font-medium text-gray-900 dark:text-gray-100">
            {completed_tasks} / {total_tasks}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-300">🎯 Стратегия</span>
          <span className="font-medium text-green-600 dark:text-green-400">
            {strategic?.completed ?? '—'}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-300">🔥 Вне стратегии</span>
          <span className="font-medium text-orange-500 dark:text-orange-400">
            {off_strategy?.completed ?? '—'}
          </span>
        </div>
      </div>
    </Card>
  );
}
