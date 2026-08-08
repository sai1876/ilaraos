'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Minus, Plus, Trash2, ArrowRight, Tag, Info, RotateCw, MapPin, CheckCircle2, AlertCircle, X, Sparkles, Lock } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { db, auth } from '@/lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { signInWithCustomToken } from 'firebase/auth';
import { updateUserAddresses, fetchOutlets, fetchOffers, fetchMenuItems, fetchPincodeDetails } from '@/lib/dbService';
import { calculatePricingPreview, roundCurrency } from '@/features/checkout/clientPricingPreview';
import { reconcileCartCustomizations } from '@/features/checkout/reconcileCartCustomizations';
import { MenuItem, SavedAddress } from '@/lib/types';
import AuthWorkspace from '@/components/auth/AuthWorkspace';
import { getActionToken } from '@/lib/auth/getActionToken';

const formatPrice = (price: number) => `₹${price.toFixed(2)}`;

class OrderPlacementError extends Error {
  constructor(message: string, public readonly status?: number, public readonly stage?: string) {
    super(message);
    this.name = 'OrderPlacementError';
  }
}

const getOrderPlacementMessage = (error: unknown): string => {
  if (error instanceof OrderPlacementError) {
    if (error.status === 401) return 'Your session expired — please sign in again.';
    if (error.status === 400) return error.message === 'Invalid input data'
      ? 'Please review your order details and try again.'
      : error.message;
    if (error.status === 403) return error.message || 'Your account is not eligible to place this order.';
    if (error.status === 409) return error.message || 'Your order details changed — please review your cart.';
    if (error.status === 429) return 'Too many order attempts — please wait a moment and try again.';
    if (error.status === 503) return 'Ordering is temporarily unavailable — please try again shortly.';
    if (error.status && error.status >= 500) return 'The server could not place your order — please try again.';
    if (error.stage === 'network') return 'Could not connect to the server — please check your connection.';
    return error.message;
  }
  return 'We could not place your order — please try again.';
};

interface CelebrationParticle {
  id: number;
  type: 'confetti' | 'ribbon';
  x: number;
  y: number;
  color: string;
  size: number;
  shape: 'circle' | 'square' | 'svg';
  delay: number;
  duration: number;
  drift: number;
  rotateZ: number;
}

const generateCelebrationParticles = (): CelebrationParticle[] => {
  const colors = [
    '#f59e0b', // Amber/Gold
    '#10b981', // Emerald
    '#3b82f6', // Blue
    '#ec4899', // Pink
    '#e11d48', // Crimson Red
    '#8b5cf6', // Violet
    '#06b6d4', // Cyan
    '#d4a354'  // Cafe Gold Accent
  ];

  return Array.from({ length: 60 }).map((_, i) => {
    const isRibbon = i % 4 === 0; // 25% ribbons, 75% normal confetti
    const delay = Math.random() * 0.4;
    const duration = 2.5 + Math.random() * 2;
    const size = isRibbon ? 12 + Math.random() * 16 : 6 + Math.random() * 8;
    const drift = (Math.random() - 0.5) * 150; // horizontal drift amplitude
    const rotateZ = Math.random() * 360;

    return {
      id: i,
      type: isRibbon ? 'ribbon' : 'confetti',
      x: Math.random() * 100, // percentage of viewport width
      y: -20, // start above screen
      color: colors[Math.floor(Math.random() * colors.length)],
      size,
      shape: isRibbon ? 'svg' : (Math.random() > 0.5 ? 'circle' : 'square'),
      delay,
      duration,
      drift,
      rotateZ
    };
  });
};

const CelebrationOverlay = ({ active }: { active: boolean }) => {
  const [particles, setParticles] = useState<CelebrationParticle[]>([]);

  useEffect(() => {
    if (active) {
      setParticles(generateCelebrationParticles());
    } else {
      setParticles([]);
    }
  }, [active]);

  if (!active) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 99999, overflow: 'hidden' }}>
      {particles.map((p) => {
        const shapeElement = (() => {
          if (p.type === 'ribbon') {
            return (
              <svg 
                viewBox="0 0 20 60" 
                style={{ 
                  width: p.size, 
                  height: p.size * 3, 
                  color: p.color, 
                  display: 'block' 
                }}
              >
                <path 
                  d="M10,0 C18,10 2,20 10,30 C18,40 2,50 10,60" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="3.5" 
                  strokeLinecap="round" 
                />
              </svg>
            );
          } else if (p.shape === 'circle') {
            return (
              <div 
                style={{ 
                  width: p.size, 
                  height: p.size, 
                  borderRadius: '50%', 
                  backgroundColor: p.color 
                }} 
              />
            );
          } else {
            return (
              <div 
                style={{ 
                  width: p.size, 
                  height: p.size * 1.5, 
                  backgroundColor: p.color 
                }} 
              />
            );
          }
        })();

        return (
          <motion.div
            key={p.id}
            initial={{ 
              x: `${p.x}vw`, 
              y: '-10vh', 
              opacity: 1, 
              rotateZ: p.rotateZ,
              rotateX: 0,
              rotateY: 0
            }}
            animate={{
              y: '115vh',
              x: [
                `${p.x}vw`, 
                `calc(${p.x}vw + ${p.drift * 0.6}px)`, 
                `calc(${p.x}vw - ${p.drift * 0.3}px)`, 
                `calc(${p.x}vw + ${p.drift}px)`
              ],
              rotateZ: p.rotateZ + 720,
              rotateX: [0, 360, 720, 1080],
              rotateY: [0, 540, 1080, 1620],
              opacity: [1, 1, 1, 0]
            }}
            transition={{
              y: { duration: p.duration, ease: 'easeIn', delay: p.delay },
              x: { duration: p.duration, ease: 'easeInOut', delay: p.delay },
              rotateZ: { duration: p.duration, ease: 'linear', delay: p.delay },
              rotateX: { duration: p.duration, ease: 'linear', delay: p.delay },
              rotateY: { duration: p.duration, ease: 'linear', delay: p.delay },
              opacity: { duration: p.duration, ease: 'easeOut', delay: p.delay }
            }}
            style={{
              position: 'absolute',
              pointerEvents: 'none'
            }}
          >
            {shapeElement}
          </motion.div>
        );
      })}
    </div>
  );
};

