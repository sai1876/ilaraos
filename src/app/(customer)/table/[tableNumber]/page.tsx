'use client';

import Link from 'next/link';
import { LockKeyhole, ShoppingBag, UtensilsCrossed } from 'lucide-react';
import { useParams, useSearchParams } from 'next/navigation';
import { useStore } from '@/store/useStore';
import { getTableCheckoutHref } from '@/lib/customerExperience';

export default function TableCheckoutPage() {
  const params = useParams<{ tableNumber: string }>();
  const searchParams = useSearchParams();
  const tableNumber = decodeURIComponent(params.tableNumber ?? '');
  const tableToken = searchParams.get('tableToken') || '';
  const cartCount = useStore((state) => state.cart.reduce((total, item) => total + item.quantity, 0));

  return (
    <main className="min-h-screen bg-background px-4 pb-28 pt-8 md:pt-28 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <header className="flex items-center justify-between"><Link href="/menu" className="flex items-center gap-1.5"><img src="/images/logo_icon.png" alt="Ilara Emblem" className="h-6 w-auto object-contain" /><span className="font-serif text-xl font-bold text-primary">Ilara</span></Link><span className="hau-hau-pill inline-flex items-center gap-1 text-[#006c49]"><span className="h-2 w-2 rounded-full bg-[#006c49]" /> Open</span></header>
        <section className="mt-8 rounded-[24px] border border-border bg-card p-6 shadow-[0_4px_20px_rgba(62,39,35,.06)]">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-[#f0eee6] text-primary"><UtensilsCrossed size={25} /></div>
          <p className="mt-5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Dine-in</p>
          <h1 className="mt-1 font-serif text-4xl font-bold text-foreground">Dining at Table {tableNumber}</h1>
          <p className="mt-3 leading-6 text-muted-foreground">This QR is linked to your table. Your order will be served here after it is prepared.</p>
          <div className="mt-5 flex items-center gap-2 rounded-xl bg-[#f5f4ec] p-3 text-sm text-[#534434]"><LockKeyhole size={16} className="text-primary" /> Table identity is locked for this order.</div>
          {tableToken ? (
            <Link href={getTableCheckoutHref(tableNumber, tableToken)} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#f59e0b] py-4 font-bold text-[#613b00]"><ShoppingBag size={18} /> {cartCount ? `Review ${cartCount} item${cartCount === 1 ? '' : 's'}` : 'Start your order'}</Link>
          ) : (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm font-semibold text-red-700">
              This table link is invalid or incomplete. Please scan the QR displayed at your table again.
            </div>
          )}
          {!cartCount && <Link href="/menu" className="mt-3 block text-center text-sm font-semibold text-primary">Browse the menu</Link>}
        </section>
      </div>
    </main>
  );
}
