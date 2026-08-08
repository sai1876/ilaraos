'use client';

import { useState, useEffect } from 'react';
import { getRecordedMetrics, PerfMetric } from '@/lib/performance/perf';

export default function PerfDebugOverlay() {
  const [enabled, setEnabled] = useState(false);
  const [metrics, setMetrics] = useState<PerfMetric[]>([]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('perf') === '1') {
        setEnabled(true);
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const interval = setInterval(() => {
      const recorded = getRecordedMetrics();
      const ilaraPerf = (typeof window !== 'undefined' && window.__ILARA_PERF__)
        ? window.__ILARA_PERF__.map(p => ({
            name: `${p.cacheHit ? '⚡[CACHE] ' : p.deduped ? '🔁[DEDUPE] ' : '🌐[NET] '}${p.name}`,
            durationMs: p.durationMs,
            timestamp: p.timestamp,
            details: { key: p.key, status: p.status }
          }))
        : [];
      setMetrics([...ilaraPerf, ...recorded].sort((a, b) => b.timestamp - a.timestamp));
    }, 500);
    return () => clearInterval(interval);
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: '16px',
      right: '16px',
      width: '340px',
      maxHeight: '300px',
      backgroundColor: 'rgba(15, 23, 42, 0.92)',
      color: '#f8fafc',
      backdropFilter: 'blur(8px)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: '8px',
      padding: '12px',
      fontFamily: 'monospace',
      fontSize: '11px',
      zIndex: 999999,
      overflowY: 'auto',
      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', borderBottom: '1px solid #334155', paddingBottom: '4px' }}>
        <strong style={{ color: '#38bdf8' }}>⚡ PERF MONITOR (?perf=1)</strong>
        <button onClick={() => setEnabled(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>✕</button>
      </div>

      {metrics.length === 0 ? (
        <div style={{ color: '#64748b' }}>No operations recorded yet.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ color: '#94a3b8', textAlign: 'left' }}>
              <th>Action</th>
              <th style={{ textAlign: 'right' }}>Time</th>
            </tr>
          </thead>
          <tbody>
            {metrics.slice(0, 10).map((m, idx) => {
              const isFast = m.durationMs < 100;
              const isMedium = m.durationMs >= 100 && m.durationMs < 1200;
              const color = isFast ? '#4ade80' : isMedium ? '#fbbf24' : '#f87171';
              return (
                <tr key={idx} style={{ borderBottom: '1px solid #1e293b' }}>
                  <td style={{ padding: '4px 0', wordBreak: 'break-all' }}>{m.name}</td>
                  <td style={{ textAlign: 'right', color, fontWeight: 'bold' }}>{m.durationMs} ms</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
