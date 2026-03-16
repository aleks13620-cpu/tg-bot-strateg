import { useEffect } from 'react';

export function useTelegram() {
  const tg = window.Telegram?.WebApp;

  useEffect(() => {
    if (tg) {
      tg.ready();
      tg.expand();
    }
  }, []);

  return {
    tg,
    user: tg?.initDataUnsafe?.user,
    initData: tg?.initData || '',
    colorScheme: tg?.colorScheme || 'light',
    themeParams: tg?.themeParams || {},
    haptic: tg?.HapticFeedback,
    close: () => tg?.close(),
  };
}
