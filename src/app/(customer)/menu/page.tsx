'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, MapPin, X, Star,
  Check, Tag, SlidersHorizontal, Coffee, RotateCw
} from 'lucide-react';
import { fetchMenuItems, fetchOffers, fetchPincodeDetails } from '@/lib/dbService';
import { useStore } from '@/store/useStore';
import { MenuItem, Offer } from '@/lib/types';
import CustomizationModal from '@/components/customer/CustomizationModal';

const CATEGORIES = ['All', 'Biryani', 'Momos', 'Burgers', 'Waffles', 'Snacks', 'Beverages'] as const;
type Category = typeof CATEGORIES[number];

const CAT_META: Record<string, { img: string; emoji: string; color: string; bg: string }> = {
  All:       { img: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=200&auto=format&fit=crop&q=80', emoji: '✨', color: '#B89C48', bg: '#F9F6EE' },
  Biryani:   { img: 'https://images.unsplash.com/photo-1633945274405-b6c8069047b0?w=200&auto=format&fit=crop&q=80', emoji: '🍲', color: '#B89C48', bg: '#F9F6EE' },
  Momos:     { img: 'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?w=200&auto=format&fit=crop&q=80', emoji: '🥟', color: '#B89C48', bg: '#F9F6EE' },
  Burgers:   { img: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=200&auto=format&fit=crop&q=80', emoji: '🍔', color: '#B89C48', bg: '#F9F6EE' },
  Waffles:   { img: 'https://images.unsplash.com/photo-1562376502-6f769499c886?w=200&auto=format&fit=crop&q=80', emoji: '🧇', color: '#B89C48', bg: '#F9F6EE' },
  Snacks:    { img: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=200&auto=format&fit=crop&q=80', emoji: '🍟', color: '#B89C48', bg: '#F9F6EE' },
  Beverages: { img: 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=200&auto=format&fit=crop&q=80', emoji: '🥤', color: '#B89C48', bg: '#F9F6EE' },
};

function SortDropdown({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const opts = [
    { value: 'default',    label: 'Recommended' },
    { value: 'price_asc',  label: 'Price: Low → High' },
    { value: 'price_desc', label: 'Price: High → Low' },
  ];
  return (
    <div className="relative shrink-0 select-none">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center justify-center w-[52px] h-[52px] bg-[#FFFFFF] border border-[#B89C48]/45 rounded-xl text-[#B89C48] hover:bg-[#B89C48]/5 transition-colors duration-200 outline-none shadow-sm"
      >
        <SlidersHorizontal size={18} />
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.ul
              initial={{ opacity: 0, y: 4, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.97 }}
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
              className="absolute right-0 top-full mt-2 bg-[#FFFFFF] border border-[#B89C48]/35 rounded-2xl overflow-hidden z-50 min-w-[180px] shadow-[0_12px_32px_rgba(26,26,23,0.08)] py-1.5"
            >
              {opts.map(o => (
                <li key={o.value}>
                  <button
                    onClick={() => { onChange(o.value); setOpen(false); }}
                    className={`w-full text-left px-4 py-3 text-[12px] font-semibold flex items-center justify-between transition-colors ${
                      o.value === value 
                        ? 'text-[#FFFFFF] bg-[#B89C48]' 
                        : 'text-[#1A1A17] hover:bg-[#F9F6EE]'
                    }`}
                  >
                    <span className="font-mono uppercase tracking-wider">{o.label}</span>
                    {o.value === value && <Check size={12} className={o.value === value ? 'text-[#FFFFFF]' : 'text-[#B89C48]'} />}
                  </button>
                </li>
              ))}
            </motion.ul>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
const ITEM_IMAGE_MAP: Record<string, string> = {
  'hyderabadi chicken biryani': 'https://images.unsplash.com/photo-1633945274405-b6c8069047b0?w=300&auto=format&fit=crop&q=80',
  'steamed chicken momos':      'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?w=300&auto=format&fit=crop&q=80',
  'classic chicken burger':     'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=300&auto=format&fit=crop&q=80',
  'belgian chocolate waffle':   'https://images.unsplash.com/photo-1562376502-6f769499c886?w=300&auto=format&fit=crop&q=80',
  'crispy french fries':        'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=300&auto=format&fit=crop&q=80',
  'classic cold coffee':        'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=300&auto=format&fit=crop&q=80',
};

function getItemImage(item: MenuItem) {
  if (item.image_url && item.image_url.startsWith('http')) {
    return item.image_url;
  }
  const key = item.name.toLowerCase().trim();
  if (ITEM_IMAGE_MAP[key]) return ITEM_IMAGE_MAP[key];
  if (key.includes('biryani')) return ITEM_IMAGE_MAP['hyderabadi chicken biryani'];
  if (key.includes('momo')) return ITEM_IMAGE_MAP['steamed chicken momos'];
  if (key.includes('burger')) return ITEM_IMAGE_MAP['classic chicken burger'];
  if (key.includes('waffle')) return ITEM_IMAGE_MAP['belgian chocolate waffle'];
  if (key.includes('fries') || key.includes('french fries')) return ITEM_IMAGE_MAP['crispy french fries'];
  if (key.includes('coffee') || key.includes('beverage')) return ITEM_IMAGE_MAP['classic cold coffee'];
  return null;
}

function ItemCard({ item, onAdd }: { item: MenuItem; onAdd: () => void }) {
  const cat = CAT_META[item.category] || CAT_META.All;
  const cartItems = useStore(s => s.cart);
  const qty = cartItems.filter(c => c.menuItemId === item.item_id).reduce((sum, c) => sum + c.quantity, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-20px" }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      onClick={onAdd}
      className="bg-[#FFFDFC] rounded-2xl p-5 shadow-[0_4px_20px_rgba(36,26,21,0.02)] border border-[#E8DFD3] flex gap-5 cursor-pointer hover:scale-[1.01] hover:border-[#9A642C]/40 hover:shadow-[0_8px_32px_rgba(154,100,44,0.06)] active:scale-[0.99] transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] relative overflow-hidden group"
    >
      <div className="noise-overlay" />
      {/* Left: text content */}
      <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5 relative z-10">
        <div>
          {/* Badges row */}
          <div className="flex items-center gap-2 mb-2.5 flex-wrap">
            {item.is_featured && (
              <span className="inline-flex items-center gap-1 bg-transparent border border-[#9A642C]/40 text-[#9A642C] text-[9px] font-black uppercase tracking-[0.15em] px-2 py-0.5 rounded-md font-mono">
                <Star size={8} fill="currentColor" /> Bestseller
              </span>
            )}
            {qty > 0 && (
              <span className="inline-flex items-center bg-[#9A642C] border border-[#9A642C]/20 text-[#FFFDFC] text-[9px] font-black px-2 py-0.5 rounded-md font-mono uppercase tracking-wider">
                {qty} in cart
              </span>
            )}
          </div>

          <h3 className="text-[#241A15] text-[18px] font-semibold leading-snug font-serif mb-1 line-clamp-2">{item.name}</h3>
          <p className="text-[#9A642C] font-light text-xl leading-none font-mono mt-2">₹ {item.price}</p>
        </div>
        <p className="text-[#66554A] text-xs font-medium leading-relaxed mt-2 line-clamp-2">{item.description}</p>
      </div>

      {/* Right: image + CTA */}
      <div className="flex flex-col items-center gap-0 shrink-0 relative z-10">
        <div
          className="w-[120px] h-[120px] rounded-xl overflow-hidden relative border border-[#E8DFD3] bg-[#F3ECE3]"
        >
          {getItemImage(item) ? (
            <img src={getItemImage(item)!} alt={item.name} className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[42px] select-none">
              {cat.emoji}
            </div>
          )}
          {!item.is_available && (
            <div className="absolute inset-0 bg-[#FFFDFC]/80 backdrop-blur-[2px] flex items-center justify-center">
              <span className="text-[#B42318] text-[9px] font-black uppercase tracking-widest px-2 py-1 bg-[#FFFDFC] rounded-md border border-[#B42318]/45 shadow-md">SOLD OUT</span>
            </div>
          )}
        </div>

        {item.is_available && (
          <button
            onClick={e => { e.stopPropagation(); onAdd(); }}
            className={`
              relative -mt-[20px] z-20
              w-10 h-10 rounded-full flex items-center justify-center
              border-2 border-[#9A642C] shadow-[0_4px_12px_rgba(154,100,44,0.12)]
              transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]
              ${qty > 0 
                ? 'bg-[#9A642C] text-[#FFFDFC] shadow-[0_0_12px_rgba(154,100,44,0.35)]' 
                : 'bg-[#FFFDFC] text-[#9A642C] hover:bg-[#9A642C] hover:text-[#FFFDFC]'
              }
            `}
          >
            {qty > 0 ? (
              <span className="text-xs font-mono font-black">{qty}</span>
            ) : (
              <span className="text-xl leading-none font-light">+</span>
            )}
          </button>
        )}
      </div>
    </motion.div>
  );
}

export default function MenuPage() {
  const [mounted, setMounted] = useState(false);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<Category>('All');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'default' | 'price_asc' | 'price_desc'>('default');
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const catScrollRef = useRef<HTMLDivElement>(null);

  const [offers, setOffers] = useState<Offer[]>([]);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Hero Location Modal States
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [modalPincode, setModalPincode] = useState('');
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState('');
  const [modalPostOffices, setModalPostOffices] = useState<any[]>([]);
  const [modalSelectedOffice, setModalSelectedOffice] = useState<any>(null);
  const [isLocationVerified, setIsLocationVerified] = useState(false);

  const { addToCart, customerOutlet, setCustomerOutlet, activeOrders } = useStore();
  const activeOrdersCount = activeOrders.filter(o => o.status !== 'completed' && o.status !== 'cancelled').length;

  // Debounced Indian PIN code lookup effect for Hero Location Modal
  useEffect(() => {
    // Check if exactly 6 numeric digits are present
    if (!/^\d{6}$/.test(modalPincode)) {
      setModalPostOffices([]);
      setModalSelectedOffice(null);
      setModalError('');
      return;
    }

    const delayDebounce = setTimeout(async () => {
      setModalLoading(true);
      setModalError('');
      setModalPostOffices([]);
      setModalSelectedOffice(null);

      try {
        const details = await fetchPincodeDetails(modalPincode);
        if (details && details.length > 0) {
          setModalPostOffices(details);
          setModalSelectedOffice(details[0]);
        } else {
          setModalError('We could not find this PIN code. Please enter details manually.');
        }
      } catch (err: any) {
        console.error('Modal PIN lookup error:', err);
        setModalError('We could not find this PIN code. Please enter details manually.');
      } finally {
        setModalLoading(false);
      }
    }, 500);

    return () => clearTimeout(delayDebounce);
  }, [modalPincode]);


  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    Promise.all([
      fetchMenuItems().then(data => setItems(data.sort((a, b) => {
        const oa = a.sort_order ?? 0, ob = b.sort_order ?? 0;
        return oa !== ob ? oa - ob : b.item_id.localeCompare(a.item_id);
      }))),
      fetchOffers().then(data => setOffers(data.filter(o => o.isActive))),
    ]).catch(console.error).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let result = items.filter(item => {
      const matchCat = activeCategory === 'All' || item.category === activeCategory;
      const matchSearch = item.name.toLowerCase().includes(search.toLowerCase());
      return matchCat && matchSearch;
    });
    if (sortBy === 'price_asc') result.sort((a, b) => a.price - b.price);
    else if (sortBy === 'price_desc') result.sort((a, b) => b.price - a.price);
    else result.sort((a, b) => {
      const oa = a.sort_order ?? 0, ob = b.sort_order ?? 0;
      return oa !== ob ? oa - ob : b.item_id.localeCompare(a.item_id);
    });
    return result;
  }, [items, activeCategory, search, sortBy]);

  return (
    <div className="min-h-screen bg-[#FAF7F2] pb-48 pt-0 md:pb-28 -webkit-font-smoothing-antialiased">
      <div className="noise-overlay fixed inset-0 pointer-events-none" />

      {/* ══ HERO BANNER (NOT STICKY) ══ */}
      <div className="relative h-[220px] md:h-[280px] w-full overflow-hidden flex items-end">
        <img 
          src="https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=1200&auto=format&fit=crop&q=80" 
          alt="Ilara Hero" 
          className="absolute inset-0 w-full h-full object-cover brightness-[0.75]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#FAF7F2] via-[#FAF7F2]/40 to-black/30" />
        
        <div className="relative z-10 px-6 pb-6 md:pb-8 w-full max-w-7xl mx-auto pt-20 md:pt-28 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <span className="font-serif text-3xl md:text-4xl font-extrabold text-white tracking-tight drop-shadow-md">
              Our Creations
            </span>
            <p className="text-white/80 text-xs md:text-sm font-medium mt-1 drop-shadow-sm font-sans max-w-md">
              Freshly prepared modern Indian kitchen delicacies, tailored to your tastes.
            </p>
          </div>
          <div className="relative">
            <button
              onClick={() => setIsLocationModalOpen(true)}
              className="flex items-center gap-1.5 bg-[#241A15]/75 hover:bg-[#241A15]/90 backdrop-blur-md px-3 py-2 rounded-xl border border-white/10 w-fit shadow-lg transition-all duration-200 active:scale-95 text-left"
            >
              <MapPin size={12} className="text-[#C3924F]" />
              <span className="text-[#FFFDFC] text-[10px] font-black uppercase tracking-[0.2em] font-mono leading-none flex items-center gap-1">
                {mounted ? customerOutlet : 'HYD CAMPUS'} · STUDENT PRICING
                <span className="text-[#C3924F] text-[8px] font-sans lowercase tracking-normal font-normal">▼</span>
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* ══ STICKY SEARCH, SORT & FILTERS BAR ══ */}
      <div className="sticky top-0 md:top-[80px] z-40 bg-[#FAF7F2]/90 backdrop-blur-md border-b border-[#E8DFD3]/85 shadow-[0_4px_30px_rgba(36,26,21,0.02)]">
        {/* Search + Sort Row */}
        <div className="px-4 py-4 max-w-7xl mx-auto sm:px-6 lg:px-8">
          <div className="flex gap-3 w-full">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[rgba(36,26,21,0.4)]" />
              <input
                ref={searchRef}
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search biryani, momos, burgers…"
                className="w-full h-[52px] bg-[#FFFDFC] border border-[#E8DFD3] rounded-xl pl-11 pr-10 text-[#241A15] text-sm font-medium italic outline-none focus:border-[#9A642C] focus:bg-[#FFFDFC] focus:ring-1 focus:ring-[#9A642C]/20 transition-all duration-300 placeholder:text-[rgba(36,26,21,0.3)] shadow-inner"
              />
              {search && (
                <button 
                  onClick={() => setSearch('')} 
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-[#241A15]/5 flex items-center justify-center hover:bg-[#241A15]/10 transition-colors"
                >
                  <X size={11} className="text-[#241A15]" />
                </button>
              )}
            </div>
            <SortDropdown value={sortBy} onChange={v => setSortBy(v as any)} />
          </div>
        </div>

        {/* Category Pills Scroller */}
        <div className="px-4 pb-4 max-w-7xl mx-auto sm:px-6 lg:px-8 select-none border-t border-[#E8DFD3]/40 pt-3">
          <div
            ref={catScrollRef}
            className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1"
          >
            {CATEGORIES.map(cat => {
              const active = activeCategory === cat;
              const meta = CAT_META[cat];
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className="relative h-9 px-4 rounded-full flex items-center gap-1.5 justify-center shrink-0 transition-all duration-200 active:scale-95 border z-10"
                  style={{
                    background: active ? '#9A642C' : '#FFFDFC',
                    borderColor: active ? '#9A642C' : '#E8DFD3',
                    boxShadow: active ? '0 4px 12px rgba(154,100,44,0.15)' : '0 1px 3px rgba(36,26,21,0.03)',
                  }}
                >
                  {active && (
                    <motion.div
                      layoutId="active-cat-bg"
                      className="absolute inset-0 bg-[#9A642C] rounded-full -z-10"
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    />
                  )}
                  <span className="text-sm leading-none">{meta?.emoji}</span>
                  <span
                    className={`text-[11px] font-bold tracking-wide transition-colors uppercase ${
                      active ? 'text-[#FFFDFC]' : 'text-[#66554A]'
                    }`}
                  >
                    {cat}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Active Order Tracker Alert Banner */}
        {mounted && activeOrdersCount > 0 && (
          <div className="bg-[#FFFDFC] border-t border-[#E8DFD3] px-5 py-3 text-xs">
            <div className="mx-auto max-w-7xl flex items-center justify-between gap-3 w-full">
              <div className="flex items-center gap-2.5 text-[#241A15] min-w-0">
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#9A642C] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#9A642C]"></span>
                </span>
                <span className="font-medium truncate text-xs tracking-wide text-[#241A15]">
                  {activeOrdersCount === 1 
                    ? `Order tracking active: ${activeOrders[0].status === 'ready' ? 'Ready for pickup!' : 'Preparing in kitchen'}`
                    : `You have ${activeOrdersCount} active orders in progress`}
                </span>
              </div>
              <button
                onClick={() => {
                  const { setIsTrackerOpen, setSelectedTrackerOrderId } = useStore.getState();
                  if (activeOrdersCount === 1) {
                    setSelectedTrackerOrderId(activeOrders[0].order_id);
                  } else {
                    setSelectedTrackerOrderId(null);
                  }
                  setIsTrackerOpen(true);
                }}
                className="bg-[#9A642C] hover:bg-[#805020] active:scale-95 text-[#FFFDFC] font-black text-[9px] uppercase tracking-[0.15em] px-3.5 py-2 rounded-xl transition-all shrink-0 font-mono border border-[#9A642C]/20"
              >
                Track
              </button>
            </div>
          </div>
        )}
      </div>


      {/* ══ OFFERS CAROUSEL ══ */}
      {offers.length > 0 && (
        <div className="bg-[#FAF7F2] px-4 pt-10 pb-12 border-b border-[#E8DFD3]/40">
          <div className="mx-auto max-w-7xl sm:px-6 lg:px-8">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[#241A15] text-[11px] font-black tracking-[0.25em] uppercase font-mono">Top Offers</h2>
              <span className="flex items-center gap-1.5 text-[#9A642C] text-[10px] font-bold uppercase tracking-widest font-mono bg-[#FFFDFC] border border-[#E8DFD3] px-3 py-1 rounded-full shadow-sm">
                <Tag size={10} className="stroke-[2.5]" /> {offers.length} active
              </span>
            </div>
            <div className="flex gap-4 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
              {offers.map(offer => (
                <div
                  key={offer.code}
                  className="shrink-0 w-[290px] min-h-[178px] bg-[#FFFDFC] rounded-2xl border border-[#E8DFD3] flex flex-col justify-between relative overflow-hidden group shadow-[0_4px_20px_rgba(36,26,21,0.02)] hover:border-[#C3924F]/40 hover:shadow-[0_12px_28px_rgba(195,146,79,0.06)] transition-all duration-300"
                >
                  {/* Top gradient color band */}
                  <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#e8b563] via-[#C3924F] to-[#b8842e]" />
                  <div className="noise-overlay" />
                  
                  <div className="p-5 flex-1 flex flex-col justify-between">
                    {/* Top Row: Discount & Scope */}
                    <div className="flex justify-between items-start">
                      <div className="flex flex-col">
                        <span className="text-3xl font-extrabold text-[#241A15] font-serif leading-none tracking-tight">
                          {offer.discountPercent}% <span className="text-xs font-sans uppercase tracking-widest text-[#9A642C] font-black">OFF</span>
                        </span>
                        <span className="text-[8px] font-black text-[#8c7460] uppercase tracking-widest mt-1.5 font-mono">
                          {offer.categoryScope && offer.categoryScope.toLowerCase() !== 'all'
                            ? `${offer.categoryScope}`
                            : 'All items'}
                        </span>
                      </div>

                      {/* Promo Code Stub */}
                      <div className="border border-dashed border-[#C3924F] bg-[#FAF7F2] px-3 py-1 rounded-lg text-[10px] font-mono font-bold tracking-wider text-[#9A642C] shadow-inner select-all">
                        {offer.code}
                      </div>
                    </div>

                    {/* Middle Row: Description */}
                    <p className="text-[#66554A] text-[12px] font-medium leading-relaxed mt-3.5 line-clamp-2">
                      {offer.description}
                    </p>

                    {/* Bottom Row: Minimalist Copy Action */}
                    <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#E8DFD3]/60 pt-3">
                      <span className="text-[9px] font-mono font-bold text-[#8c7460] uppercase tracking-widest">
                        Promo Code
                      </span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(offer.code);
                          setCopiedCode(offer.code);
                          setTimeout(() => setCopiedCode(null), 2000);
                        }}
                        className={`px-4 py-1.5 rounded-full text-[9px] font-mono font-black tracking-wider uppercase transition-all duration-300 border ${
                          copiedCode === offer.code
                            ? 'bg-[#C3924F]/10 border-[#C3924F] text-[#9A642C] font-bold'
                            : 'bg-transparent border-[#E8DFD3] text-[#9A642C] hover:border-[#C3924F] hover:bg-[#C3924F]/5'
                        }`}
                      >
                        {copiedCode === offer.code ? '✓ Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}


      {/* ══ MENU ITEMS ══ */}
      <div className="bg-[#FAF7F2] px-4 max-w-7xl mx-auto sm:px-6 lg:px-8 pb-12">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex gap-4 p-5 bg-[#FFFDFC] rounded-2xl border border-[#E8DFD3] shadow-[0_4px_20px_rgba(36,26,21,0.01)]">
                <div className="flex-1 flex flex-col gap-2.5">
                  <div className="h-3.5 w-20 rounded bg-[#F3ECE3] animate-pulse" />
                  <div className="h-5 w-3/4 rounded bg-[#F3ECE3] animate-pulse" />
                  <div className="h-4 w-12 rounded bg-[#F3ECE3] animate-pulse" />
                  <div className="h-3 w-full rounded bg-[#F3ECE3] animate-pulse" />
                </div>
                <div className="w-[120px] h-[120px] rounded-xl bg-[#F3ECE3] animate-pulse shrink-0" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-24 px-4 text-center">
            <span className="text-5xl mb-3 select-none">🍽️</span>
            <p className="text-[#241A15] text-base font-bold font-serif">No creations found</p>
            <p className="text-[#66554A] text-sm mt-1">Try another category or refine your query.</p>
            {search && (
              <button
                onClick={() => setSearch('')}
                className="mt-4 px-6 py-2.5 rounded-full bg-[#9A642C]/10 border border-[#9A642C]/20 text-[#9A642C] text-xs font-mono font-bold uppercase tracking-wider hover:bg-[#9A642C] hover:text-[#FFFDFC] transition-colors"
              >
                Clear Query
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-12">
            <div>
              {/* Section label */}
              <div className="flex items-center justify-between mb-5 border-b border-[#E8DFD3] pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-base">{activeCategory === 'All' ? '⭐' : CAT_META[activeCategory]?.emoji}</span>
                  <span className="text-[#241A15] text-sm font-black tracking-[0.25em] uppercase font-mono">
                    {activeCategory === 'All' ? 'Recommended for You' : activeCategory}
                  </span>
                </div>
                <span className="text-[#9A642C] text-[10px] font-bold uppercase tracking-widest font-mono bg-[#FFFDFC] border border-[#E8DFD3] px-3 py-1 rounded-full">
                  {filtered.length} items
                </span>
              </div>

              {/* Item rows */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filtered.map(item => (
                  <ItemCard key={item.item_id} item={item} onAdd={() => setSelectedItem(item)} />
                ))}
              </div>
            </div>

            {/* End of Menu decorative divider */}
            <div className="flex items-center justify-center gap-4 pt-4 pb-2 px-4 bg-[#FAF7F2]">
              <div className="flex-1 max-w-[80px] h-px bg-gradient-to-r from-transparent to-[#9A642C]/35" />
              <div className="text-[#9A642C] flex items-center gap-2 select-none">
                <span className="w-1 h-1 rounded-full bg-[#9A642C]" />
                <Coffee size={18} strokeWidth={1.5} />
                <span className="w-1 h-1 rounded-full bg-[#9A642C]" />
              </div>
              <div className="flex-1 max-w-[80px] h-px bg-gradient-to-l from-transparent to-[#9A642C]/35" />
            </div>
          </div>
        )}
      </div>

      {/* Customization Modal */}
      <CustomizationModal
        item={selectedItem}
        isOpen={!!selectedItem}
        onClose={() => setSelectedItem(null)}
        onConfirm={customizedItem => { addToCart(customizedItem); setSelectedItem(null); }}
      />

      {/* Location PIN Modal */}
      <AnimatePresence>
        {isLocationModalOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setIsLocationModalOpen(false);
                setModalPincode('');
                setModalError('');
                setModalPostOffices([]);
                setModalSelectedOffice(null);
                setIsLocationVerified(false);
              }}
              className="fixed inset-0 bg-[#241A15]/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            >
              {/* Modal Container */}
              <motion.div
                initial={{ scale: 0.95, y: 15, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={{ scale: 0.95, y: 15, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-[#FFFDFC] border border-[#E8DFD3] rounded-3xl w-full max-w-md p-6 shadow-2xl relative overflow-hidden flex flex-col gap-5"
              >
                {/* Noise overlay */}
                <div className="absolute inset-0 pointer-events-none opacity-[0.015] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-black via-transparent to-transparent" />
                
                {/* Header */}
                <div className="flex justify-between items-center relative z-10">
                  <span className="text-[#241A15] font-serif text-lg font-bold">Select Delivery Location</span>
                  <button
                    onClick={() => {
                      setIsLocationModalOpen(false);
                      setModalPincode('');
                      setModalError('');
                      setModalPostOffices([]);
                      setModalSelectedOffice(null);
                      setIsLocationVerified(false);
                    }}
                    className="w-7 h-7 rounded-full bg-[#FAF7F2] border border-[#E8DFD3] flex items-center justify-center hover:bg-[#FAF7F2]/80 transition-colors"
                  >
                    <X size={14} className="text-[#241A15]" />
                  </button>
                </div>

                {/* Content */}
                <div className="flex flex-col gap-4 relative z-10 font-sans">
                  <p className="text-[#66554A] text-xs leading-relaxed">
                    Enter your 6-digit PIN code to locate the nearest kitchen outlet or verify delivery support at your address.
                  </p>

                  {/* PIN code input wrapper */}
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] uppercase font-bold tracking-widest text-[#8c7460] font-mono">
                      Enter 6-Digit PIN Code
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        maxLength={6}
                        value={modalPincode}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                          setModalPincode(val);
                          setModalError('');
                        }}
                        placeholder="e.g. 500032"
                        className="w-full h-11 bg-[#FAF7F2] border border-[#E8DFD3] rounded-xl px-4 text-[#241A15] text-sm font-semibold outline-none focus:border-[#9A642C] transition-all"
                      />
                      {modalLoading && (
                        <div className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center">
                          <RotateCw size={14} className="animate-spin text-[#9A642C]" />
                        </div>
                      )}
                    </div>
                    {modalError && (
                      <p className="text-[#ef4444] text-[11px] font-medium mt-1">
                        ⚠️ {modalError}
                      </p>
                    )}
                  </div>

                  {/* Multiple Post Offices Selection dropdown */}
                  {modalPostOffices.length > 1 && !isLocationVerified && (
                    <div className="flex flex-col gap-2">
                      <label className="text-[10px] uppercase font-bold tracking-widest text-[#8c7460] font-mono">
                        Select Your Locality / Post Office
                      </label>
                      <select
                        onChange={(e) => {
                          const selected = modalPostOffices.find(po => po.Name === e.target.value);
                          setModalSelectedOffice(selected || null);
                        }}
                        className="w-full h-11 bg-[#FAF7F2] border border-[#E8DFD3]/80 rounded-xl px-3 text-[#241A15] text-xs font-semibold outline-none focus:border-[#9A642C] transition-all"
                      >
                        {modalPostOffices.map(po => (
                          <option key={po.Name} value={po.Name} className="text-[#000]">
                            {po.Name} ({po.BranchType})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Location Verification Prompt */}
                  {modalSelectedOffice && (
                    <div className="bg-[#FAF7F2] border border-[#E8DFD3] rounded-xl p-4 flex flex-col gap-3">
                      <div className="flex items-start gap-2.5">
                        <MapPin size={16} className="text-[#9A642C] shrink-0 mt-0.5" />
                        <div>
                          <p className="text-[#241A15] text-xs font-bold font-serif leading-tight">
                            {modalSelectedOffice.Name}
                          </p>
                          <p className="text-[#66554A] text-[10px] mt-0.5 leading-snug">
                            {modalSelectedOffice.District}, {modalSelectedOffice.State} - {modalSelectedOffice.Pincode}
                          </p>
                        </div>
                      </div>
                      
                      <p className="text-[10px] text-[#66554A]">
                        Please verify: Is this your correct address location?
                      </p>
                    </div>
                  )}
                </div>

                {/* Footer actions */}
                <div className="flex justify-end gap-3 mt-2 relative z-10 font-sans">
                  <button
                    type="button"
                    onClick={() => {
                      setIsLocationModalOpen(false);
                      setModalPincode('');
                      setModalError('');
                      setModalPostOffices([]);
                      setModalSelectedOffice(null);
                      setIsLocationVerified(false);
                    }}
                    className="px-5 py-2.5 rounded-xl border border-[#E8DFD3] text-[#66554A] text-xs font-bold hover:bg-[#FAF7F2] transition-colors"
                  >
                    Cancel
                  </button>
                  {modalSelectedOffice && (
                    <button
                      type="button"
                      onClick={() => {
                        // Update location in Zustand store
                        setCustomerOutlet(modalSelectedOffice.Name);
                        setIsLocationModalOpen(false);
                        // Clear states
                        setModalPincode('');
                        setModalError('');
                        setModalPostOffices([]);
                        setModalSelectedOffice(null);
                        setIsLocationVerified(false);
                      }}
                      className="px-5 py-2.5 rounded-xl bg-[#9A642C] hover:bg-[#805020] text-[#FFFDFC] text-xs font-bold shadow-md hover:shadow-lg transition-all"
                    >
                      Yes, Verify & Select
                    </button>
                  )}
                </div>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </div>
  );
}
