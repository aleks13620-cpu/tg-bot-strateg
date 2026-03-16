import { progressBarColor } from '../../utils/format.js';

export function ProgressBar({ value = 0, colorOverride = null, className = '' }) {
  const pct = Math.max(0, Math.min(100, value));
  const color = colorOverride || progressBarColor(pct);
  return (
    <div className={`w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 ${className}`}>
      <div
        className={`${color} h-2 rounded-full transition-all duration-300`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
