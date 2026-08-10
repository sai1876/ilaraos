'use client';

import React, { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

export default function StorageDiagnostic() {
  const [storageInfo, setStorageInfo] = useState<{
    usage: number;
    quota: number;
    percentage: number;
  } | null>(null);

  useEffect(() => {
    const checkStorage = async () => {
      if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
        try {
          const estimate = await navigator.storage.estimate();
          if (estimate.usage !== undefined && estimate.quota !== undefined && estimate.quota > 0) {
            const percentage = (estimate.usage / estimate.quota) * 100;
            setStorageInfo({
              usage: estimate.usage,
              quota: estimate.quota,
              percentage: percentage,
            });
          }
        } catch (error) {
          // Silent catch to prevent UI breaking
          console.warn('Storage estimate failed:', error);
        }
      }
    };

    checkStorage();
  }, []);

  if (!storageInfo || storageInfo.percentage < 80) {
    return null; // Render nothing if < 80% or undefined
  }

  const isDanger = storageInfo.percentage > 90;

  return (
    <div
      className={`fixed bottom-4 right-4 z-[9999] flex items-center gap-2 px-3 py-2 rounded-xl shadow-lg border text-xs font-mono transition-all ${
        isDanger
          ? 'bg-red-50 border-red-200 text-red-700'
          : 'bg-amber-50 border-amber-200 text-amber-700'
      }`}
      title={`Usage: ${(storageInfo.usage / 1024 / 1024).toFixed(2)} MB / ${(
        storageInfo.quota / 1024 / 1024
      ).toFixed(2)} MB`}
    >
      <AlertTriangle size={14} className={isDanger ? 'animate-pulse' : ''} />
      <span className="font-bold uppercase tracking-widest">
        {isDanger ? 'Browser Storage High' : 'Browser Storage Warning'}
      </span>
      <span className="text-[10px] opacity-80">
        ({storageInfo.percentage.toFixed(1)}%)
      </span>
    </div>
  );
}
