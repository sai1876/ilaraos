'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, Minus, Plus, ShoppingBag } from 'lucide-react';
import { MenuItem } from '@/lib/types';

interface CustomizationModalProps {
  item: MenuItem | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (customizedItem: {
    menuItemId: string;
    name: string;
    price: number;
    quantity: number;
    station: MenuItem['station'];
    modifiers: string[];
  }) => void;
}

interface AddonOption {
  name: string;
  price: number;
  selected: boolean;
}

/* Deprecated category-level customization choices. Checkout options must come
 * from each menu item's persisted customizationOptions instead. */
/*
const CAT_CONFIG: Record<string, {
  label: string;
  prefs: string[];
  addons: { name: string; price: number }[];
  hasSize: boolean;
}> = {
  Burgers: {
    label: 'Sauce Preference',
    prefs: ['Mild Mayo', 'Spicy Mayo', 'Secret Sauce'],
    addons: [
      { name: 'Extra Cheese', price: 15 },
      { name: 'Double Patty', price: 40 },
      { name: 'Caramelised Onions', price: 10 },
    ],
    hasSize: true,
  },
  Beverages: {
    label: 'Sweetness Level',
    prefs: ['Sugar Free', 'Less Sweet', 'Medium Sweet', 'Extra Sweet'],
    addons: [
      { name: 'Whipped Cream', price: 15 },
      { name: 'Chocolate Drizzle', price: 10 },
      { name: 'Extra Shot Espresso', price: 25 },
    ],
    hasSize: true,
  },
  Momos: {
    label: 'Preparation Style',
    prefs: ['Steamed', 'Pan Fried (+₹15)', 'Jhol Momos (+₹20)'],
    addons: [
      { name: 'Fiery Red Chutney Extra', price: 5 },
    ],
    hasSize: false,
  },
  Snacks: {
    label: 'Flavour',
    prefs: ['Salted', 'Peri Peri Spiced'],
    addons: [
      { name: 'Cheese Sauce Drizzle', price: 29 },
      { name: 'Peri Peri Ilara Dust', price: 18 },
    ],
    hasSize: false,
  },
  Biryani: {
    label: 'Spice Level',
    prefs: ['Mild', 'Medium', 'Spicy', 'Extra Spicy'],
    addons: [
      { name: 'Extra Raita', price: 10 },
      { name: 'Boiled Egg', price: 15 },
    ],
    hasSize: false,
  },
};
*/

