'use client';

import { useEffect } from 'react';
import CartSheet from "@/components/customer/CartSheet";
import BottomNav from "@/components/customer/BottomNav";
import TopNav from "@/components/customer/TopNav";
import FloatingOrderTracker from "@/components/customer/FloatingOrderTracker";
import { useStore } from '@/store/useStore';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { getUserProfile, updateUserProfile } from '@/lib/dbService';
import { streamUserOrders } from '@/features/orders/orderService';
import { isActiveOrderStatus } from '@/lib/orderUtils';

export default function CustomerLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { user, setUser, setUserProfile, setAuthLoading, setActiveOrders } = useStore();

  useEffect(() => {
    if (typeof window !== 'undefined' && window.self !== window.top) {
      document.documentElement.classList.add('in-iframe-preview');
      return () => {
        document.documentElement.classList.remove('in-iframe-preview');
      };
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let callbackVersion = 0;
    setAuthLoading(true);

    // Firebase Auth is the source of truth. Rebuild the persisted store after
    // every auth transition so a stale Zustand user can never authorize a request.
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      const version = ++callbackVersion;
      setAuthLoading(true);

      try {
        if (!firebaseUser) {
          setUser(null);
          setUserProfile(null);
          return;
        }

        try {
          await firebaseUser.getIdToken();
        } catch (error) {
          console.error('[auth hydration] Failed to resolve Firebase ID token:', error);
          throw error;
        }

        let profile;
        try {
          profile = await getUserProfile(firebaseUser.uid);
        } catch (error) {
          console.error('[auth hydration] Failed to load customer profile:', error);
          throw error;
        }

        if (!profile) {
          throw new Error(`Customer profile not found for authenticated user ${firebaseUser.uid}`);
        }

        if (firebaseUser.emailVerified && firebaseUser.email) {
          const email = firebaseUser.email;
          const isStudentEmail = email.endsWith('.edu') || email.endsWith('.ac.in') || email.endsWith('.edu.in');

          if (isStudentEmail && (!profile.email_verified || profile.student_email !== email)) {
            try {
              await updateUserProfile(firebaseUser.uid, {
                student_email: email,
                email_verified: true,
              });
              profile = { ...profile, student_email: email, email_verified: true };
            } catch (error) {
              // Profile hydration must still complete if this optional sync is denied.
              console.error('[auth hydration] Failed to sync verified student email:', error);
            }
          }
        }

        if (cancelled || version !== callbackVersion) return;
        setUser({
          uid: firebaseUser.uid,
          phone: firebaseUser.phoneNumber || profile.phone || '',
        });
        setUserProfile(profile);
      } catch (error) {
        console.error('[auth hydration] Authentication state could not be restored:', error);
        if (cancelled || version !== callbackVersion) return;
        setUser(null);
        setUserProfile(null);
        try {
          await auth.signOut();
        } catch (signOutError) {
          console.error('[auth hydration] Failed to clear invalid Firebase session:', signOutError);
        }
      } finally {
        if (!cancelled && version === callbackVersion) {
          setAuthLoading(false);
        }
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [setAuthLoading, setUser, setUserProfile]);

  useEffect(() => {
    if (!user?.uid) {
      setActiveOrders([]);
      return;
    }

    const unsubscribe = streamUserOrders(user.uid, (orders) => {
      setActiveOrders(orders.filter((order) => isActiveOrderStatus(order.status)));
    });

    return unsubscribe;
  }, [setActiveOrders, user?.uid]);

  return (
    <>
      <div className="relative bg-background pb-36 pt-0 md:pb-0 md:pt-0">
        <TopNav />
        {children}
        <CartSheet showTrigger={true} />
        <BottomNav />
      </div>
      {/* Real-time Order Tracker for all customer pages */}
      <FloatingOrderTracker showNavigation={true} />
    </>
  );
}
