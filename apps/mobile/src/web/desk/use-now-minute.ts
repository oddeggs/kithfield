import { useEffect, useState } from 'react';

/** The time, refreshed each minute: enough for the list's lines and the day's light. */
export function useNowMinute(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
