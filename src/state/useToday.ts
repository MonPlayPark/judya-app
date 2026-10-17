// "Today" for a screen that stays open (BRIEF 3.2, Q10): the date can change at midnight Bangkok time while the app is open.
// It is read again when the person comes back to the app (visibility / focus) and every minute.
import { useCallback, useEffect, useState } from 'react';
import type { IsoDate } from '../domain/calc';
import { useData } from './DataContext';

export interface TodayClock {
  today: IsoDate;
  /** Reads the clock now. Returns true if the date shown is still right; if not, the screen updates and false is returned
   * (the caller then drops the tap instead of writing to the wrong day). */
  syncToday: () => boolean;
}

export function useToday(): TodayClock {
  const { getToday } = useData();
  const [today, setToday] = useState<IsoDate>(getToday);

  useEffect(() => {
    const refresh = () => setToday(getToday());
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', refresh);
    const timer = window.setInterval(refresh, 60_000);
    refresh(); // the clock may have moved between the first render and now
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', refresh);
      window.clearInterval(timer);
    };
  }, [getToday]);

  const syncToday = useCallback((): boolean => {
    const now = getToday();
    if (now === today) return true;
    setToday(now);
    return false;
  }, [getToday, today]);

  return { today, syncToday };
}
