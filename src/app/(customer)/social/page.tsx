'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
// Import sub-views
import SocialHub from '@/components/social/SocialHub';
import BookCricket from '@/components/social/BookCricket';
import BookingDetails from '@/components/social/BookingDetails';
import PaymentCheckout from '@/components/social/PaymentCheckout';
import BookingConfirmed from '@/components/social/BookingConfirmed';
import MyActivities from '@/components/social/MyActivities';

type SocialView = 'hub' | 'book' | 'details' | 'checkout' | 'confirmed' | 'activities';

export default function SocialPage() {
  const [view, setView] = useState<SocialView>('hub');

  // Slide transition config
  const variants = {
    enter: { opacity: 0, x: 20 },
    center: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 }
  };

  // Scroll to top on view changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [view]);

  return (
    <main className="min-h-screen bg-background px-4 pb-48 pt-8 md:pb-28 md:pt-28 sm:px-6 relative overflow-hidden">
      
      {/* Aesthetic Background Decorative Blobs matching the site theme */}
      <div className="absolute top-10 left-10 w-64 h-64 rounded-full bg-[#FAF6F0] border border-[#E8DFD3]/40 -z-10 blur-2xl" />
      <div className="absolute bottom-20 right-10 w-80 h-80 rounded-full bg-[#F3ECE3]/40 border border-[#E8DFD3]/40 -z-10 blur-3xl" />

      <div className="mx-auto max-w-4xl min-h-[75vh]">
        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.2, ease: "easeInOut" }}
          >
            {view === 'hub' && (
              <SocialHub onNavigate={setView} />
            )}
            
            {view === 'book' && (
              <BookCricket onNavigate={setView} />
            )}

            {view === 'details' && (
              <BookingDetails onNavigate={setView} />
            )}

            {view === 'checkout' && (
              <PaymentCheckout onNavigate={setView} />
            )}

            {view === 'confirmed' && (
              <BookingConfirmed onNavigate={setView} />
            )}

            {view === 'activities' && (
              <MyActivities onNavigate={setView} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

    </main>
  );
}
