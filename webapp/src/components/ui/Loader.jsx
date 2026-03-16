export function Loader({ text = 'Загрузка...' }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      <div className="w-8 h-8 border-4 border-gray-200 dark:border-gray-700 border-t-blue-500 rounded-full animate-spin" />
      <span className="text-sm text-gray-500 dark:text-gray-400">{text}</span>
    </div>
  );
}
