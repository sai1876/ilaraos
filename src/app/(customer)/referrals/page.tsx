'use client';

import Link from 'next/link';
import { CheckCircle2, Copy, Gift, Share2, Users } from 'lucide-react';
import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { getReferralProgress } from '@/lib/customerExperience';

const MILESTONES = [
  { target: 5, reward: 'Free Fries', icon: Gift },
  { target: 8, reward: 'Free Shake', icon: Share2 },
  { target: 15, reward: 'Popcorn Basket', icon: Users },
];

export default function ReferralsPage() {
  const { user, userProfile, authLoading } = useStore();
  const [copied, setCopied] = useState(false);
  const count = userProfile?.successful_referrals ?? 0;
  const code = userProfile?.referral_code ?? 'ILARA50';
  const link = typeof window === 'undefined' ? `ilara.app/ref/${code}` : `${window.location.origin}/signup?ref=${code}`;
  const copy = async () => {
    await navigator.clipboard?.writeText(link);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };
  const share = async () => {
    if (navigator.share) await navigator.share({ title: 'Join Ilara', text: 'Join me at Ilara and unlock a treat.', url: link });
    else await copy();
  };

  return (
    <main className="min-h-screen bg-background px-4 pb-28 pt-10 md:pt-28 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
          
          {/* Left Column: Vibe section + Link section */}
          <div className="md:col-span-6 space-y-6">
            <section className="relative overflow-hidden rounded-[24px] bg-[#f0eee6] p-7 text-center shadow-[0_4px_20px_rgba(62,39,35,.06)]">
              <div className="absolute inset-0 opacity-30 [background:radial-gradient(circle_at_top_right,#30c88f,transparent_38%),radial-gradient(circle_at_bottom_left,#f59e0b,transparent_45%)]" />
              <div className="relative">
                <p className="text-sm font-semibold text-primary">REFER & EARN</p>
                <h1 className="mt-2 font-serif text-3xl font-bold text-foreground">Share the Ilara vibe</h1>
                <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-muted-foreground">Bring friends to your favourite study spot. When they join, you both unlock exclusive treats.</p>
              </div>
            </section>

            {authLoading ? (
              <section className="rounded-[24px] border border-border bg-card p-6 shadow-[0_4px_20px_rgba(62,39,35,.06)]" aria-label="Loading referral account">
                <div className="h-4 w-36 animate-pulse rounded bg-muted" />
                <div className="mt-4 h-12 w-full animate-pulse rounded-xl bg-muted" />
                <div className="mt-3 h-12 w-full animate-pulse rounded-xl bg-muted" />
              </section>
            ) : user ? (
              <section className="rounded-[24px] border border-border bg-card p-6 shadow-[0_4px_20px_rgba(62,39,35,.06)]">
                <p className="text-sm font-semibold text-muted-foreground">Your personal link</p>
                <p className="mt-1 text-xs font-semibold text-[#867461]">Earn 50 pts when a friend signs up with your code.</p>
                <div className="mt-3 flex gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-xl border border-border bg-muted px-3 py-3 text-sm text-foreground">{link}</code>
                  <button onClick={copy} className="rounded-xl border border-border bg-card p-3 text-primary" aria-label={copied ? 'Referral link copied' : 'Copy referral link'}>{copied ? <CheckCircle2 size={18} /> : <Copy size={18} />}</button>
                </div>
                <button onClick={share} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#f59e0b] py-3.5 text-sm font-bold text-[#613b00]"><Share2 size={17} /> Share with friends</button>
              </section>
            ) : (
              <section className="rounded-[24px] bg-card p-6 text-center shadow-[0_4px_20px_rgba(62,39,35,.06)]">
                <p className="text-muted-foreground">Sign in to get your personal referral link.</p>
                <Link href="/profile" className="mt-4 inline-flex rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-white">Sign in</Link>
              </section>
            )}
          </div>

          {/* Right Column: Milestones */}
          <div className="md:col-span-6">
            {authLoading ? (
              <section aria-label="Loading referral milestones">
                <div className="h-8 w-52 animate-pulse rounded bg-muted" />
                <div className="mt-4 space-y-3">
                  {[1, 2, 3].map((item) => <div key={item} className="h-24 animate-pulse rounded-2xl border border-border bg-card" />)}
                </div>
              </section>
            ) : (
              <section>
              <h2 className="font-serif text-2xl font-bold text-foreground">Your milestone map</h2>
              <div className="mt-4 space-y-3">
                {MILESTONES.map(({ target, reward, icon: Icon }) => {
                  const complete = count >= target;
                  const progress = getReferralProgress(count, target);
                  return (
                    <article key={target} className={`rounded-2xl border bg-card p-4 shadow-[0_4px_20px_rgba(62,39,35,.06)] ${complete ? 'border-[#f59e0b]/50' : 'border-border'}`}>
                      <div className="flex items-center gap-4">
                        <div className="grid h-14 w-14 place-items-center rounded-full bg-[#f0eee6] text-primary">
                          <Icon size={24} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{target} friends</p>
                          <h3 className="font-serif text-xl font-bold text-foreground">{reward}</h3>
                          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#e4e3db]">
                            <div className="h-full rounded-full bg-[#f59e0b]" style={{ width: `${progress}%` }} />
                          </div>
                        </div>
                        {complete ? <CheckCircle2 className="text-[#006c49]" /> : <span className="text-sm font-semibold text-muted-foreground">{count}/{target}</span>}
                      </div>
                    </article>
                  );
                })}
              </div>
              </section>
            )}
          </div>

        </div>
      </div>
    </main>
  );
}
