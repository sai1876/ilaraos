import React from 'react';

export type SeverityType = 'low' | 'medium' | 'high' | 'critical' | string;

interface SeverityBadgeProps {
  severity: SeverityType;
  className?: string;
}

export default function SeverityBadge({ severity, className = '' }: SeverityBadgeProps) {
  const normalized = (severity || 'low').toLowerCase();

  let styles = 'bg-blue-50 text-blue-700 border-blue-200';
  let label = 'LOW';

  if (normalized === 'medium' || normalized === 'info') {
    styles = 'bg-amber-50 text-amber-700 border-amber-200';
    label = 'MEDIUM';
  } else if (normalized === 'high' || normalized === 'warning') {
    styles = 'bg-orange-50 text-orange-700 border-orange-200';
    label = 'HIGH';
  } else if (normalized === 'critical' || normalized === 'danger') {
    styles = 'bg-red-50 text-red-700 border-red-200 font-black animate-pulse';
    label = 'CRITICAL';
  }

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-widest uppercase border ${styles} ${className}`}>
      {label}
    </span>
  );
}