export default function CustomizationModal({ item, isOpen, onClose, onConfirm }: CustomizationModalProps) {
  const [mounted, setMounted] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [size, setSize] = useState<'Regular' | 'Large'>('Regular');
  const [addOns, setAddOns] = useState<AddonOption[]>([]);
  const [preference, setPreference] = useState<string>('');
  // Fix #5 — visible cart confirmation toast after add-to-cart
  const [addedConfirm, setAddedConfirm] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!item) return;
    setQuantity(1);
    setSize('Regular');
    setPreference('');
    setAddOns((item.customizationOptions || [])
      .flatMap(group => group.options || [])
      .map(option => ({ ...option, selected: false })));
  }, [item, isOpen]);

  if (!item || !mounted) return null;

  const cfg = { label: 'Customizations', prefs: [], hasSize: false };
  const sizeSurcharge = size === 'Large' ? 30 : 0;
  const addonsTotal = addOns.filter(a => a.selected).reduce((s, a) => s + a.price, 0);
  const unitPrice = item.price + sizeSurcharge + addonsTotal;
  const totalPrice = unitPrice * quantity;

  const toggleAddon = (idx: number) =>
    setAddOns(prev => prev.map((a, i) => (i === idx ? { ...a, selected: !a.selected } : a)));

  const handleConfirm = () => {
    const mods: string[] = [];
    if (size === 'Large') mods.push('Large Size');
    if (preference) mods.push(preference);
    addOns.filter(a => a.selected).forEach(a => mods.push(a.name));
    onConfirm({ menuItemId: item.item_id, name: item.name, price: unitPrice, quantity, station: item.station, modifiers: mods });
    if (typeof window !== 'undefined' && navigator.vibrate) navigator.vibrate(50);
    // Fix #5 — show brief confirmation before closing
    setAddedConfirm(true);
    setTimeout(() => {
      setAddedConfirm(false);
      onClose();
    }, 900);
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm"
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 240 }}
            className="fixed bottom-0 left-0 right-0 z-[101] mx-auto max-w-[600px] flex flex-col max-h-[92dvh] rounded-t-[28px] bg-[#FBFBF9] border-t border-[#B89C48]/25 shadow-[0_-20px_60px_rgba(26,26,23,0.15)] overflow-hidden"
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-[#B89C48]/25" />
            </div>

            {/* Header */}
            <div className="flex items-start justify-between px-5 pt-2 pb-4 border-b border-[#B89C48]/15">
              <div className="flex-1 min-w-0 pr-4">
                <span className="text-[9px] font-black uppercase tracking-[0.18em] text-[#B89C48]">Customize your item</span>
                <h3 className="text-[#1A1A17] font-serif italic text-[22px] font-bold leading-snug mt-0.5 line-clamp-2">
                  {item.name}
                </h3>
                <p className="text-[#767064] text-[12px] font-semibold mt-0.5">Base price: <span className="font-black text-[#B89C48]">₹{item.price}</span></p>
              </div>
              <button
                onClick={onClose}
                className="mt-1 w-9 h-9 rounded-full bg-[#FFFFFF] border border-[#B89C48]/30 flex items-center justify-center text-[#1A1A17] hover:bg-[#F9F6EE] active:scale-95 transition-all shrink-0"
              >
                <X size={16} />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5 space-y-6" style={{ scrollbarWidth: 'none' }}>

              {/* Size picker */}
              {cfg?.hasSize && (
                <div>
                  <SectionLabel text="Choose Size" badge="Required" badgeColor="amber" />
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    {(['Regular', 'Large'] as const).map(sz => (
                      <button
                        key={sz}
                        onClick={() => setSize(sz)}
                        className={`p-4 rounded-2xl border-2 flex flex-col gap-1 text-left transition-all active:scale-[0.97] ${
                          size === sz
                            ? 'bg-[#F9F6EE] border-[#B89C48] shadow-[0_0_0_4px_rgba(184,156,72,0.1)]'
                            : 'bg-white border-[#B89C48]/25 hover:border-[#B89C48]/40'
                        }`}
                      >
                        <span className={`text-[13px] font-bold ${size === sz ? 'text-[#8E7535]' : 'text-[#1A1A17]'}`}>{sz}</span>
                        <span className={`text-[11px] font-semibold font-mono ${size === sz ? 'text-[#B89C48]' : 'text-[#767064]'}`}>
                          {sz === 'Regular' ? 'Standard' : '+ ₹30'}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Preference pills */}
              {cfg && cfg.prefs.length > 0 && (
                <div>
                  <SectionLabel text={cfg.label} />
                  <div className="flex flex-wrap gap-2 mt-3">
                    {cfg.prefs.map(pref => (
                      <button
                        key={pref}
                        onClick={() => setPreference(pref)}
                        className={`px-4 py-2 rounded-full text-[12px] font-bold border transition-all active:scale-95 ${
                          preference === pref
                            ? 'bg-[#B89C48] border-[#B89C48] text-white shadow-sm'
                            : 'bg-white border-[#B89C48]/25 text-[#1A1A17] hover:border-[#B89C48]/40'
                        }`}
                      >
                        {pref}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Add-ons */}
              {addOns.length > 0 && (
                <div>
                  <SectionLabel text="Add-Ons" badge="Optional" badgeColor="muted" />
                  <div className="flex flex-col gap-2 mt-3">
                    {addOns.map((opt, idx) => (
                      <button
                        key={opt.name}
                        onClick={() => toggleAddon(idx)}
                        className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border-2 transition-all active:scale-[0.98] text-left ${
                          opt.selected
                            ? 'bg-[#F9F6EE] border-[#B89C48]'
                            : 'bg-white border-[#B89C48]/25 hover:border-[#B89C48]/45'
                        }`}
                      >
                        {/* Checkbox */}
                        <div className={`w-[22px] h-[22px] rounded-lg border-2 flex items-center justify-center shrink-0 transition-all ${
                          opt.selected ? 'bg-[#B89C48] border-[#B89C48]' : 'bg-white border-[#B89C48]/30'
                        }`}>
                          {opt.selected && <Check size={13} strokeWidth={3} className="text-white" />}
                        </div>
                        <span className={`flex-1 text-[13px] font-semibold ${opt.selected ? 'text-[#1A1A17]' : 'text-[#767064]'}`}>
                          {opt.name}
                        </span>
                        <span className={`text-[12px] font-black font-mono ${opt.selected ? 'text-[#8E7535]' : 'text-[#767064]'}`}>
                          + ₹{opt.price}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* If no customisation options at all */}
              {addOns.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <span className="text-3xl">✨</span>
                  <p className="text-[#1A1A17] text-sm font-medium">No customisations needed.</p>
                  <p className="text-[#767064] text-xs">Just set your quantity and add to cart!</p>
                </div>
              )}
            </div>

            {/* ── Footer ── */}
            <div className="px-5 py-4 border-t border-[#B89C48]/15 bg-white flex items-center gap-3">
              {/* Quantity control */}
              <div className="flex items-center gap-0 bg-[#F9F6EE] border border-[#B89C48]/35 rounded-xl overflow-hidden">
                <button
                  onClick={() => setQuantity(q => Math.max(1, q - 1))}
                  className="w-10 h-10 flex items-center justify-center text-[#1A1A17] hover:bg-[#B89C48]/10 active:bg-[#B89C48]/20 transition-colors"
                >
                  <Minus size={14} />
                </button>
                <span className="w-8 text-center text-[#1A1A17] text-[15px] font-black">{quantity}</span>
                <button
                  onClick={() => setQuantity(q => q + 1)}
                  className="w-10 h-10 flex items-center justify-center text-[#1A1A17] hover:bg-[#B89C48]/10 active:bg-[#B89C48]/20 transition-colors"
                >
                  <Plus size={14} />
                </button>
              </div>

              {/* Add to cart */}
              <button
                onClick={handleConfirm}
                disabled={addedConfirm}
                className="flex-1 h-[50px] flex items-center justify-between px-5 bg-[#B89C48] hover:bg-[#8E7535] active:scale-[0.98] text-white rounded-xl transition-all shadow-sm disabled:cursor-default"
              >
                {addedConfirm ? (
                  <div className="w-full flex items-center justify-center gap-2">
                    <Check size={16} className="text-white" />
                    <span className="text-[12px] font-black uppercase tracking-wider font-mono">Added to Cart!</span>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <ShoppingBag size={15} className="text-white" />
                      <span className="text-[12px] font-black uppercase tracking-wider font-mono">Add to Cart</span>
                    </div>
                    <span className="text-[15px] font-black font-mono">₹{totalPrice}</span>
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}

function SectionLabel({ text, badge, badgeColor }: { text: string; badge?: string; badgeColor?: 'amber' | 'muted' }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-black uppercase tracking-[0.15em] text-[#1A1A17]">{text}</span>
      {badge && (
        <span className={`text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${
          badgeColor === 'amber'
            ? 'bg-[#F9F6EE] border-[#B89C48]/40 text-[#8E7535]'
            : 'bg-[#F9F6EE] border-[#B89C48]/30 text-[#767064]'
        }`}>
          {badge}
        </span>
      )}
    </div>
  );
}
