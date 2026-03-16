export function Badge({ children, variant = 'default' }) {
  const styles = {
    default: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
    green: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
    yellow: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
    red: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
    blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-medium ${styles[variant] || styles.default}`}>
      {children}
    </span>
  );
}
