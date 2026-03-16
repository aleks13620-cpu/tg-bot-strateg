const PERIODS = [
  { id: 'today', label: 'Сегодня' },
  { id: 'week', label: 'Неделя' },
  { id: 'sprint', label: 'Спринт' },
];

export function Header({ period, onPeriodChange }) {
  return (
    <header className="sticky top-0 z-40 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-2">
      <div className="flex gap-1">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            onClick={() => onPeriodChange(p.id)}
            className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              period === p.id
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
    </header>
  );
}
