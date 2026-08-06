'use client';

import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { useStore } from '@/store/useStore';

export default function CustomerAuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { authLoading, setAuthLoading } = useStore();
  const [resolvedSignedOut, setResolvedSignedOut] = useState(false);

  useEffect(() => {
    setAuthLoading(true);
    const unsubscribe = onAuthStateChanged(
      auth,
      (firebaseUser) => {
        if (firebaseUser) {
          router.replace('/profile');
          return;
        }
        setResolvedSignedOut(true);
        setAuthLoading(false);
      },
      (error) => {
        console.error('[auth guard] Failed to resolve Firebase authentication:', error);
        setResolvedSignedOut(true);
        setAuthLoading(false);
      },
    );
    return unsubscribe;
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
