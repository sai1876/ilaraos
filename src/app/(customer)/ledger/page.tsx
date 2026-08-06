'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Gift, ReceiptText } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getUserOrders } from '@/lib/dbService';
import { OrderDocument } from '@/lib/types';
import { useStore } from '@/store/useStore';

interface PointLedgerEntry {
  id: string;
  user_id: string;
  amount: number;
  source?: string;
  order_id?: string;
  created_at?: number | string | { toMillis?: () => number };
}

const toMillis = (value: PointLedgerEntry['created_at']): number => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  return 0;
};

const formatSource = (source?: string): string => {
  if (!source) return 'Points Transaction';
  return source
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const getDescription = (entry: PointLedgerEntry, order?: OrderDocument): string => {
  const source = entry.source || '';
  if (source === 'welcome_bonus') return 'Welcome Bonus';
  if (source === 'referral_bonus' || source === 'referral_completion' || source === 'referral') return 'Referral Reward';

  if (entry.order_id) {
    const orderLabel = order?.token_number || entry.order_id.slice(0, 8);
    return entry.amount < 0 || source === 'order_redemption'
      ? `Points Redeemed · Order #${orderLabel}`
      : `Order #${orderLabel}`;
  }

  if (entry.amount < 0) return 'Points Redeemed';
  return formatSource(source);
};

export default function LedgerPage() {
  const router = useRouter();
  const { user, authLoading } = useStore();
  const [entries, setEntries] = useState<PointLedgerEntry[]>([]);
  const [orders, setOrders] = useState<OrderDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/signup');
      return;
    }

    let cancelled = false;
    const loadLedger = async () => {
      setLoading(true);
      setError('');

      try {
        const ledgerQuery = query(
          collection(db, 'point_ledger'),
          where('user_id', '==', user.uid),
        );

        const ledgerPromise = getDocs(ledgerQuery).catch((fetchError) => {
          console.error('[ledger] Failed to read point_ledger:', fetchError);
          throw fetchError;
        });
        const ordersPromise = getUserOrders(user.uid).catch((fetchError) => {
          console.error('[ledger] Failed to load order labels; ledger will use order IDs:', fetchError);
          return [];
        });
        const [snapshot, userOrders] = await Promise.all([ledgerPromise, ordersPromise]);
        if (cancelled) return;

        const nextEntries = snapshot.docs
          .map((document) => ({ id: document.id, ...document.data() } as PointLedgerEntry))
          .sort((left, right) => toMillis(right.created_at) - toMillis(left.created_at));
        setEntries(nextEntries);
        setOrders(userOrders);
      } catch (fetchError) {
        console.error('[ledger] Rewards history could not be loaded:', fetchError);
        if (!cancelled) setError('Could not load your rewards history. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadLedger();
    return () => {
      cancelled = true;
    };
  }, [authLoading, router, user]);

  const ordersById = useMemo(
    () => new Map(orders.map((order) => [order.order_id, order])),
    [orders],
  );

  if (authLoading || !user || loading) {
    return (
      <main className="min-h-screen bg-background px-4 pb-28 pt-8 md:pt-28 sm:px-6" aria-label="Loading rewards ledger">
        <div className="mx-auto max-w-3xl">
          <div className="h-6 w-36 animate-pulse rounded bg-muted" />
          <div className="mt-8 h-12 w-64 animate-pulse rounded bg-muted" />
          <div className="mt-8 space-y-3">
            {[1, 2, 3].map((item) => <div key={item} className="h-20 animate-pulse rounded-2xl border border-border bg-card" />)}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background px-4 pb-28 pt-8 md:pt-28 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <Link href="/profile" className="inline-flex items-center gap-2 text-sm font-bold text-primary hover:underline">
          <ArrowLeft size={17} /> Back to Profile
        </Link>

        <header className="mt-7">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Ilara Rewards</p>
          <h1 className="mt-2 font-serif text-4xl font-bold text-foreground">Points Ledger</h1>
          <p className="mt-2 text-sm text-muted-foreground">Every point earned and spent, in one place.</p>
        </header>

        {error ? (
          <section className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-700">
            {error}
          </section>
        ) : entries.length === 0 ? (
          <section className="mt-8 rounded-[24px] border border-border bg-card p-10 text-center shadow-[0_4px_20px_rgba(62,39,35,.06)]">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#fff8e6] text-[#855300]"><Gift size={24} /></div>
            <p className="mt-5 font-serif text-xl font-bold text-foreground">No transactions yet. Place your first order to earn points!</p>
          </section>
        ) : (
          <section className="mt-8 space-y-3" aria-label="Reward point transactions">
            {entries.map((entry) => {
              const createdAt = toMillis(entry.created_at);
              return (
                <article key={entry.id} className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4 shadow-[0_4px_16px_rgba(62,39,35,.04)]">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#f0eee6] text-primary"><ReceiptText size={19} /></div>
                    <div className="min-w-0">
                      <h2 className="truncate text-sm font-bold text-foreground">{getDescription(entry, entry.order_id ? ordersById.get(entry.order_id) : undefined)}</h2>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {createdAt ? new Date(createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Date unavailable'}
                      </p>
                    </div>
                  </div>
                  <p className={`shrink-0 font-mono text-lg font-black ${entry.amount >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {entry.amount >= 0 ? '+' : ''}{entry.amount} <span className="text-[10px] uppercase text-muted-foreground">pts</span>
                  </p>
                </article>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}
