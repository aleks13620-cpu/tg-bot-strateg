const TABS = [
  { id: 'dashboard', label: 'Дашборд', icon: '📊' },
  { id: 'analytics', label: 'Аналитика', icon: '📈' },
  { id: 'settings', label: 'Настройки', icon: '⚙️' },
];

export function TabBar({ active, onChange }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 flex z-50">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`flex-1 flex flex-col items-center py-2 text-xs gap-0.5 transition-colors ${
            active === tab.id
              ? 'text-blue-600 dark:text-blue-400'
              : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          <span className="text-lg leading-none">{tab.icon}</span>
          <span>{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
