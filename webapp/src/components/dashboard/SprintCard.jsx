import { Card } from '../ui/Card.jsx';
import { ProgressBar } from '../ui/ProgressBar.jsx';
import { Badge } from '../ui/Badge.jsx';
import { sprintTypeName } from '../../utils/format.js';

export function SprintCard({ sprint }) {
  if (!sprint) {
    return (
      <Card>
        <p className="text-center text-gray-500 dark:text-gray-400 text-sm py-2">
          Нет активного спринта. Создайте спринт через бота.
        </p>
      </Card>
    );
  }

  const progress = Math.round((sprint.day_number / sprint.duration) * 100);

  return (
    <Card>
      <div className="flex items-start justify-between gap-2 mb-3">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100 text-base leading-snug">
          🎯 {sprint.goal}
        </h2>
        <Badge variant="blue">{sprintTypeName(sprint.type)}</Badge>
      </div>

      <div className="mb-1">
        <ProgressBar value={progress} colorOverride="bg-blue-500" />
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        День {sprint.day_number} из {sprint.duration} · осталось {sprint.days_left} дн.
      </p>

      {sprint.directions && sprint.directions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {sprint.directions.map((d) => (
            <Badge key={d.id} variant="default">{d.title}</Badge>
          ))}
        </div>
      )}
    </Card>
  );
}