export default function CartPage() {
  const router = useRouter();
  const { cart, setCart, addToCart, removeFromCart, updateQuantity, clearCart, user, userProfile, authLoading, customerOutlet, setCustomerOutlet } = useStore();
  const [magicLoading, setMagicLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const table = urlParams.get('table');
    const token = urlParams.get('tableToken');
    if (table) {
      setOrderType('dine-in');
      setTableNo(table);
    }
    if (token) setTableToken(token);
  }, []);

  // Handle WhatsApp Magic Link Auto-Login
  useEffect(() => {
    const handleMagicLink = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const session = urlParams.get('session');
      const magic = urlParams.get('magic');

      if (session && magic === 'true') {
        setMagicLoading(true);
        try {
          const res = await fetch('/api/auth/magic-link', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session })
          });
          const data = await res.json();
          
          if (data.success && data.token) {
            // 1. Sign in with Custom Token
            await signInWithCustomToken(auth, data.token);
            
            // 2. Load items into cart
            if (data.items && data.items.length > 0) {
              setCart(data.items);
            }

            triggerToast("Successfully loaded your WhatsApp order!", "success");
          } else {
            triggerToast(data.error || "Magic link expired or invalid.", "error");
          }
        } catch (e) {
          console.error("Magic link error:", e);
          triggerToast("Failed to connect magic session.", "error");
        } finally {
          setMagicLoading(false);
          // Clean the URL to remove the session params
          router.replace('/cart');
        }
      }
    };
    
    handleMagicLink();
  }, [router]);

  // Toast & Celebration States
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'info';
    id: number;
  } | null>(null);

  const [showPromoSuccessModal, setShowPromoSuccessModal] = useState(false);
  const [appliedPromoDetails, setAppliedPromoDetails] = useState<{
    code: string;
    discountPercent: number;
    savedAmount: number;
  } | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);

  const triggerToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now();
    setToast({ message, type, id });
    setTimeout(() => {
      setToast(prev => prev?.id === id ? null : prev);
    }, 4000);
  };

  const [orderType, setOrderType] = useState<'dine-in' | 'pickup' | 'delivery'>('dine-in');
  const [promoCode, setPromoCode] = useState('');
  const [promoApplied, setPromoApplied] = useState(false);
  const [promoDiscountPercent, setPromoDiscountPercent] = useState(0);
  const [promoScope, setPromoScope] = useState<string>('All');
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [hasLoadedMenuItems, setHasLoadedMenuItems] = useState(false);
  const [_usePoints, _setUsePoints] = useState(false);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const submissionInFlight = useRef(false);
  const [success, setSuccess] = useState(false);
  const [activeBalance, setActiveBalance] = useState(0);
  const [pointsInput, setPointsInput] = useState('');

  // Dine-in & Pickup states
  const [tableNo, setTableNo] = useState('');
  const [tableToken, setTableToken] = useState('');
  const [selectedHatch, setSelectedHatch] = useState('');
  const [availableHatches, setAvailableHatches] = useState<string[]>([]);
  const [resolvedOutletName, setResolvedOutletName] = useState<string | null>(null);
  const [isResolvingOutlet, setIsResolvingOutlet] = useState(true);

  // Detailed Address States (for delivery type)
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [flatNo, setFlatNo] = useState('');
  const [floor, setFloor] = useState('');
  const [area, setArea] = useState('');
  const [landmark, setLandmark] = useState('');
  const [addressLabel, setAddressLabel] = useState<'Home' | 'Hostel' | 'Library' | 'Classroom' | 'Other'>('Hostel');
  const [customLabel, setCustomLabel] = useState('');
  const [saveToProfile, setSaveToProfile] = useState(true);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [isAddingNewAddress, setIsAddingNewAddress] = useState(true);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [coordinates, setCoordinates] = useState<{ lat: number; lng: number } | undefined>(undefined);
  const [errorMsg, setErrorMsg] = useState('');
  const [showGpsSuccess, setShowGpsSuccess] = useState(false);

  // PIN code lookup states
  const [pincode, setPincode] = useState('');
  const [district, setDistrict] = useState('');
  const [stateVal, setStateVal] = useState('');
  const [pincodeLoading, setPincodeLoading] = useState(false);
  const [pincodeError, setPincodeError] = useState('');
  const [postOffices, setPostOffices] = useState<any[]>([]);
  const [selectedPostOffice, setSelectedPostOffice] = useState('');

  // Debounced Indian PIN code lookup effect
  useEffect(() => {
    // Check if exactly 6 numeric digits are present
    if (!/^\d{6}$/.test(pincode)) {
      setPostOffices([]);
      setPincodeError('');
      return;
    }

    const delayDebounce = setTimeout(async () => {
      setPincodeLoading(true);
      setPincodeError('');
      setPostOffices([]);

      try {
        const details = await fetchPincodeDetails(pincode);
        if (details && details.length > 0) {
          setPostOffices(details);
          const first = details[0];
          
          // Auto-fill district and state without overwriting manual changes
          setDistrict(prev => prev.trim() ? prev : first.District);
          setStateVal(prev => prev.trim() ? prev : first.State);
          setSelectedPostOffice(first.Name);
          
          // Pre-fill Campus Area with the first post office name if empty
          setArea(prev => prev.trim() ? prev : first.Name);
        } else {
          setPincodeError('We could not find this PIN code. Please enter your address manually.');
        }
      } catch (err: any) {
        console.error('Failed to resolve PIN code details:', err);
        setPincodeError('We could not find this PIN code. Please enter your address manually.');
      } finally {
        setPincodeLoading(false);
      }
    }, 500);

    return () => clearTimeout(delayDebounce);
  }, [pincode]);


  // Focus and tooltip states
  const [promoFocused, setPromoFocused] = useState(false);
  const [showFeeTooltip, setShowFeeTooltip] = useState(false);

  // Undo delete states using ref handle
  const undoTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [undoSnapshot, setUndoSnapshot] = useState<{ item: any; index: number } | null>(null);

  // Auth sheet modal state
  const [showAuthModal, setShowAuthModal] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchMenuItems()
      .then(items => {
        if (!cancelled) setMenuItems(items);
      })
      .catch(error => console.error('[checkout] Failed to load menu items:', error))
      .finally(() => {
        if (!cancelled) setHasLoadedMenuItems(true);
      });
    return () => {
      cancelled = true;
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (userProfile?.user_id) {
      const fetchLedger = async () => {
        try {
          const q = query(
            collection(db, 'point_ledger'),
            where('user_id', '==', userProfile.user_id)
          );
          const snap = await getDocs(q);
          const data: any[] = [];
          snap.forEach(docSnap => {
            const d = docSnap.data();
            if (d.amount > 0 && !d.is_expired) {
              data.push(d);
            }
          });

          const now = new Date().toISOString();
          const active = data.filter((d: any) => d.expires_at > now);
          const totalActive = active.reduce((sum: number, d: any) => sum + d.amount, 0);
          setActiveBalance(totalActive);
        } catch (err) {
          console.error("Failed to fetch ledger from Firestore", err);
        }
      };
      fetchLedger();
    }
  }, [userProfile?.user_id]);

  useEffect(() => {
    let cancelled = false;
    setIsResolvingOutlet(true);

    fetchOutlets().then(outlets => {
      const activeOutlets = outlets.filter(outlet => outlet.status === 'active');
      const normalizedSelectedOutlet = customerOutlet.trim().toLowerCase().replace(/\s+/g, ' ');
      const resolvedOutlet = activeOutlets.find(outlet =>
        [outlet.name, outlet.id, outlet.outlet_id]
          .some(value => value?.trim().toLowerCase().replace(/\s+/g, ' ') === normalizedSelectedOutlet),
      ) || activeOutlets[0];

      if (cancelled) return;

      if (!resolvedOutlet) {
        setResolvedOutletName(null);
        setAvailableHatches([]);
        setSelectedHatch('');
        return;
      }

      setResolvedOutletName(resolvedOutlet.name);
      setAvailableHatches(resolvedOutlet.hatches || []);
      setSelectedHatch(current => resolvedOutlet.hatches?.includes(current)
        ? current
        : resolvedOutlet.hatches?.[0] || '');
      if (customerOutlet !== resolvedOutlet.name) setCustomerOutlet(resolvedOutlet.name);
    }).catch(error => {
      console.error('[checkout] Failed to resolve active outlet:', error);
      if (!cancelled) {
        setResolvedOutletName(null);
        setAvailableHatches([]);
        setSelectedHatch('');
      }
    }).finally(() => {
      if (!cancelled) setIsResolvingOutlet(false);
    });

    return () => {
      cancelled = true;
    };
  }, [customerOutlet, setCustomerOutlet]);

  // Automatically manage address selection when user shifts to delivery
  useEffect(() => {
    if (orderType === 'delivery') {
      if (userProfile?.addresses && userProfile.addresses.length > 0) {
        if (!selectedAddressId) {
          const firstAddr = userProfile.addresses[0];
          setSelectedAddressId(firstAddr.id);
          setDeliveryAddress(firstAddr.fullAddress);
          setIsAddingNewAddress(false);
        }
      } else {
        setIsAddingNewAddress(true);
      }
    }
  }, [orderType, userProfile, selectedAddressId]);

  const handleAutoFetchLocation = () => {
    if (!navigator.geolocation) {
      setErrorMsg("Geolocation is not supported by your browser.");
      return;
    }

    setGpsLoading(true);
    setErrorMsg("");

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        setCoordinates({ lat: latitude, lng: longitude });
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
            {
              headers: {
                'User-Agent': 'OasisCafeDelivery/1.0'
              }
            }
          );
          
          if (!response.ok) throw new Error("Reverse geocoding failed");
          
          const data = await response.json();
          const addr = data.address || {};
          const street = addr.road || addr.suburb || addr.neighbourhood || addr.pedestrian || "";
          const building = addr.building || addr.amenity || addr.university || addr.college || "";
          
          let detectedArea = street;
          if (building && street) {
            detectedArea = `${building}, ${street}`;
          } else if (building) {
            detectedArea = building;
          }
          
          if (data.display_name && !detectedArea) {
            detectedArea = data.display_name.split(',').slice(0, 2).join(',').trim();
          }
          
          setArea(detectedArea || `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
          if (addr.suburb || addr.county) {
            setLandmark(addr.suburb || addr.county || "");
          }
          
          setShowGpsSuccess(true);
          setTimeout(() => setShowGpsSuccess(false), 3000);
          
          if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
            window.navigator.vibrate(100);
          }
        } catch (err) {
          console.error("Geocoding failed, falling back to coordinates:", err);
          setArea(`Campus Coordinates: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
          setLandmark("GPS Detected Location");
          setShowGpsSuccess(true);
          setTimeout(() => setShowGpsSuccess(false), 3000);
        } finally {
          setGpsLoading(false);
        }
      },
      (error) => {
        console.error("GPS fetch error:", error);
        setErrorMsg("Unable to retrieve GPS coordinates. Please enter manually.");
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  // Handle Platform Fee Tooltip (Fix #7)
  const handleFeeTooltip = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowFeeTooltip(prev => !prev);
  };

  // Close tooltip when clicking anywhere else
  useEffect(() => {
    if (!showFeeTooltip) return;
    const handleOutsideClick = () => setShowFeeTooltip(false);
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, [showFeeTooltip]);

  // Handle undo action
  const handleUndoDelete = () => {
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    if (undoSnapshot) {
      const newCart = [...cart];
      const insertIdx = Math.min(undoSnapshot.index, newCart.length);
      newCart.splice(insertIdx, 0, undoSnapshot.item);
      setCart(newCart);
      setUndoSnapshot(null);
      triggerToast("Item restored to cart", "success");
    }
  };

  // Immediate cart deletion with 4s undo window
  const handleDeleteItem = (item: any) => {
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }

    const itemIndex = cart.findIndex(i => i.id === item.id);
    setUndoSnapshot({ item, index: itemIndex >= 0 ? itemIndex : 0 });

    // Instantly remove item from Zustand cart store (< 10ms)
    removeFromCart(item.id);

    undoTimerRef.current = setTimeout(() => {
      setUndoSnapshot(null);
      undoTimerRef.current = null;
    }, 4000);
  };

  // Quantity decrement logic
  const handleDecrement = (itemId: string, currentQty: number) => {
    if (currentQty <= 1) {
      const itemToDelete = cart.find(i => i.id === itemId);
      if (itemToDelete) {
        handleDeleteItem(itemToDelete);
      }
    } else {
      updateQuantity(itemId, -1);
    }
  };

  // Cart items represent the UI immediately
  const visibleCart = cart;

  // Totals calculation using shared helper (using visibleCart for instant UI update when deleted)
  const {
    subtotal,
    promoDiscount,
    pointsRedeemed,
    total
  } = calculatePricingPreview({
    cart: visibleCart,
    platformFee: 5,
    promoApplied,
    promoDiscountPercent,
    promoScope,
    activeBalance,
    pointsInput: Number(pointsInput) || 0,
    menuItems
  });
  const platformFee = 5;
  const maxRedeemablePoints = Math.floor((subtotal - promoDiscount + platformFee) * 0.2);
  const maxCanUse = Math.min(activeBalance, maxRedeemablePoints);
  const pointsDiscount = pointsRedeemed;

  const handlePlaceOrder = async () => {
    if (submissionInFlight.current || isPlacingOrder) return;
    if (authLoading) {
      triggerToast('Checking your session — please wait a moment.', 'info');
      return;
    }
    if (!user) {
      router.push('/login?next=%2Fcart');
      return;
    }
    if (cart.length === 0) return;

    if (isResolvingOutlet) {
      triggerToast('Checking the selected outlet â€” please wait a moment.', 'info');
      return;
    }
    if (!resolvedOutletName) {
      triggerToast('No active outlet is available for this order. Please select another outlet.', 'error');
      return;
    }
    if (!hasLoadedMenuItems) {
      triggerToast('Loading the latest menu details â€” please wait a moment.', 'info');
      return;
    }
    if (cart.some(cartItem => !menuItems.some(menuItem => menuItem.item_id === cartItem.menuItemId))) {
      triggerToast('One or more cart items are no longer available. Please update your cart before ordering.', 'error');
      return;
    }

    let compiledAddress = deliveryAddress;
    let activeCoordinates = coordinates;
    let pendingAddressUpdate: SavedAddress[] | null = null;

    if (orderType === 'dine-in' && !tableNo.trim()) {
      triggerToast('Please provide your Table Number for Dine-In.', 'error');
      return;
    }
    if (orderType === 'dine-in' && !tableToken) {
      triggerToast('Dine-in orders require a valid table QR — please scan the QR at your table.', 'error');
      return;
    }

    if (orderType === 'pickup' && availableHatches.length > 0 && !selectedHatch.trim()) {
      triggerToast('Please select a Pickup Point / Hatch.', 'error');
      return;
    }

    const reconciledCart = reconcileCartCustomizations(cart, menuItems);
    if (reconciledCart.changed) {
      setCart(reconciledCart.cart);
      triggerToast('Unavailable item customizations were removed. Please review the updated total and place your order again.', 'info');
      return;
    }

    if (orderType === 'delivery') {
      if (isAddingNewAddress) {
        if (!flatNo.trim()) {
          triggerToast('Please provide Flat/House/Hostel & Room number.', 'error');
          return;
        }
        if (!area.trim()) {
          triggerToast('Please provide Street/Area or Campus location.', 'error');
          return;
        }

        const labelText = addressLabel === 'Other' && customLabel.trim() ? customLabel.trim() : addressLabel;
        
        const locationParts = [
          area.trim(),
          district.trim(),
          stateVal.trim()
        ].filter(Boolean).join(', ');

        const pincodeSuffix = pincode.trim() ? ` - ${pincode.trim()}` : '';
        const landmarkSuffix = landmark.trim() ? ` (Landmark: ${landmark.trim()})` : '';

        compiledAddress = `${flatNo}, ${floor.trim() ? floor.trim() + ', ' : ''}${locationParts}${pincodeSuffix}${landmarkSuffix}`;


        // Save new address to profile if checked
        if (saveToProfile && userProfile) {
          const newAddress: SavedAddress = {
            id: Math.random().toString(36).substring(7),
            label: labelText,
            flatNo,
            floor,
            area,
            landmark,
            fullAddress: compiledAddress,
            coordinates: coordinates
          };
          const existingAddresses = userProfile.addresses || [];
          pendingAddressUpdate = [newAddress, ...existingAddresses.slice(0, 4)];
        }
      } else {
        // Use selected saved address
        const saved = userProfile?.addresses?.find(a => a.id === selectedAddressId);
        if (saved) {
          compiledAddress = saved.fullAddress;
          activeCoordinates = saved.coordinates;
        } else if (!deliveryAddress.trim()) {
          triggerToast('Please select a saved address or enter a new one.', 'error');
          return;
        }
      }
    }

    submissionInFlight.current = true;
    setIsPlacingOrder(true);
    try {
      if (pendingAddressUpdate && userProfile) {
        try {
          await updateUserAddresses(pendingAddressUpdate);
          useStore.setState({ userProfile: { ...userProfile, addresses: pendingAddressUpdate } });
        } catch (error) {
          console.error('[order placement] Failed to save delivery address; continuing checkout:', error);
        }
      }

      const firebaseUser = auth.currentUser;
      if (!firebaseUser || firebaseUser.uid !== user.uid) {
        const error = new OrderPlacementError('Firebase session is not ready', 401, 'authentication');
        console.error('[order placement] Persisted user does not match Firebase Auth:', {
          storeUid: user.uid,
          firebaseUid: firebaseUser?.uid ?? null,
        });
        throw error;
      }

      let idToken: string;
      try {
        idToken = await getActionToken(false);
        // Optimized: cached token acquired via getActionToken instead of await firebaseUser.getIdToken(true)
      } catch (error) {
        console.error('[order placement] Failed to retrieve Firebase ID token:', error);
        throw new OrderPlacementError('Firebase session token could not be retrieved', 401, 'authentication');
      }

      const clientIdempotencyKey = typeof crypto !== 'undefined' && crypto.randomUUID 
        ? crypto.randomUUID() 
        : '550e8400-e29b-41d4-a716-' + Math.random().toString(16).substring(2, 14);

      let response: Response;
      try {
        response = await fetch('/api/orders/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            idempotencyKey: clientIdempotencyKey,
            clientExpectedTotal: total,
            promoCode: promoApplied ? promoCode : undefined,
            pointsRedeemed,
            orderType,
            items: cart.map(c => ({
              menuItemId: c.menuItemId,
              name: c.name,
              price: c.price,
              quantity: c.quantity,
              station: c.station,
              modifiers: c.modifiers,
            })),
            hatch: orderType === 'pickup' && selectedHatch.trim() ? selectedHatch : undefined,
            tableNo: orderType === 'dine-in' ? tableNo : undefined,
            tableToken: orderType === 'dine-in' ? tableToken : undefined,
            outlet: resolvedOutletName,
            deliveryAddress: orderType === 'delivery' ? compiledAddress : undefined,
            deliveryCoordinates: orderType === 'delivery' ? activeCoordinates : undefined,
          }),
        });
      } catch (error) {
        console.error('[order placement] Network request to /api/orders/create failed:', error);
        throw new OrderPlacementError('Could not connect to the order server', undefined, 'network');
      }

      let responseText: string;
      try {
        responseText = await response.text();
      } catch (error) {
        console.error('[order placement] Failed to read order API response:', error);
        throw new OrderPlacementError('The server response could not be read', response.status, 'response');
      }

      let data: { success?: boolean; error?: string; order?: { order_id?: string } };
      try {
        data = JSON.parse(responseText) as typeof data;
      } catch (error) {
        console.error('[order placement] Order API returned non-JSON content:', {
          status: response.status,
          body: responseText,
          error,
        });
        throw new OrderPlacementError('The server returned an invalid response', response.status, 'response');
      }

      if (!response.ok || !data.success) {
        console.error('[order placement] Order API rejected the request:', {
          status: response.status,
          error: data.error,
          orderType,
        });
        throw new OrderPlacementError(data.error || 'The order request was rejected', response.status, 'api');
      }

      const orderId = data.order?.order_id;
      if (!orderId) {
        console.error('[order placement] Successful API response was missing order.order_id:', data);
        throw new OrderPlacementError('The server returned an incomplete order confirmation', 502, 'response');
      }

      clearCart();
      setSuccess(true);
      
      // Reset address inputs
      setFlatNo('');
      setFloor('');
      setArea('');
      setLandmark('');
      setCustomLabel('');
      setCoordinates(undefined);
      setSelectedAddressId(null);

      setTimeout(() => {
        try {
          router.push(`/orders/${encodeURIComponent(orderId)}`);
        } catch (error) {
          console.error('[order placement] Failed to navigate to order tracking:', error);
          window.location.assign(`/orders/${encodeURIComponent(orderId)}`);
        }
      }, 2000);
    } catch (error) {
      console.error('[order placement] Checkout failed:', error);
      triggerToast(getOrderPlacementMessage(error), 'error');
      submissionInFlight.current = false;
      setIsPlacingOrder(false);
    }
  };

  const getPromoDiscountAmountForOffer = (discountPercent: number, scope: string) => {
    if (!scope || scope.toLowerCase() === 'all') {
      return roundCurrency(subtotal * (discountPercent / 100));
    }
    const scopedSubtotal = visibleCart.reduce((sum, item) => {
      const menuItem = menuItems.find(m => m.item_id === item.menuItemId);
      const category = menuItem?.category || '';
      if (category.toLowerCase() === scope.toLowerCase()) {
        return sum + item.price * item.quantity;
      }
      return sum;
    }, 0);
    return roundCurrency(scopedSubtotal * (discountPercent / 100));
  };

  const handleApplyPromo = async () => {
    if (!promoCode.trim()) return;
    try {
      const allOffers = await fetchOffers();
      const matched = allOffers.find(o => o.code.toUpperCase() === promoCode.toUpperCase() && o.isActive);
      
      if (matched) {
        const today = new Date().toISOString().split('T')[0];
        if (matched.expiryDate < today) {
          triggerToast("This promo code has expired!", "error");
          setPromoApplied(false);
          setPromoDiscountPercent(0);
          setPromoScope('All');
          return;
        }
        
        const saved = getPromoDiscountAmountForOffer(matched.discountPercent, matched.categoryScope || 'All');
        setPromoDiscountPercent(matched.discountPercent);
        setPromoScope(matched.categoryScope || 'All');
        setPromoApplied(true);
        setAppliedPromoDetails({
          code: matched.code,
          discountPercent: matched.discountPercent,
          savedAmount: saved
        });
        setShowPromoSuccessModal(true);
        setShowConfetti(true);
      } else {
        // Fallback standard code if DB is empty
        if (promoCode.toUpperCase() === 'ILARA10' || promoCode.toUpperCase() === 'OASIS10') {
          const saved = getPromoDiscountAmountForOffer(10, 'All');
          setPromoDiscountPercent(10);
          setPromoScope('All');
          setPromoApplied(true);
          setAppliedPromoDetails({
            code: promoCode.toUpperCase(),
            discountPercent: 10,
            savedAmount: saved
          });
          setShowPromoSuccessModal(true);
          setShowConfetti(true);
        } else if (promoCode.toUpperCase() === 'STRESS_FREE_10') {
          const saved = getPromoDiscountAmountForOffer(10, 'All');
          setPromoDiscountPercent(10);
          setPromoScope('All');
          setPromoApplied(true);
          setAppliedPromoDetails({
            code: 'STRESS_FREE_10',
            discountPercent: 10,
            savedAmount: saved
          });
          setShowPromoSuccessModal(true);
          setShowConfetti(true);
        } else {
          triggerToast("Invalid or inactive promo code.", "error");
          setPromoApplied(false);
          setPromoDiscountPercent(0);
          setPromoScope('All');
        }
      }
    } catch (err) {
      console.error("Failed to apply promo code dynamically:", err);
      triggerToast("Error validating promo code. Trying offline fallback...", "info");
      if (promoCode.toUpperCase() === 'ILARA10' || promoCode.toUpperCase() === 'OASIS10' || promoCode.toUpperCase() === 'STRESS_FREE_10') {
        const saved = getPromoDiscountAmountForOffer(10, 'All');
        setPromoDiscountPercent(10);
        setPromoScope('All');
        setPromoApplied(true);
        setAppliedPromoDetails({
          code: promoCode.toUpperCase(),
          discountPercent: 10,
          savedAmount: saved
        });
        setShowPromoSuccessModal(true);
        setShowConfetti(true);
      } else {
        setPromoApplied(false);
        setPromoDiscountPercent(0);
        setPromoScope('All');
      }
    }
  };

  if (success) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--background)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', damping: 20 }}
          style={{ width: 80, height: 80, borderRadius: '50%', background: 'linear-gradient(135deg,#4ade80,#22c55e)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20, boxShadow: '0 10px 40px rgba(74,222,128,0.3)' }}
        >
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
        </motion.div>
        <h2 style={{ color: 'var(--foreground)', fontSize: 24, fontWeight: 700, marginBottom: 10 }}>Order Placed!</h2>
        <p style={{ color: 'var(--muted-foreground)', textAlign: 'center' }}>Your order is being sent to the kitchen.</p>
      </div>
    );
  }

  if (magicLoading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--background)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid rgba(212,163,84,0.3)', borderTopColor: '#d4a354', animation: 'spin 1s linear infinite', marginBottom: 20 }} />
        <h2 style={{ color: 'var(--foreground)', fontSize: 20, fontWeight: 700, marginBottom: 10 }}>Loading WhatsApp Order...</h2>
        <p style={{ color: 'var(--muted-foreground)', textAlign: 'center', fontSize: 13 }}>Securely signing you in and syncing your cart.</p>
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!mounted) {
    return (
      <div className="min-h-screen bg-[#FAF7F2] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-10 h-10 rounded-full border-4 border-[#9A642C]/15 border-t-[#9A642C] animate-spin mb-4" />
        <h2 className="text-[#241A15] text-lg font-bold font-serif">Loading cart...</h2>
      </div>
    );
  }

  if (cart.length === 0) {
    const recommended = menuItems.filter(m => m.is_available).slice(0, 3);
    return (
      <div className="min-h-screen bg-background flex flex-col pt-[15vh]">
        <div className="flex flex-col items-center justify-center text-center px-4 mb-10">
          <span className="text-6xl mb-4">🛒</span>
          <h2 className="text-foreground text-xl font-black mb-2 tracking-tight">Your cart is empty</h2>
          <p className="text-muted-foreground text-sm mb-6 max-w-[240px]">Looks like you haven't added anything yet. Explore our menu to find something delicious!</p>
          <button
            onClick={() => router.push('/menu')}
            className="bg-primary text-primary-foreground border-none py-3 px-8 rounded-xl font-bold uppercase tracking-wide active:scale-95 transition-transform"
          >
            Explore Menu
          </button>
        </div>

        {recommended.length > 0 && (
          <div className="w-full px-4 mt-auto pb-32">
            <h3 className="text-foreground text-sm font-black uppercase tracking-wider mb-4">Quick Add Recommendations</h3>
            <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-none">
              {recommended.map(item => (
                <div key={item.item_id} onClick={() => addToCart({ menuItemId: item.item_id, name: item.name, price: item.price, quantity: 1, station: item.station, modifiers: [] })} className="flex-shrink-0 w-[140px] bg-white border border-border rounded-2xl p-3 flex flex-col gap-2 cursor-pointer relative shadow-sm">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.name} className="w-full h-24 object-cover rounded-xl" />
                  ) : (
                    <div className="w-full h-24 bg-muted rounded-xl flex items-center justify-center text-3xl">🍔</div>
                  )}
                  <div className="mt-1 flex-1">
                    <p className="text-foreground font-bold text-sm leading-tight line-clamp-2">{item.name}</p>
                  </div>
                  <div className="flex justify-between items-center mt-1">
                    <p className="text-foreground font-semibold text-sm">₹{item.price}</p>
                    <div className="bg-primary/10 text-primary p-1.5 rounded-full"><Plus size={14}/></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Toast */}
        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: 50, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.9 }}
              style={{
                position: 'fixed',
                bottom: 24,
                left: '50%',
                transform: 'translateX(-50%)',
                background: toast.type === 'error' ? '#ef4444' : toast.type === 'success' ? '#10b981' : '#3b82f6',
                color: '#fff',
                padding: '12px 24px',
                borderRadius: 30,
                fontSize: 14,
                fontWeight: 600,
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                zIndex: 1000,
                whiteSpace: 'nowrap'
              }}
            >
              {toast.message}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF7F2] pb-56 lg:pb-12">
      {/* Header */}
      <div className="p-4 border-b border-[#E8DFD3] flex justify-between items-center bg-[#FFFDFC]">
        <div className="mx-auto max-w-7xl flex justify-between items-center w-full px-4 sm:px-6 lg:px-8">
          <div>
            <h1 className="text-[#241A15] text-2xl font-black font-serif tracking-tight leading-none">Your Order</h1>
            <p className="text-[#9A642C] text-[9px] font-mono font-black uppercase tracking-widest mt-1.5">
              {visibleCart.reduce((s,i) => s + i.quantity, 0) === 1 
                ? '1 ITEM IN LIST' 
                : `${visibleCart.reduce((s,i) => s + i.quantity, 0)} ITEMS IN LIST`}
            </p>
          </div>
          
          {/* Dynamic Outlet Selector — Fix #11 */}
          <div 
            onClick={() => triggerToast("Campus cannot be changed once items are in cart", "info")}
            className="flex items-center gap-1.5 bg-[#FFFDFC] border border-[#E8DFD3] rounded-xl px-3 py-2 shadow-sm cursor-pointer select-none"
          >
            <MapPin size={11} className="text-[#9A642C]" />
            <span className="text-[#241A15] font-mono text-[9px] font-black uppercase tracking-widest flex items-center gap-1">
              {customerOutlet} <Lock size={9} className="text-[#9A642C]/70 ml-0.5" />
            </span>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* LEFT COLUMN: Cart Items & Rewards (Promo/Points) */}
          <div className="lg:col-span-7 space-y-6">
            
            {/* Cart Items */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {visibleCart.map(item => {
                const menuItem = menuItems.find(m => m.item_id === item.menuItemId);
                const category = menuItem?.category || '';
                const isDiscounted = promoApplied && (
                  !promoScope || 
                  promoScope.toLowerCase() === 'all' || 
                  category.toLowerCase() === promoScope.toLowerCase()
                );
                const itemOriginalPrice = item.price * item.quantity;
                const itemDiscountedPrice = itemOriginalPrice * (1 - promoDiscountPercent / 100);

                return (
                  <div 
                    key={item.id} 
                    className="bg-[#FFFDFC] border border-[#E8DFD3] hover:border-[#9A642C]/40 transition-colors rounded-2xl p-4 shadow-[0_4px_20px_rgba(154,100,44,0.02)] relative overflow-hidden group"
                  >
                    <div className="noise-overlay" />
                    <div className="flex items-center gap-4 relative z-10">
                      {/* Item Thumbnail — Fix #3 */}
                      <div className="w-14 h-14 rounded-[8px] overflow-hidden shrink-0 bg-[#F3ECE3] border border-[#E8DFD3] relative">
                        {menuItem?.image_url ? (
                          <img src={menuItem.image_url} alt={item.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-[#9A642C] text-[#FFFDFC] flex items-center justify-center font-bold text-lg uppercase font-serif select-none">
                            {item.name ? item.name.charAt(0) : '?'}
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <h3 className="text-[#241A15] text-[15px] font-bold font-serif leading-snug mb-1">{item.name}</h3>
                        {item.modifiers && item.modifiers.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-2 mt-1.5">
                            {item.modifiers.map(m => (
                              <span key={m} className="bg-[#F3ECE3] border border-[#E8DFD3] text-[#9A642C] text-[9px] font-mono font-black px-2 py-0.5 rounded-md uppercase tracking-wider">{m}</span>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center gap-2 mt-2">
                          {isDiscounted ? (
                            <>
                              <span className="text-[#66554A]/40 text-xs line-through font-mono">{formatPrice(itemOriginalPrice)}</span>
                              <span className="text-[#2F6B54] text-[15px] font-black font-mono">{formatPrice(itemDiscountedPrice)}</span>
                            </>
                          ) : (
                            <span className="text-[#9A642C] text-[15px] font-black font-mono">{formatPrice(itemOriginalPrice)}</span>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex flex-col items-end gap-3 shrink-0">
                        {/* Fix #10 — Delete with undo snackbar */}
                        <button 
                          onClick={() => handleDeleteItem(item)} 
                          className="text-[#66554A]/40 hover:text-[#B42318] active:scale-90 transition-all p-1 bg-transparent border-none cursor-pointer"
                        >
                          <Trash2 size={15} />
                        </button>

                        {/* Fix #2 — Quantity Counter UI */}
                        <div className="flex items-center gap-1 bg-[#F3ECE3] border border-[#E8DFD3] rounded-xl p-0.5 shadow-inner">
                          <button 
                            type="button"
                            onClick={() => handleDecrement(item.id, item.quantity)} 
                            className="flex items-center justify-center text-[#9A642C] hover:bg-[#9A642C]/10 transition-colors border border-[#E8DFD3] bg-[#FFFDFC] rounded-lg cursor-pointer shrink-0"
                            style={{ width: 32, height: 32 }}
                          >
                            <Minus size={12} />
                          </button>
                          <span className="w-8 text-center text-[#241A15] text-sm font-mono font-bold leading-none select-none">
                            {item.quantity}
                          </span>
                          <button 
                            type="button"
                            onClick={() => updateQuantity(item.id, 1)} 
                            className="flex items-center justify-center text-[#9A642C] hover:bg-[#9A642C]/10 transition-colors border border-[#E8DFD3] bg-[#FFFDFC] rounded-lg cursor-pointer shrink-0"
                            style={{ width: 32, height: 32 }}
                          >
                            <Plus size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Promo Code — Fix #6 */}
            <div 
              className={`flex items-center bg-white rounded-xl overflow-hidden transition-all ${
                promoFocused 
                  ? 'border border-[#C9A84C] shadow-[0_0_0_2px_rgba(201,168,76,0.2)]' 
                  : 'border border-[#B89C48]/35'
              }`}
              style={{
                height: 48
              }}
            >
              <div className="relative flex-grow flex items-center h-full">
                <Tag size={15} className="absolute left-4 text-[#B89C48] pointer-events-none" />
                <input
                  value={promoCode}
                  onChange={e => { setPromoCode(e.target.value.toUpperCase()); setPromoApplied(false); }}
                  onFocus={() => setPromoFocused(true)}
                  onBlur={() => setPromoFocused(false)}
                  placeholder="Have a promo code?"
                  className="w-full h-full bg-transparent pl-11 pr-4 text-[#1A1A17] text-sm font-semibold uppercase tracking-wider outline-none border-none placeholder-[#9CA3AF]"
                />
              </div>
              <button
                onClick={handleApplyPromo}
                type="button"
                className="h-full font-mono text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 border-none cursor-pointer shrink-0"
                style={{
                  width: 80,
                  backgroundColor: promoApplied ? '#10b981' : '#C9A84C',
                  color: '#FFFFFF',
                  fontWeight: '700'
                }}
              >
                {promoApplied ? 'Applied' : 'Apply'}
              </button>
            </div>

            {/* Points Redemption */}
            {userProfile && activeBalance > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, background: 'rgba(198,139,53,0.05)', border: '1px dashed var(--primary)', borderRadius: 12, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 24 }}>🪙</span>
                  <div style={{ flex: 1 }}>
                    <p style={{ color: 'var(--foreground)', fontSize: 14, fontWeight: 600 }}>Use Active Coins</p>
                    <p style={{ color: 'var(--muted-foreground)', fontSize: 12 }}>Active Balance: {activeBalance} pts | Max usable: {maxRedeemablePoints} pts</p>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="number"
                    min="0"
                    max={maxCanUse}
                    value={pointsInput}
                    onChange={e => {
                      let val = parseInt(e.target.value);
                      if (isNaN(val)) val = 0;
                      if (val > maxCanUse) val = maxCanUse;
                      setPointsInput(val > 0 ? val.toString() : '');
                    }}
                    placeholder="Enter points to redeem"
                    style={{ flex: 1, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', color: 'var(--foreground)', outline: 'none' }}
                  />
                  <button
                    onClick={() => setPointsInput(maxCanUse.toString())}
                    style={{ background: 'rgba(198,139,53,0.08)', border: '1px solid var(--border)', color: 'var(--primary)', padding: '10px 16px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
                  >
                    Max
                  </button>
                </div>
                <p style={{ color: 'var(--primary)', fontSize: 11 }}>* You can cover a maximum of 20% of your gross order value with coins.</p>
              </div>
            )}

          </div>

          {/* RIGHT COLUMN: Options, Billing & Checkout CTA */}
          <div className="lg:col-span-5 lg:sticky lg:top-24 space-y-6">
            
            {/* Order Type Toggle — Fix #4 */}
            <div className="relative flex bg-[#FFFDFC] p-1 rounded-[10px] border border-[#E8DFD3] shadow-sm overflow-hidden z-10">
              {(['dine-in', 'pickup', 'delivery'] as const).map(type => {
                const isSelected = orderType === type;
                return (
                  <button
                    key={type}
                    onClick={() => setOrderType(type)}
                    className="relative flex-grow flex-1 h-10 flex items-center justify-center rounded-[8px] text-[11px] font-mono tracking-widest font-black uppercase transition-colors duration-250 z-20"
                    style={{
                      color: isSelected ? '#FFFDFC' : '#66554A',
                    }}
                  >
                    {isSelected && (
                      <motion.div
                        layoutId="cart-order-type-bg"
                        className="absolute inset-0 bg-[#9A642C] rounded-[8px] -z-10 shadow-sm"
                        transition={{ type: 'spring', stiffness: 350, damping: 28 }}
                      />
                    )}
                    {type}
                  </button>
                );
              })}
            </div>

            {/* Pickup Hatch Selection */}
            {orderType === 'pickup' && availableHatches.length > 0 && (
              <div className="bg-[#FFFDFC] border border-[#E8DFD3] rounded-2xl p-5 shadow-[0_4px_16px_rgba(154,100,44,0.02)]">
                <h3 className="text-[#241A15] text-[10px] font-black uppercase tracking-[0.25em] font-mono mb-4">Select Pickup Point</h3>
                <div className="grid gap-2.5">
                  {availableHatches.map(hatch => {
                    const isSelected = selectedHatch === hatch;
                    return (
                      <label 
                        key={hatch} 
                        className={`flex items-center gap-3.5 p-3.5 rounded-xl border cursor-pointer transition-all duration-200 ${
                          isSelected 
                            ? 'border-[#9A642C] bg-[#F3ECE3]/30 shadow-sm' 
                            : 'border-[#E8DFD3] bg-[#FFFDFC] hover:border-[#9A642C]/30'
                        }`}
                      >
                        <input 
                          type="radio" 
                          name="hatch" 
                          value={hatch} 
                          checked={isSelected} 
                          onChange={() => setSelectedHatch(hatch)} 
                          className="accent-[#9A642C] w-4.5 h-4.5 shrink-0" 
                        />
                        <span className={`text-xs font-semibold tracking-wider font-mono uppercase ${
                          isSelected ? 'text-[#9A642C]' : 'text-[#241A15]/80'
                        }`}>{hatch}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Dine-in Table Number — Fix #5 */}
            {orderType === 'dine-in' && (
              <div className="bg-[#FFFDFC] border border-[#E8DFD3] rounded-2xl p-5 shadow-[0_4px_16px_rgba(154,100,44,0.02)]">
                <h3 className="text-[#241A15] text-[10px] font-black uppercase tracking-[0.25em] font-mono mb-3">Table Number</h3>
                <input
                  type="text"
                  placeholder="e.g. T-12 or 4"
                  value={tableNo}
                  onChange={(e) => setTableNo(e.target.value)}
                  readOnly={Boolean(tableToken)}
                  className="w-full bg-[#FFFDFC] rounded-xl py-3.5 px-4 text-[#241A15] text-sm font-semibold tracking-wider outline-none transition-all placeholder-[#9CA3AF]"
                  style={{
                    border: '1.5px solid #E8DFD3',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#9A642C';
                    e.currentTarget.style.boxShadow = '0 0 0 2px rgba(154,100,44,0.2)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#E8DFD3';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
              </div>
            )}

            {/* Delivery Address Form */}
            {orderType === 'delivery' && (
              <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h3 style={{ color: 'var(--foreground)', fontSize: 14, fontWeight: 600, margin: 0 }}>Delivery Address</h3>
                  {errorMsg && <span style={{ color: '#ef4444', fontSize: 11 }}>⚠️ {errorMsg}</span>}
                </div>
                
                {/* Saved Addresses List */}
                {user && userProfile?.addresses && userProfile.addresses.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <p style={{ color: 'rgba(var(--foreground-rgb), 0.5)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8, fontWeight: 600 }}>Saved Coordinates</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {userProfile.addresses.map((addr) => {
                        const isSelected = selectedAddressId === addr.id && !isAddingNewAddress;
                        return (
                          <div
                            key={addr.id}
                            onClick={() => {
                              setSelectedAddressId(addr.id);
                              setDeliveryAddress(addr.fullAddress);
                              setIsAddingNewAddress(false);
                              setErrorMsg('');
                            }}
                            style={{
                              padding: 12, borderRadius: 12, border: `1px solid ${isSelected ? '#d4a354' : 'var(--border)'}`,
                              background: isSelected ? 'rgba(212,163,84,0.08)' : 'rgba(var(--foreground-rgb), 0.01)',
                              cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                            }}
                          >
                            <div style={{ flex: 1, paddingRight: 10 }}>
                              <p style={{ color: isSelected ? '#d4a354' : '#fff', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', fontFamily: 'monospace' }}>{addr.label}</p>
                              <p style={{ color: 'var(--muted-foreground)', fontSize: 11, marginTop: 2, lineHeight: 1.4 }}>{addr.fullAddress}</p>
                            </div>
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (!userProfile?.addresses) return;
                                const filtered = userProfile.addresses.filter(a => a.id !== addr.id);
                                try {
                                  await updateUserAddresses(filtered);
                                  useStore.setState({ userProfile: { ...userProfile, addresses: filtered } });
                                  if (selectedAddressId === addr.id) {
                                    setSelectedAddressId(null);
                                    setDeliveryAddress('');
                                    setIsAddingNewAddress(true);
                                  }
                                } catch (err) {
                                  console.error(err);
                                }
                              }}
                              style={{ background: 'none', border: 'none', color: 'rgba(var(--foreground-rgb), 0.3)', cursor: 'pointer', padding: 4 }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        );
                      })}
                      <button
                        onClick={() => {
                          setIsAddingNewAddress(true);
                          setSelectedAddressId(null);
                        }}
                        style={{
                          background: isAddingNewAddress ? 'rgba(212,163,84,0.05)' : 'none',
                          border: `1px dashed ${isAddingNewAddress ? '#d4a354' : 'var(--border)'}`,
                          color: isAddingNewAddress ? '#d4a354' : 'var(--muted-foreground)',
                          padding: 10, borderRadius: 12, cursor: 'pointer', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', fontFamily: 'monospace'
                        }}
                      >
                        + Enter New Delivery Location
                      </button>
                    </div>
                  </div>
                )}

                {/* Address input form */}
                {(!user || !userProfile?.addresses || userProfile.addresses.length === 0 || isAddingNewAddress) && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    
                    {/* Form Header */}
                    {user && userProfile?.addresses && userProfile.addresses.length > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
                        <span style={{ color: 'var(--primary)', fontSize: 10, fontFamily: 'monospace', textTransform: 'uppercase', fontWeight: 700 }}>New Location</span>
                        <button
                          type="button"
                          onClick={() => {
                            setIsAddingNewAddress(false);
                            if (userProfile.addresses && userProfile.addresses.length > 0) {
                              const first = userProfile.addresses[0];
                              setSelectedAddressId(first.id);
                              setDeliveryAddress(first.fullAddress);
                            }
                          }}
                          style={{ background: 'none', border: 'none', color: 'rgba(var(--foreground-rgb), 0.4)', fontSize: 10, cursor: 'pointer', fontFamily: 'monospace', textTransform: 'uppercase' }}
                        >
                          ← Use Saved Addresses
                        </button>
                      </div>
                    )}

                    {/* GPS Auto fetch */}
                    <button
                      type="button"
                      onClick={handleAutoFetchLocation}
                      disabled={gpsLoading}
                      style={{
                        width: '100%', background: 'rgba(198,139,53,0.05)', border: '1px solid var(--border)',
                        color: 'var(--primary)', padding: '10px', borderRadius: 8, fontWeight: 700, cursor: 'pointer',
                        fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                      }}
                    >
                      <RotateCw size={12} className={gpsLoading ? "animate-spin" : ""} />
                      {gpsLoading ? "Acquiring Coordinates..." : "Auto-Fetch Current Location"}
                    </button>

                    {/* GPS Success Banner */}
                    <AnimatePresence>
                      {showGpsSuccess && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          style={{
                            background: 'rgba(74, 222, 128, 0.1)', border: '1px solid rgba(74, 222, 128, 0.3)',
                            borderRadius: 8, padding: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                            color: '#4ade80', fontSize: 10, fontFamily: 'monospace', textTransform: 'uppercase', overflow: 'hidden'
                          }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                          <span>Coordinates Secured Successfully</span>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Inputs */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      
                      {/* PIN Code Field */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <label style={{ color: 'rgba(var(--foreground-rgb), 0.5)', fontSize: 10, textTransform: 'uppercase', fontFamily: 'monospace' }}>6-Digit PIN Code *</label>
                          {pincodeLoading && (
                            <span style={{ fontSize: 9, textTransform: 'uppercase', fontFamily: 'monospace', color: '#d4a354', display: 'flex', alignItems: 'center', gap: 4 }}>
                              <RotateCw size={9} className="animate-spin" /> Verifying...
                            </span>
                          )}
                        </div>
                        <input
                          type="text"
                          pattern="\d*"
                          maxLength={6}
                          value={pincode}
                          onChange={(e) => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          placeholder="e.g. 500032"
                          style={{ background: 'rgba(var(--foreground-rgb), 0.02)', border: '1px solid var(--border)', borderRadius: 10, padding: 10, color: 'var(--foreground)', outline: 'none', fontSize: 12 }}
                        />
                        {pincodeError && (
                          <span style={{ color: '#ef4444', fontSize: 10, marginTop: 2, fontFamily: 'sans-serif' }}>
                            ⚠️ {pincodeError}
                          </span>
                        )}
                      </div>

                      {/* Locality Dropdown (if multiple post offices found) */}
                      {postOffices.length > 1 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <label style={{ color: 'rgba(var(--foreground-rgb), 0.5)', fontSize: 10, textTransform: 'uppercase', fontFamily: 'monospace' }}>Select Locality / Area *</label>
                          <select
                            value={selectedPostOffice}
                            onChange={(e) => {
                              setSelectedPostOffice(e.target.value);
                              setArea(e.target.value);
                            }}
                            style={{ background: 'rgba(var(--foreground-rgb), 0.02)', border: '1px solid var(--border)', borderRadius: 10, padding: 10, color: 'var(--foreground)', outline: 'none', fontSize: 12 }}
                          >
                            {postOffices.map((po) => (
                              <option key={po.Name} value={po.Name} style={{ color: '#000' }}>
                                {po.Name} ({po.BranchType})
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* City/District & State (Side by Side Grid) */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <label style={{ color: 'rgba(var(--foreground-rgb), 0.5)', fontSize: 10, textTransform: 'uppercase', fontFamily: 'monospace' }}>City / District *</label>
                          <input
                            type="text"
                            value={district}
                            onChange={(e) => setDistrict(e.target.value)}
                            placeholder="e.g. Gachibowli"
                            style={{ background: 'rgba(var(--foreground-rgb), 0.02)', border: '1px solid var(--border)', borderRadius: 10, padding: 10, color: 'var(--foreground)', outline: 'none', fontSize: 12 }}
                          />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <label style={{ color: 'rgba(var(--foreground-rgb), 0.5)', fontSize: 10, textTransform: 'uppercase', fontFamily: 'monospace' }}>State *</label>
                          <input
                            type="text"
                            value={stateVal}
                            onChange={(e) => setStateVal(e.target.value)}
                            placeholder="e.g. Telangana"
                            style={{ background: 'rgba(var(--foreground-rgb), 0.02)', border: '1px solid var(--border)', borderRadius: 10, padding: 10, color: 'var(--foreground)', outline: 'none', fontSize: 12 }}
                          />
                        </div>
                      </div>

                      {/* Flat & Room */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ color: 'rgba(var(--foreground-rgb), 0.5)', fontSize: 10, textTransform: 'uppercase', fontFamily: 'monospace' }}>Flat / Hostel & Room *</label>
                        <input
                          type="text"
                          value={flatNo}
                          onChange={(e) => setFlatNo(e.target.value)}
                          placeholder="e.g. Room 302, Hostel 5"
                          style={{ background: 'rgba(var(--foreground-rgb), 0.02)', border: '1px solid var(--border)', borderRadius: 10, padding: 10, color: 'var(--foreground)', outline: 'none', fontSize: 12 }}
                        />
                      </div>

                      {/* Floor & Wing */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ color: 'rgba(var(--foreground-rgb), 0.5)', fontSize: 10, textTransform: 'uppercase', fontFamily: 'monospace' }}>Floor / Wing (Optional)</label>
                        <input
                          type="text"
                          value={floor}
                          onChange={(e) => setFloor(e.target.value)}
                          placeholder="e.g. 3rd Floor"
                          style={{ background: 'rgba(var(--foreground-rgb), 0.02)', border: '1px solid var(--border)', borderRadius: 10, padding: 10, color: 'var(--foreground)', outline: 'none', fontSize: 12 }}
                        />
                      </div>

                      {/* Landmark */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ color: 'rgba(var(--foreground-rgb), 0.5)', fontSize: 10, textTransform: 'uppercase', fontFamily: 'monospace' }}>Nearby Landmark (Optional)</label>
                        <input
                          type="text"
                          value={landmark}
                          onChange={(e) => setLandmark(e.target.value)}
                          placeholder="e.g. Near Mess Gate"
                          style={{ background: 'rgba(var(--foreground-rgb), 0.02)', border: '1px solid var(--border)', borderRadius: 10, padding: 10, color: 'var(--foreground)', outline: 'none', fontSize: 12 }}
                        />
                      </div>

                      {/* Campus Area */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ color: 'rgba(var(--foreground-rgb), 0.5)', fontSize: 10, textTransform: 'uppercase', fontFamily: 'monospace' }}>Campus Area / Location *</label>
                        <input
                          type="text"
                          value={area}
                          onChange={(e) => setArea(e.target.value)}
                          placeholder="e.g. IIT Campus, Library Lawn"
                          style={{ background: 'rgba(var(--foreground-rgb), 0.02)', border: '1px solid var(--border)', borderRadius: 10, padding: 10, color: 'var(--foreground)', outline: 'none', fontSize: 12 }}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                      <label style={{ color: 'rgba(var(--foreground-rgb), 0.5)', fontSize: 10, textTransform: 'uppercase', fontFamily: 'monospace' }}>Address Type / Label</label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {(['Hostel', 'Library', 'Classroom', 'Home', 'Other'] as const).map((lbl) => {
                          const isSelected = addressLabel === lbl;
                          return (
                            <button
                              key={lbl}
                              type="button"
                              onClick={() => setAddressLabel(lbl)}
                              style={{
                                background: isSelected ? '#d4a354' : 'rgba(var(--foreground-rgb), 0.04)',
                                border: `1px solid ${isSelected ? '#d4a354' : 'var(--border)'}`,
                                color: isSelected ? '#1b1208' : 'var(--muted-foreground)',
                                padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', fontFamily: 'monospace'
                              }}
                            >
                              {lbl}
                            </button>
                          );
                        })}
                      </div>

                      {addressLabel === 'Other' && (
                        <input
                          type="text"
                          value={customLabel}
                          onChange={(e) => setCustomLabel(e.target.value)}
                          placeholder="Enter custom label e.g., Labs"
                          maxLength={15}
                          style={{ background: 'rgba(var(--foreground-rgb), 0.02)', border: '1px solid var(--border)', borderRadius: 8, padding: 8, color: 'var(--foreground)', outline: 'none', fontSize: 11, fontFamily: 'monospace', textTransform: 'uppercase', marginTop: 4 }}
                        />
                      )}
                    </div>

                    {user && (
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted-foreground)', fontSize: 11, cursor: 'pointer', userSelect: 'none', marginTop: 6 }}>
                        <input
                          type="checkbox"
                          checked={saveToProfile}
                          onChange={(e) => setSaveToProfile(e.target.checked)}
                          style={{ width: 14, height: 14, accentColor: '#d4a354' }}
                        />
                        <span>Save this coordinate for future orders</span>
                      </label>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Bill Summary */}
            <div className="bg-white rounded-2xl p-5 border border-[#B89C48]/25 shadow-[0_4px_16px_rgba(184,156,72,0.03)]">
              <h3 className="text-[#1A1A17] text-[10px] font-black uppercase tracking-[0.25em] font-mono mb-4">Bill Summary</h3>
              <div className="flex flex-col gap-3">
                <div className="flex justify-between text-[#1A1A17]/65 text-sm font-semibold">
                  <span>Item Total</span>
                  <span className="font-mono">{formatPrice(subtotal)}</span>
                </div>
                {promoDiscount > 0 && (
                  <div className="flex justify-between text-[#10B981] text-sm font-bold">
                    <span>Promo Discount</span>
                    <span className="font-mono">-{formatPrice(promoDiscount)}</span>
                  </div>
                )}
                {pointsDiscount > 0 && (
                  <div className="flex justify-between text-[#B89C48] text-sm font-bold">
                    <span>Coins Redeemed</span>
                    <span className="font-mono">-{formatPrice(pointsDiscount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-[#1A1A17]/65 text-sm font-semibold relative">
                  <span className="flex items-center gap-1.5 cursor-pointer select-none" onClick={handleFeeTooltip}>
                    Platform Fee 
                    <Info size={12} className="text-[#B89C48] hover:text-[#C9A84C] transition-colors" />
                  </span>
                  <span className="font-mono">{formatPrice(platformFee)}</span>

                  {/* Platform Fee Tooltip — Fix #7 */}
                  <AnimatePresence>
                    {showFeeTooltip && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 5 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 5 }}
                        className="absolute left-0 bottom-full mb-2 w-64 bg-[#FFFDFC] text-[#241A15] text-[11px] leading-relaxed p-3.5 rounded-xl shadow-xl z-50 border border-[#E8DFD3]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="font-bold text-[#9A642C] uppercase font-mono tracking-wider mb-1">About Platform Fee</div>
                        This small fee helps us maintain high-speed delivery, support sanitation protocols, and fund kitchen operations.
                        <div className="absolute left-6 top-full w-2.5 h-2.5 bg-[#FFFDFC] border-r border-b border-[#E8DFD3] rotate-45 transform -translate-y-1.5" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                <div className="h-[1px] bg-[#E8DFD3] my-2" />
                <div className="flex justify-between items-center">
                  <span className="text-[#241A15] text-base font-black font-serif uppercase tracking-wide">To Pay</span>
                  <span className="text-[#241A15] text-xl font-black font-mono">{formatPrice(total)}</span>
                </div>
              </div>
            </div>

            {/* Checkout CTA */}
            <div className="fixed bottom-[80px] left-0 right-0 lg:relative lg:bottom-0 lg:left-auto lg:right-auto lg:p-0 lg:bg-transparent lg:border-none lg:shadow-none z-40 bg-[#FFFDFC] border-t border-[#E8DFD3] p-4 shadow-[0_-4px_24px_rgba(36,26,21,0.03)]">
              {/* Privacy & secure-payment assurance */}
              <p className="text-center text-[9px] font-mono font-semibold text-[#66554A]/50 uppercase tracking-widest mb-2.5 flex items-center justify-center gap-1">
                <Lock size={9} className="text-[#9A642C]/70" />
                Secure &amp; private · Your data is never shared or sold
              </p>
              <button
                onClick={handlePlaceOrder}
                disabled={isPlacingOrder || authLoading}
                className="w-full bg-[#9A642C] hover:bg-[#805020] text-[#FFFDFC] border-none py-4 px-4 rounded-xl flex items-center justify-between active:scale-[0.98] transition-all disabled:opacity-75 disabled:cursor-wait shadow-md"
              >
                <div className="flex flex-col items-start text-left">
                  <span className="text-[10px] font-mono font-black opacity-90 tracking-widest uppercase">To Pay</span>
                  <span className="text-lg font-mono font-black leading-none mt-0.5">{formatPrice(total)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-black uppercase tracking-widest">{isPlacingOrder ? 'Processing...' : authLoading ? 'Checking Session...' : user ? 'Place Order' : 'Login to Continue'}</span>
                  <ArrowRight size={16} strokeWidth={2.5} />
                </div>
              </button>
            </div>

          </div>

        </div>
      </div>


      {/* Celebration Confetti and Ribbons Overlay */}
      <CelebrationOverlay active={showConfetti} />

      {/* Undo Delete Snackbar — Fix #10 */}
      <AnimatePresence>
        {undoSnapshot && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-[160px] left-4 right-4 max-w-[420px] mx-auto z-50 bg-[#FFFDFC] text-[#241A15] border border-[#E8DFD3] p-4 rounded-xl flex items-center justify-between shadow-2xl"
          >
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-medium font-sans">
                Removed <span className="font-bold text-[#9A642C]">{undoSnapshot.item.name}</span>
              </span>
            </div>
            <button
              onClick={handleUndoDelete}
              type="button"
              className="text-[#9A642C] hover:text-[#241A15] bg-[#9A642C]/10 hover:bg-[#9A642C]/20 border border-[#9A642C]/20 px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer"
            >
              Undo
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Auth Bottom Sheet Modal — Fix #12 */}
      <AnimatePresence>
        {showAuthModal && (
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[99999] flex items-end justify-center"
            onClick={() => setShowAuthModal(false)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: 'spring', damping: 25, stiffness: 250 }}
              className="w-full max-w-md bg-white rounded-t-3xl overflow-hidden border-t border-[#B89C48]/25"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Drag handle line */}
              <div className="w-12 h-1 bg-[#1A1A17]/15 rounded-full mx-auto my-3" />
              <div className="p-6 pb-8">
                <AuthWorkspace />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toast Notifications */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            style={{
              position: 'fixed',
              top: 24,
              left: '16px',
              right: '16px',
              maxWidth: '420px',
              margin: '0 auto',
              zIndex: 100000,
              background: 'rgba(var(--background-rgb), 0.92)',
              backdropFilter: 'blur(12px)',
              border: `1px solid ${
                toast.type === 'success'
                  ? 'rgba(16, 185, 129, 0.4)'
                  : toast.type === 'error'
                  ? 'rgba(239, 68, 68, 0.4)'
                  : 'rgba(212, 163, 84, 0.4)'
              }`,
              borderRadius: '16px',
              padding: '14px 18px',
              boxShadow: `0 12px 32px rgba(0, 0, 0, 0.5), 0 0 20px ${
                toast.type === 'success'
                  ? 'rgba(16, 185, 129, 0.15)'
                  : toast.type === 'error'
                  ? 'rgba(239, 68, 68, 0.15)'
                  : 'rgba(212, 163, 84, 0.15)'
              }`,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              pointerEvents: 'auto'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {toast.type === 'success' && <CheckCircle2 size={22} color="#10b981" />}
              {toast.type === 'error' && <AlertCircle size={22} color="#ef4444" />}
              {toast.type === 'info' && <Info size={22} color="#d4a354" />}
            </div>
            <div style={{ flex: 1, color: 'var(--foreground)', fontSize: '13.5px', fontWeight: 500, lineHeight: 1.4 }}>
              {toast.message}
            </div>
            <button
              onClick={() => setToast(null)}
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(var(--foreground-rgb), 0.4)',
                cursor: 'pointer',
                padding: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%',
                transition: 'background 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--border)';
                e.currentTarget.style.color = '#fff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'none';
                e.currentTarget.style.color = 'rgba(var(--foreground-rgb), 0.4)';
              }}
            >
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Celebration Promo Success Modal */}
      <AnimatePresence>
        {showPromoSuccessModal && appliedPromoDetails && (
          <div 
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(var(--background-rgb), 0.82)',
              backdropFilter: 'blur(10px)',
              zIndex: 99998,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 24,
              pointerEvents: 'auto'
            }}
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 15 }}
              transition={{ type: 'spring', damping: 20, stiffness: 260 }}
              style={{
                width: '100%',
                maxWidth: '360px',
                background: 'linear-gradient(135deg, #d4a354, #8a5f1e, #d4a354)',
                padding: '1.5px', // simulated border
                borderRadius: '24px',
                boxShadow: '0 25px 60px rgba(0, 0, 0, 0.85), 0 0 40px rgba(212, 163, 84, 0.25)',
                position: 'relative',
                pointerEvents: 'auto'
              }}
            >
              <div
                style={{
                  background: 'var(--card)',
                  borderRadius: '22px',
                  padding: '36px 24px 28px',
                  textAlign: 'center',
                  position: 'relative',
                  overflow: 'hidden'
                }}
              >
                {/* Twinkling Gold Sparkles */}
                <motion.div
                  animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  style={{ position: 'absolute', top: 24, left: 30, color: 'var(--primary)', opacity: 0.7 }}
                >
                  <Sparkles size={16} />
                </motion.div>
                <motion.div
                  animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
                  style={{ position: 'absolute', bottom: 110, right: 24, color: 'var(--primary)', opacity: 0.7 }}
                >
                  <Sparkles size={14} />
                </motion.div>

                {/* Rotating Dotted Ring + Checkmark */}
                <div style={{ position: 'relative', width: 84, height: 84, margin: '0 auto 24px' }}>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 12, ease: 'linear', repeat: Infinity }}
                    style={{
                      position: 'absolute',
                      inset: -4,
                      borderRadius: '50%',
                      border: '1.5px dashed rgba(16, 185, 129, 0.65)',
                      pointerEvents: 'none'
                    }}
                  />
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.18), rgba(16, 185, 129, 0.04))',
                      border: '2.5px solid #10b981',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 0 25px rgba(16, 185, 129, 0.3)'
                    }}
                  >
                    <CheckCircle2 size={40} color="#10b981" />
                  </div>
                </div>

                {/* Modal Info */}
                <span 
                  style={{ 
                    display: 'inline-block',
                    backgroundColor: 'rgba(212, 163, 84, 0.1)',
                    border: '1px solid rgba(212, 163, 84, 0.25)',
                    color: 'var(--primary)',
                    fontSize: '11px',
                    fontFamily: 'monospace',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    padding: '4px 12px',
                    borderRadius: '12px',
                    marginBottom: 14,
                    letterSpacing: '0.08em'
                  }}
                >
                  Coupon Applied
                </span>

                <h3 style={{ color: 'var(--foreground)', fontSize: '21px', fontWeight: 700, margin: '0 0 8px 0', letterSpacing: '-0.02em' }}>
                  Code <span style={{ color: 'var(--primary)' }}>'{appliedPromoDetails.code}'</span>
                </h3>
                
                <p style={{ color: 'var(--muted-foreground)', fontSize: '13.5px', margin: '0 0 28px 0', fontWeight: 400 }}>
                  Congratulations! You unlocked {appliedPromoDetails.discountPercent}% OFF.
                </p>

                {/* Large Savings Callout */}
                <motion.div
                  initial={{ scale: 0.98 }}
                  animate={{ scale: 1 }}
                  transition={{
                    repeat: Infinity,
                    repeatType: 'reverse',
                    duration: 1.5,
                    ease: 'easeInOut'
                  }}
                  style={{
                    background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(16, 185, 129, 0.02))',
                    border: '1px solid rgba(16, 185, 129, 0.35)',
                    borderRadius: '18px',
                    padding: '18px 20px',
                    marginBottom: 28,
                    boxShadow: 'inset 0 0 15px rgba(16, 185, 129, 0.05), 0 0 15px rgba(16, 185, 129, 0.1)'
                  }}
                >
                  <p style={{ color: 'rgba(16, 185, 129, 0.85)', fontSize: '11px', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.06em', margin: '0 0 4px 0' }}>
                    Total Savings
                  </p>
                  <p 
                    style={{ 
                      color: '#10b981', 
                      fontSize: '30px', 
                      fontWeight: 800, 
                      fontFamily: 'monospace', 
                      margin: 0,
                      textShadow: '0 0 15px rgba(16, 185, 129, 0.55)'
                    }}
                  >
                    ₹{appliedPromoDetails.savedAmount.toFixed(2)}
                  </p>
                </motion.div>

                {/* Action Button */}
                <button
                  onClick={() => {
                    setShowPromoSuccessModal(false);
                    setShowConfetti(false);
                  }}
                  style={{
                    width: '100%',
                    background: 'linear-gradient(135deg, #d4a354, #8a5f1e)',
                    border: 'none',
                    color: 'var(--foreground)',
                    padding: '15px 20px',
                    borderRadius: '16px',
                    fontSize: '14.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 8px 24px rgba(196, 144, 64, 0.35)',
                    transition: 'all 0.2s',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.opacity = '0.9';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.opacity = '1';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  Woohoo! Thanks
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
