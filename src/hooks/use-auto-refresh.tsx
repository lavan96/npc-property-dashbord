import { useEffect, useRef } from 'react';

interface AutoRefreshSettings {
  autoRefresh: boolean;
  refreshInterval: number; // in minutes
}

export const useAutoRefresh = (callback: () => void | Promise<void>) => {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const callbackRef = useRef(callback);

  // Update callback ref when callback changes
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const startAutoRefresh = (settings: AutoRefreshSettings) => {
    // Clear existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    if (!settings.autoRefresh) {
      return;
    }

    // Convert minutes to milliseconds
    const intervalMs = settings.refreshInterval * 60 * 1000;

    intervalRef.current = setInterval(() => {
      callbackRef.current();
    }, intervalMs);
  };

  const stopAutoRefresh = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAutoRefresh();
    };
  }, []);

  return { startAutoRefresh, stopAutoRefresh };
};