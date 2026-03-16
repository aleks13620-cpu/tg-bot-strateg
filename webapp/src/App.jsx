import { useState, useEffect } from 'react';
import { TabBar } from './components/layout/TabBar.jsx';
import { Dashboard } from './pages/Dashboard.jsx';
import { Analytics } from './pages/Analytics.jsx';
import { Settings } from './pages/Settings.jsx';
import { useTelegram } from './hooks/useTelegram.js';

const PAGES = { dashboard: Dashboard, analytics: Analytics, settings: Settings };

export default function App() {
  const [tab, setTab] = useState('dashboard');
  const { colorScheme } = useTelegram();

  // Тёмная тема по цветовой схеме Telegram
  useEffect(() => {
    document.documentElement.classList.toggle('dark', colorScheme === 'dark');
  }, [colorScheme]);

  const Page = PAGES[tab] || Dashboard;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <Page />
      <TabBar active={tab} onChange={setTab} />
    </div>
  );
}
