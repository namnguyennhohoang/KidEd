'use client';

import { useEffect } from 'react';
import { installSyncOnReconnect, syncAllPending } from '@/lib/learn-store';

export function SwRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }
    installSyncOnReconnect();
    void syncAllPending();
  }, []);
  return null;
}
