/**
 * Client-Side Performance Instrumentation Helper
 * Uses performance.mark() and performance.measure()
 */

export interface PerfMetric {
  name: string;
  durationMs: number;
  timestamp: number;
  details?: Record<string, unknown>;
}

const metricsLog: PerfMetric[] = [];
const MAX_METRICS_LOG = 100;

export function markStart(label: string): string {
  const markName = `${label}_start_${Date.now()}`;
  if (typeof window !== 'undefined' && window.performance) {
    performance.mark(markName);
  }
  return markName;
}

export function markEnd(label: string, startMarkName: string, details?: Record<string, unknown>): number {
  let durationMs = 0;
  if (typeof window !== 'undefined' && window.performance) {
    const endMarkName = `${label}_end_${Date.now()}`;
    performance.mark(endMarkName);
    try {
      const measureName = `${label}_measure`;
      performance.measure(measureName, startMarkName, endMarkName);
      const entries = performance.getEntriesByName(measureName);
      if (entries.length > 0) {
        durationMs = Math.round(entries[entries.length - 1].duration);
      }
      performance.clearMarks(startMarkName);
      performance.clearMarks(endMarkName);
      performance.clearMeasures(measureName);
    } catch {
      // Fallback timing if mark was cleared
      durationMs = 0;
    }
  }

  const metric: PerfMetric = {
    name: label,
    durationMs,
    timestamp: Date.now(),
    details,
  };

  metricsLog.unshift(metric);
  if (metricsLog.length > MAX_METRICS_LOG) {
    metricsLog.pop();
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[PERF] ${label}: ${durationMs}ms`, details || '');
  }

  return durationMs;
}

export function getRecordedMetrics(): PerfMetric[] {
  return [...metricsLog];
}
