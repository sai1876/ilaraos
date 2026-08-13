'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/store/useStore';

export default function CustomerAuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { authLoading, setAuthLoading } = useStore();
  const [resolvedSignedOut, setResolvedSignedOut] = useState(false);

  useEffect(() => {
    setAuthLoading(true);
    let mounted = true;
    
    fetch('/api/auth/customer-session')
      .then(res => res.json())
      .then(data => {
        if (!mounted) return;
        if (data.isAuthenticated) {
          router.replace('/profile');
          return;
        }
        setResolvedSignedOut(true);
        setAuthLoading(false);
      })
      .catch(error => {
        if (!mounted) return;
        console.error('[auth guard] Failed to resolve canonical session:', error);
        setResolvedSignedOut(true);
        setAuthLoading(false);
      });
      
    return () => { mounted = false; };
  }, [router, setAuthLoading]);

  if (authLoading || !resolvedSignedOut) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#FAF7F2]" aria-label="Checking authentication">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#9A642C]/20 border-t-[#9A642C]" />
      </div>
    );
  }

  return children;
}
