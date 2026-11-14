import { useCallback, useEffect, useRef, useState } from 'react';

interface TimerState {
  duration: number;
  remaining: number;
  end: number | null;
}
export function timerSeconds(timer: TimerState, now = Date.now()): number {
  return timer.end === null ? timer.remaining : Math.max(0, Math.ceil((timer.end - now) / 1000));
}
export function timerText(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
function loadTimer(key: string, duration: number): TimerState {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(key) ?? 'null');
    if (value && typeof value === 'object') {
      const t = value as Record<string, unknown>;
      if (
        typeof t['duration'] === 'number' &&
        t['duration'] > 0 &&
        t['duration'] <= 86400 &&
        typeof t['remaining'] === 'number' &&
        t['remaining'] >= 0 &&
        t['remaining'] <= t['duration'] &&
        (t['end'] === null || (typeof t['end'] === 'number' && Number.isFinite(t['end'])))
      )
        return value as TimerState;
    }
  } catch {
    /* A timer is optional; workspace data uses durable storage separately. */
  }
  return { duration, remaining: duration, end: null };
}
export function useTimer(key: string, duration: number, onFinish: (seconds: number) => void) {
  const [timer, setTimer] = useState(() => loadTimer(key, duration));
  const [now, setNow] = useState(() => Date.now());
  const finish = useRef(onFinish);
  const completedEnd = useRef<number | null>(null);
  useEffect(() => {
    finish.current = onFinish;
  }, [onFinish]);
  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(timer));
    } catch {
      /* Timer still works in memory. */
    }
  }, [key, timer]);
  useEffect(() => {
    if (timer.end === null) return;
    const tick = () => {
      const time = Date.now();
      setNow(time);
      if (timerSeconds(timer, time) === 0) {
        clearInterval(interval);
        setTimer((current) => ({ ...current, remaining: 0, end: null }));
        if (completedEnd.current !== timer.end) {
          completedEnd.current = timer.end;
          finish.current(timer.duration);
        }
      }
    };
    const interval = setInterval(tick, 500);
    tick();
    return () => {
      clearInterval(interval);
    };
  }, [timer]);
  const reset = useCallback((seconds: number) => {
    setNow(Date.now());
    setTimer({ duration: seconds, remaining: seconds, end: null });
  }, []);
  return {
    seconds: timerSeconds(timer, now),
    duration: timer.duration,
    running: timer.end !== null,
    start: () => {
      const time = Date.now();
      setNow(time);
      setTimer((t) => ({
        ...t,
        end: time + (t.remaining || t.duration) * 1000,
        remaining: t.remaining || t.duration,
      }));
    },
    pause: () => {
      setTimer((t) => ({ ...t, remaining: timerSeconds(t), end: null }));
    },
    reset,
  };
}
export type StudioTimer = ReturnType<typeof useTimer>;
