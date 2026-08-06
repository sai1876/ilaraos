'use client';

import Link from 'next/link';
import { CheckCircle2, Clock3, MapPin, PackageCheck, Store } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getUserOrders } from '@/lib/dbService';
import { OrderDocument } from '@/lib/types';
import { useStore } from '@/store/useStore';
import { getOrderProgressIndex, ORDER_PROGRESS_STEPS } from '@/lib/customerExperience';

export default function OrderStatusPage() {
  const params = useParams<{ orderId: string }>();
  const { user, activeOrders } = useStore();
  const id = decodeURIComponent(params.orderId ?? '');
  const [order, setOrder] = useState<OrderDocument | undefined>(() => activeOrders.find((entry) => entry.order_id === id));
  useEffect(() => { if (!user?.uid) return; getUserOrders(user.uid).then((orders) => setOrder(orders.find((entry) => entry.order_id === id))).catch(console.error); }, [id, user?.uid]);

  if (!user) return <main className="grid min-h-screen place-items-center bg-background px-6 text-center"><div><h1 className="font-serif text-3xl font-bold">Sign in to track your order</h1><Link href="/profile" className="mt-4 inline-flex rounded-full bg-primary px-5 py-2.5 font-bold text-white">Sign in</Link></div></main>;
  if (!order) return <main className="grid min-h-screen place-items-center bg-background px-6 text-center"><div><h1 className="font-serif text-3xl font-bold">Finding your order…</h1><p className="mt-2 text-muted-foreground">If it is not available yet, try again in a moment.</p><Link href="/profile" className="mt-4 inline-flex text-primary font-semibold">Back to profile</Link></div></main>;

  const current = getOrderProgressIndex(order.status);
  return (
    <main className="min-h-screen bg-background px-4 pb-28 pt-8 md:pt-28 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <header className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-1.5">
            <img src="/images/logo_icon.png" alt="Ilara Emblem" className="h-6 w-auto object-contain" />
            <span className="font-serif text-xl font-bold text-primary">Ilara</span>
          </Link>
          <span className="hau-hau-pill">Order {order.token_number}</span>
        </header>

        <section className="mt-8 hau-hau-card p-6">
          <CheckCircle2 className="text-[#006c49]" size={38} />
          <h1 className="mt-4 font-serif text-4xl font-bold text-foreground">Order confirmed!</h1>
          <p className="mt-2 text-muted-foreground">Your food is being prepared with love. Relax and enjoy the campus vibe.</p>
          <div className="mt-6 flex items-center gap-3 rounded-2xl bg-[#f0eee6] p-4">
            <div className="grid h-11 w-11 place-items-center rounded-full bg-card text-primary">
              <Store size={20} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{order.order_type}</p>
              <p className="font-semibold text-foreground">
                {order.order_type === 'dine-in' ? `Table ${order.table_no || 'assigned'}` : order.order_type === 'delivery' ? 'Delivery in progress' : `Collect at ${order.hatch || 'the counter'}`}
              </p>
            </div>
          </div>
          {order.otp && (
            <p className="mt-4 rounded-xl border border-[#f59e0b]/30 bg-[#ffddb8]/50 px-4 py-3 text-sm font-semibold text-[#613b00]">
              Delivery OTP: {order.otp}
            </p>
          )}
        </section>

        <section className="mt-6 hau-hau-card p-6">
          <h2 className="font-serif text-2xl font-bold">Live status</h2>
          <div className="mt-6 space-y-5">
            {ORDER_PROGRESS_STEPS.map((step, index) => {
              const done = index <= current;
              return (
                <div key={step} className="flex items-center gap-4">
                  <div className={`grid h-9 w-9 place-items-center rounded-full ${done ? 'bg-[#30c88f] text-[#004e34]' : 'bg-[#e4e3db] text-muted-foreground'}`}>
                    {index === 1 ? <Clock3 size={17} /> : index === 2 ? <PackageCheck size={17} /> : <CheckCircle2 size={17} />}
                  </div>
                  <div>
                    <p className="font-semibold capitalize text-foreground">{step === 'completed' ? 'Completed' : step}</p>
                    <p className="text-sm text-muted-foreground">{index === current ? 'Current order status' : done ? 'Completed' : 'Pending'}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <Link href="/menu" className="mt-6 flex items-center justify-center gap-2 rounded-xl border border-border bg-card py-3.5 font-bold text-primary">
          <MapPin size={17} /> Order something else
        </Link>
      </div>
    </main>
  );
}
