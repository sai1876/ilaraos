'use client';

import React from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';

interface DocumentRequirementProps {
  type: string;
  isSatisfied: boolean;
}

export default function DocumentRequirement({ type, isSatisfied }: DocumentRequirementProps) {
  const label = type.replace(/_/g, ' ');

  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-bold border transition-colors ${
      isSatisfied
        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
        : 'bg-red-50 text-red-700 border-red-200 animate-pulse'
    }`}>
      {isSatisfied ? (
        <CheckCircle2 size={12} className="shrink-0 text-emerald-600" />
      ) : (
        <AlertCircle size={12} className="shrink-0 text-red-600" />
      )}
      <span className="capitalize">{label}</span>
      <span className="text-[8px] uppercase tracking-wider px-1 rounded bg-black/5 font-black">
        {isSatisfied ? 'Verified' : 'Required'}
      </span>
    </div>
  );
}
