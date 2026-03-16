import { useEffect, useState } from 'react';
import { Header } from '../components/layout/Header.jsx';
import { SprintCard } from '../components/dashboard/SprintCard.jsx';
import { FocusStats } from '../components/dashboard/FocusStats.jsx';
import { TimeStats } from '../components/dashboard/TimeStats.jsx';
import { DirectionsList } from '../components/dashboard/DirectionsList.jsx';
import { MetricsList } from '../components/dashboard/MetricsList.jsx';
import { TasksList } from '../components/dashboard/TasksList.jsx';
import { Loader } from '../components/ui/Loader.jsx';
import { useSprint } from '../hooks/useSprint.js';
import { useFocus } from '../hooks/useFocus.js';

const PERIOD_KEY = 'strategist_period';

export function Dashboard() {
  const [period, setPeriod] = useState(() => localStorage.getItem(PERIOD_KEY) || 'sprint');

  const { sprint, loading: sprintLoading } = useSprint();
  const { data: focus, loading: focusLoading } = useFocus(period);

  const handlePeriodChange = (p) => {
    setPeriod(p);
    localStorage.setItem(PERIOD_KEY, p);
  };

  if (sprintLoading) return <Loader />;

  return (
    <div className="pb-20">
      <Header period={period} onPeriodChange={handlePeriodChange} />
      <div className="px-4 py-3 space-y-3">
        <SprintCard sprint={sprint} />

        {focusLoading ? (
          <Loader text="Загружаем статистику..." />
        ) : (
          <>
            <FocusStats data={focus} />
            <TimeStats data={focus} />
            <DirectionsList directions={focus?.by_direction} />
            {sprint?.type === 'monthly_goal' && <MetricsList sprintId={sprint.id} />}
          </>
        )}

        <TasksList />
      </div>
    </div>
  );
}
