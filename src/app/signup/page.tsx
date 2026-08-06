'use client';

import React, { Suspense } from 'react';
import AuthWorkspace from '@/components/auth/AuthWorkspace';
import CustomerAuthGuard from '@/components/auth/CustomerAuthGuard';

export default function SignupPage() {
  return (
    <Suspense fallback={
      <div className="grid min-h-screen place-items-center bg-[#FAF7F2]"><div className="h-8 w-8 animate-spin rounded-full border-4 border-[#9A642C]/20 border-t-[#9A642C]" /></div>
    }>
      <CustomerAuthGuard><AuthWorkspace defaultTab="signup" /></CustomerAuthGuard>
    </Suspense>
  );
}
