'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signOut } from 'firebase/auth';
import { motion, AnimatePresence } from 'framer-motion';
import { LogOut, Copy, Check, Share2, Award, Gift, Clock, ChevronDown, ChevronUp, MapPin, Trash2, Home, Building, BookOpen, GraduationCap, Star, Eye, EyeOff } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { getUserOrders, updateUserAddresses } from '@/lib/dbService';
import { updateStudentEmail } from '@/lib/authService';
import { OrderDocument, SavedAddress, RefundRequestDocument } from '@/lib/types';

import FeedbackModal from '@/components/customer/FeedbackModal';
import { getFriendlyErrorMessage } from '@/lib/utils';
import { isTerminalOrderStatus, isCompletedOrderStatus, isRefundEligibleOrder } from '@/lib/orderUtils';
import { createRefundRequest, CreateRefundRequestPayload, dedupeOrdersById, getUserRefundRequests } from '@/features/orders/orderService';
import { auth } from '@/lib/firebase';
import dynamic from 'next/dynamic';

const LocationPickerMap = dynamic(() => import('@/components/admin/LocationPickerMap'), { ssr: false });

function ProfileSkeleton() {
  return (
    <div className="min-h-screen bg-[#fbf9f1] px-4 pb-48 pt-20 md:pt-32 sm:px-6">
      <div className="mx-auto max-w-6xl animate-pulse">
        <div className="flex flex-col items-center">
          <div className="h-20 w-20 rounded-full bg-[#e8e0d8]" />
          <div className="mt-4 h-7 w-48 rounded-lg bg-[#e8e0d8]" />
          <div className="mt-2 h-4 w-28 rounded bg-[#eee8df]" />
        </div>
        <div className="mt-10 grid gap-8 lg:grid-cols-2">
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-3">
              {[0, 1, 2].map((item) => <div key={item} className="h-28 rounded-2xl border border-[#e8e0d8] bg-white" />)}
            </div>
            <div className="h-56 rounded-2xl border border-[#e8e0d8] bg-white" />
          </div>
          <div className="space-y-4">
            <div className="h-7 w-40 rounded bg-[#e8e0d8]" />
            {[0, 1, 2].map((item) => <div key={item} className="h-28 rounded-2xl border border-[#e8e0d8] bg-white" />)}
          </div>
        </div>
      </div>
    </div>
  );
}

function CustomSelect({ value, onChange, options }: { value: string, onChange: (v: any) => void, options: {value: string, label: string}[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setIsOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find(o => o.value === value) || options[0];

  return (
    <div className="relative w-full" ref={ref}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-black/5 border border-border p-3 rounded-xl text-foreground text-sm font-medium flex justify-between items-center cursor-pointer hover:bg-black/10 transition-colors"
      >
        <span>{selectedOption?.label}</span>
        <ChevronDown size={16} className={`text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </div>
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.15 }}
            className="absolute z-[110] w-full mt-1 bg-card border border-border rounded-xl shadow-xl overflow-hidden flex flex-col"
          >
            {options.map(opt => (
              <div 
                key={opt.value}
                onClick={() => { onChange(opt.value); setIsOpen(false); }}
                className={`p-3 text-sm cursor-pointer hover:bg-black/5 transition-colors flex justify-between items-center ${value === opt.value ? 'bg-[#f8bc51]/10 text-[#f8bc51] font-bold' : 'text-foreground font-medium'}`}
              >
                {opt.label}
                {value === opt.value && <Check size={16} className="text-[#f8bc51]" />}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const { user, userProfile, authLoading, activeOrders, setUser, setUserProfile, setAuthLoading } = useStore();
  const [orders, setOrders] = useState<OrderDocument[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const [copied, setCopied] = useState(false);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [feedbackOrder, setFeedbackOrder] = useState<OrderDocument | null>(null);
  const [refundOrder, setRefundOrder] = useState<OrderDocument | null>(null);
  const [refundScope, setRefundScope] = useState<'full_order' | 'items' | 'custom_amount'>('full_order');
  const [refundReason, setRefundReason] = useState<CreateRefundRequestPayload['reason_category']>('wrong_item');
  const [refundNote, setRefundNote] = useState('');
  const [refundSubmitting, setRefundSubmitting] = useState(false);
  const [refundItems, setRefundItems] = useState<{item_id: string, quantity: number}[]>([]);
  const [submittedRefunds, setSubmittedRefunds] = useState<Record<string, boolean>>({});
  const [refundRequests, setRefundRequests] = useState<RefundRequestDocument[]>([]);

  const getRefundDisplayInfo = (orderId: string) => {
    const req = refundRequests.find(r => r.order_id === orderId);
    
    if (!req) {
      if (submittedRefunds[orderId]) return { text: "Submitted", bg: "bg-blue-50 text-blue-700 border-blue-100" };
      return null;
    }

    if (req.status === 'pending') {
      return { text: "Pending review", bg: "bg-orange-50 text-orange-700 border-orange-100" };
    }
    if (req.status === 'rejected') {
      return { text: "Rejected", bg: "bg-red-50 text-red-700 border-red-100" };
    }
    if (req.status === 'approved') {
      if (req.payment_status === 'paid') {
        return { text: "Refund paid", bg: "bg-emerald-50 text-emerald-700 border-emerald-100" };
      }
      return { text: "Approved, payment pending", bg: "bg-blue-50 text-blue-700 border-blue-100" };
    }
    return null;
  };

  const ordersRef = useRef<HTMLDivElement>(null);


  const [showAddAddress, setShowAddAddress] = useState(false);
  const [newAddrLabel, setNewAddrLabel] = useState<'Home' | 'Hostel' | 'Library' | 'Classroom' | 'Other'>('Home');
  const [newCustomLabel, setNewCustomLabel] = useState('');
  const [newFlatNo, setNewFlatNo] = useState('');
  const [newFloor, setNewFloor] = useState('');
  const [newArea, setNewArea] = useState('');
  const [newLandmark, setNewLandmark] = useState('');
  
  const [gpsLoading, setGpsLoading] = useState(false);
  const [coordinates, setCoordinates] = useState<{ lat: number; lng: number } | undefined>(undefined);
  const [errorMsg, setErrorMsg] = useState('');
  const [showGpsSuccess, setShowGpsSuccess] = useState(false);

  const [verifyStudentEmail, setVerifyStudentEmail] = useState('');
  const [verifyPassword, setVerifyPassword] = useState('');
  const [showVerifyPassword, setShowVerifyPassword] = useState(false);
  const [verifyingEmail, setVerifyingEmail] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  const [verifySuccess, setVerifySuccess] = useState(false);

  const [showPointsHistory, setShowPointsHistory] = useState(false);
  const [ledgerHistory, setLedgerHistory] = useState<any[]>([]);
  const [activeBalance, setActiveBalance] = useState(0);
  const [pointsLoading, setPointsLoading] = useState(true);

  const profileUserId = user?.uid || (userProfile as any)?.uid || userProfile?.user_id;

  useEffect(() => {
    if (profileUserId) {
      const fetchLedger = async () => {
        setPointsLoading(true);
        try {
          const { db } = await import('@/lib/firebase');
          const { collection, query, where, getDocs } = await import('firebase/firestore');
          
          const q = query(
            collection(db, 'point_ledger'),
            where('user_id', '==', profileUserId)
          );
          const snap = await getDocs(q);
          const data: any[] = [];
          snap.forEach(docSnap => {
            data.push({ id: docSnap.id, ...docSnap.data() });
          });
          
          // Sort in-memory descending by created_at
          data.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));

          setLedgerHistory(data);
          
          // Calculate active balance
          const now = new Date().toISOString();
          const active = data.filter(d => d.amount > 0 && (!d.expires_at || d.expires_at > now) && !d.is_expired);
          const totalActive = active.reduce((sum, d) => sum + d.amount, 0);
          
          if (data.length === 0) {
            setActiveBalance(Number(userProfile?.points || 0));
          } else {
            setActiveBalance(totalActive);
          }
        } catch (err) {
          console.warn("Failed to fetch points ledger from Firestore:", err);
          setActiveBalance(Number(userProfile?.points || 0));
        } finally {
          setPointsLoading(false);
        }
      };
      fetchLedger();
    } else {
      setPointsLoading(false);
    }
  }, [profileUserId, user?.uid, (userProfile as any)?.uid, userProfile?.user_id, userProfile?.points]);

  const handleVerifyStudentEmail = async () => {
    if (!verifyStudentEmail || !verifyPassword) {
      setVerifyError('Please provide both student email and current password.');
      return;
    }
    const isStudentEmail = verifyStudentEmail.endsWith('.edu') || verifyStudentEmail.endsWith('.ac.in') || verifyStudentEmail.endsWith('.edu.in');
    if (!isStudentEmail) {
      setVerifyError('Please enter a valid student email (.edu, .ac.in, .edu.in)');
      return;
    }
    
    setVerifyingEmail(true);
    setVerifyError('');
    try {
      await updateStudentEmail(verifyPassword, verifyStudentEmail);
      setVerifySuccess(true);
    } catch (err: any) {
      setVerifyError(getFriendlyErrorMessage(err));
    } finally {
      setVerifyingEmail(false);
    }
  };

  const scrollToOrders = () => {
    ordersRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  useEffect(() => {
    if (user?.uid) {
      getUserOrders(user.uid).then(setOrders).catch(console.error);
      getUserRefundRequests(user.uid).then(setRefundRequests).catch(console.error);
    }
  }, [user]);

  const uniqueActiveOrders = dedupeOrdersById(activeOrders);
  const uniqueOrders = dedupeOrdersById(orders);
  const filteredActiveOrders = uniqueActiveOrders.filter(o => !isTerminalOrderStatus(o.status));
  const filteredPastOrders = uniqueOrders.filter(o => isTerminalOrderStatus(o.status));
  const orderCount = dedupeOrdersById([...uniqueOrders, ...uniqueActiveOrders]).length;

  const handleRefundSubmit = async () => {
    if (!refundOrder) return;
    setRefundSubmitting(true);
    try {
      await createRefundRequest({
        order_id: refundOrder.order_id,
        request_scope: refundScope,
        reason_category: refundReason,
        customer_note: refundNote,
        ...(refundScope === 'items' && { items: refundItems })
      });
      setSubmittedRefunds(prev => ({ ...prev, [refundOrder.order_id]: true }));
      setRefundOrder(null);
      if (user?.uid) {
        getUserRefundRequests(user.uid).then(setRefundRequests).catch(console.error);
      }
    } catch (err) {
      alert(getFriendlyErrorMessage(err));
    } finally {
      setRefundSubmitting(false);
    }
  };

  if (!mounted || authLoading) {
    return <ProfileSkeleton />;
  }

  if (!user || !userProfile) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <span className="text-5xl mb-5">👋</span>
        <h2 className="text-[#1b1c17] text-2xl font-bold font-serif mb-2">Please Log In</h2>
        <p className="text-[#534434] text-sm leading-relaxed max-w-xs mb-8">
          You need to be logged in to view your profile and order history.
        </p>
        <button
          onClick={() => router.push('/login')}
          className="bg-[#855300] text-white px-8 py-3.5 rounded-xl font-mono font-black text-sm uppercase tracking-widest shadow-sm hover:bg-[#6b4200] hover:shadow-md hover:translate-y-[-1px] active:translate-y-0 transition-all duration-300"
        >
          Log In to Continue
        </button>
        <button
          onClick={() => router.push('/')}
          className="mt-4 text-[10px] font-mono uppercase tracking-widest text-[#867461] hover:text-[#534434] transition-colors"
        >
          ← Back to Home
        </button>
      </div>
    );
  }

  const handleCopyCode = () => {
    if (userProfile.referral_code) {
      navigator.clipboard.writeText(userProfile.referral_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleShare = () => {
    if (navigator.share && userProfile.referral_code) {
      navigator.share({
        title: 'Join Ilara!',
        text: `Hey! Use my referral code ${userProfile.referral_code} to get extra points when you join Ilara!`,
        url: window.location.origin
      }).catch(console.error);
    } else {
      handleCopyCode();
    }
  };

  const handleLogout = async () => {
    setAuthLoading(true);
    try {
      await fetch('/api/auth/session', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logout' }) 
      }).catch(console.error);
      
      await signOut(auth);
      setUser(null);
      setUserProfile(null);
      router.push('/');
    } catch (error) {
      console.error('[profile logout] Failed to sign out from Firebase:', error);
      setErrorMsg('Could not sign out. Please try again.');
      setAuthLoading(false);
    }
  };

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
            { headers: { 'User-Agent': 'OasisCafeDelivery/1.0' } }
          );
          
          if (!response.ok) throw new Error("Reverse geocoding failed");
          
          const data = await response.json();
          const addr = data.address || {};
          const street = addr.road || addr.suburb || addr.neighbourhood || addr.pedestrian || "";
          const building = addr.building || addr.amenity || addr.university || addr.college || "";
          
          let detectedArea = street;
          if (building && street) detectedArea = `${building}, ${street}`;
          else if (building) detectedArea = building;
          if (data.display_name && !detectedArea) detectedArea = data.display_name.split(',').slice(0, 2).join(',').trim();
          
          setNewArea(detectedArea || `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
          if (addr.suburb || addr.county) setNewLandmark(addr.suburb || addr.county || "");
          
          setShowGpsSuccess(true);
          setTimeout(() => setShowGpsSuccess(false), 3000);
          
          if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
            window.navigator.vibrate(100);
          }
        } catch (err) {
          console.error("Geocoding failed, falling back to coordinates:", err);
          setNewArea(`Campus Coordinates: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
          setNewLandmark("GPS Detected Location");
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

  const handleSaveNewAddress = async () => {
    if (!newFlatNo.trim() || !newArea.trim()) {
      setErrorMsg("Please provide at least Flat/Hostel No and Area");
      return;
    }
    if (!user || !userProfile) return;

    const labelText = newAddrLabel === 'Other' && newCustomLabel.trim() ? newCustomLabel.trim() : newAddrLabel;
    const compiledAddress = `${newFlatNo}, ${newFloor.trim() ? newFloor.trim() + ', ' : ''}${newArea.trim()}${newLandmark.trim() ? ' (Landmark: ' + newLandmark.trim() + ')' : ''}`;
    
    const newAddress: SavedAddress = {
      id: Math.random().toString(36).substring(7),
      label: labelText,
      flatNo: newFlatNo,
      floor: newFloor,
      area: newArea,
      landmark: newLandmark,
      fullAddress: compiledAddress,
      coordinates: coordinates,
    };
    
    const existingAddresses = userProfile.addresses || [];
    const updatedAddresses = [newAddress, ...existingAddresses];
    
    try {
      await updateUserAddresses(updatedAddresses);
      setUserProfile({ ...userProfile, addresses: updatedAddresses });
      setShowAddAddress(false);
      setNewFlatNo(''); setNewFloor(''); setNewArea(''); setNewLandmark(''); setNewCustomLabel('');
      setCoordinates(undefined); setErrorMsg('');
    } catch (err) {
      console.error("Failed to save address: ", err);
      setErrorMsg(getFriendlyErrorMessage(err));
    }
  };


  const getInitials = () => {
    if (userProfile.student_email) {
      return userProfile.student_email.substring(0, 2).toUpperCase();
    }
    return "US";
  };

  const memberSince = new Date(userProfile.created_at || Date.now()).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });  return (
    <div className="min-h-screen bg-[#fbf9f1] pb-28 pt-8 lg:pt-28 px-4 max-w-6xl mx-auto relative z-10 sm:px-6 lg:px-8">
      {/* ── Header Area ── */}
      <div className="pt-10 pb-6 flex flex-col items-center text-center bg-gradient-to-b from-[#fbf9f1]/10 to-transparent">
        <div className="w-20 h-20 rounded-full bg-[#1b1c17] text-[#fbf9f1] border-4 border-[#e8e0d8] flex items-center justify-center text-3xl font-serif italic font-bold mb-3 shadow-md">
          {getInitials()}
        </div>
        <h2 className="text-[#1b1c17] text-2xl font-bold font-serif">
          {user.phone.replace(/(\+\d{2})(\d{4})(\d{6})/, '$1 ****$3')}
        </h2>
        {userProfile.student_email && (
          <div className="inline-flex items-center gap-1.5 text-[#855300] bg-[#fff8e6] border border-[#f59e0b]/30 px-3 py-1 rounded-full text-xs font-bold font-mono uppercase tracking-widest mt-2 shadow-sm">
            <Check size={12} className="stroke-[3]" /> Verified Student
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start mt-6">
        
        {/* LEFT COLUMN: Profile info, rewards, referral, and addresses */}
        <div className="lg:col-span-6 space-y-6">
          
          {/* Stats Row */}
          <div className="flex gap-3">
            <div className="flex-1 bg-white border border-[#e8e0d8] rounded-2xl p-4 text-center shadow-sm hover:border-[#d8c3ad] transition-colors">
              <Award size={20} className="text-[#855300] mx-auto mb-2" />
              <p className="text-[#867461] text-[10px] uppercase tracking-widest font-bold mb-1">Active Coins</p>
              <p className="text-[#1b1c17] text-xl font-black font-mono">
                {pointsLoading ? "..." : activeBalance}
              </p>
            </div>
            <div 
              onClick={scrollToOrders}
              className="flex-1 bg-white border border-[#e8e0d8] rounded-2xl p-4 text-center shadow-sm cursor-pointer hover:bg-[#fbf9f1]/50 hover:border-[#d8c3ad] transition-all"
            >
              <Gift size={20} className="text-[#855300] mx-auto mb-2" />
              <p className="text-[#867461] text-[10px] uppercase tracking-widest font-bold mb-1">Orders</p>
              <p className="text-[#1b1c17] text-xl font-black font-mono">{orderCount}</p>
            </div>
            <div className="flex-1 bg-white border border-[#e8e0d8] rounded-2xl p-4 text-center shadow-sm hover:border-[#d8c3ad] transition-colors">
              <Clock size={20} className="text-[#855300] mx-auto mb-2" />
              <p className="text-[#867461] text-[10px] uppercase tracking-widest font-bold mb-1">Joined</p>
              <p className="text-[#1b1c17] text-xs font-bold tracking-tight mt-1 bg-[#f5f4ec] px-2 py-0.5 rounded-md border border-[#d8c3ad]/30 inline-block font-mono">{memberSince}</p>
            </div>
          </div>

          {/* Rewards Progress */}
          <div 
            onClick={() => setShowPointsHistory(true)}
            className="cursor-pointer bg-white border border-[#e8e0d8] rounded-2xl p-5 hover:bg-[#fbf9f1]/50 hover:border-[#d8c3ad] transition-all relative overflow-hidden shadow-sm"
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-[#1b1c17] text-xs font-bold uppercase tracking-[0.15em] font-mono">Ilara Rewards</h3>
              <Link
                href="/ledger"
                onClick={(event) => event.stopPropagation()}
                className="text-[10px] text-[#855300] uppercase tracking-widest font-bold flex items-center gap-1 hover:underline"
              >
                View Ledger &rarr;
              </Link>
            </div>
            <div className="flex items-end gap-1.5 mb-4">
              <span className="text-4xl font-black text-[#1b1c17] leading-none tracking-tighter font-mono">
                {pointsLoading ? "..." : activeBalance}
              </span>
              <span className="text-[#867461] text-xs font-bold uppercase pb-0.5 font-mono">pts</span>
            </div>
            
            <div className="bg-[#fff8e6] rounded-xl p-3.5 mb-3 border border-[#f59e0b]/20">
              <p className="text-[#855300] text-xs font-bold mb-1">
                Current Tier: <span className="underline">{(userProfile.total_completed_orders || 0) <= 3 ? "Welcome Multiplier (15%)" : (userProfile.total_completed_orders || 0) <= 5 ? "Transition Phase (10%)" : "Lifetime Elite (8%)"}</span>
              </p>
              <p className="text-[#867461] text-[11px] leading-relaxed font-semibold">
                {(userProfile.total_completed_orders || 0) <= 3 ? "You are earning an accelerated 15% back on your first 3 orders!" : (userProfile.total_completed_orders || 0) <= 5 ? "You are earning 10% back on your 4th and 5th orders!" : "You are earning a flat 8% back on every single order for life."}
              </p>
            </div>

            <div className="bg-[#fdf3f3] border-l-4 border-red-500 py-2.5 px-3.5 rounded-r-xl">
              <p className="text-red-700 text-[11px] font-bold flex items-center gap-1">
                ⚠️ Older coins expire exactly 45 days after you earn them. Use them before they disappear!
              </p>
            </div>
          </div>

          {/* Student Email Verification */}
          {!userProfile.student_email && (
            <div className="bg-white border border-[#e8e0d8] rounded-2xl p-5 shadow-sm">
              <h3 className="text-emerald-700 text-sm font-bold tracking-tight mb-2 flex items-center gap-1.5 font-serif italic">
                <Check size={18} className="stroke-[3]" /> Get Verified Student Badge
              </h3>
              <p className="text-[#867461] text-xs font-semibold mb-4 leading-relaxed">
                Verify your student email to unlock exclusive discounts and early access to drops.
              </p>
              
              {verifySuccess ? (
                <div className="bg-emerald-50 p-4 rounded-xl text-emerald-700 text-xs font-semibold text-center border border-emerald-200">
                  A verification link has been sent to <span className="font-bold underline">{verifyStudentEmail}</span>. Please check your inbox and click the link to verify your account.
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <input
                    type="email"
                    value={verifyStudentEmail}
                    onChange={e => setVerifyStudentEmail(e.target.value)}
                    placeholder="Student Email (.edu, .ac.in)"
                    className="bg-[#f5f4ec] border border-[#d8c3ad]/55 rounded-xl p-3 text-[#1b1c17] text-sm font-medium outline-none focus:border-[#855300] focus:ring-1 focus:ring-[#855300] transition-all placeholder:text-[#867461]/60"
                  />
                  <p className="-mt-1 text-[11px] font-medium text-[#867461]">We'll send a one-time verification link to your college email.</p>
                  <label className="text-[11px] font-semibold leading-relaxed text-[#534434]">
                    Re-enter your password to confirm your identity before we send a verification email.
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type={showVerifyPassword ? 'text' : 'password'}
                      value={verifyPassword}
                      onChange={e => setVerifyPassword(e.target.value)}
                      placeholder="Current Password"
                      className="bg-[#f5f4ec] border border-[#d8c3ad]/55 rounded-xl p-3 pr-10 text-[#1b1c17] text-sm font-medium outline-none focus:border-[#855300] focus:ring-1 focus:ring-[#855300] transition-all placeholder:text-[#867461]/60 w-full"
                    />
                    <button
                      type="button"
                      onClick={() => setShowVerifyPassword(!showVerifyPassword)}
                      className="absolute right-3 text-[#867461] hover:text-[#451a03] transition-colors"
                      tabIndex={-1}
                    >
                      {showVerifyPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  {verifyError && <p className="text-red-500 text-xs font-semibold">{verifyError}</p>}
                  <button
                    onClick={handleVerifyStudentEmail}
                    disabled={verifyingEmail}
                    className="bg-[#1b1c17] hover:bg-[#2a2b22] active:scale-95 text-[#fbf9f1] py-3.5 px-4 rounded-xl font-mono font-black text-xs transition-all shadow-md"
                  >
                    {verifyingEmail ? 'Sending...' : 'Send Verification Email'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Referral */}
          {(() => {
            const maxUnverifiedReferrals = 8;
            const referralsCount = userProfile.successful_referrals || 0;
            const isVerified = !!userProfile.student_email || !!userProfile.email_verified;
            const canRefer = isVerified || referralsCount < maxUnverifiedReferrals;
            const refCode = userProfile.referral_code || 'ILARA50';

            if (!canRefer) {
              return (
                <div className="mb-2">
                  <h3 className="text-[#1b1c17] text-sm font-bold mb-3 tracking-tight font-serif italic">Invite & Earn</h3>
                  <div className="bg-red-50 border border-red-100 rounded-2xl p-4 shadow-sm">
                    <p className="text-red-700 text-xs font-bold mb-1">You've reached Level 2!</p>
                    <p className="text-red-600/80 text-[11px] font-medium">Verify your student email above to unlock Level 3 (Grand Prize) and continue referring your friends.</p>
                  </div>
                </div>
              );
            }

            return (
              <div className="mb-2">
                <h3 className="text-[#1b1c17] text-sm font-bold mb-3 tracking-tight font-serif italic">Invite & Earn</h3>
                <div className="bg-white border border-dashed border-[#e8e0d8] rounded-2xl p-4 flex items-center justify-between shadow-sm">
                  <div>
                    <p className="text-[#867461] text-[10px] uppercase tracking-widest font-bold mb-1">Your Referral Code</p>
                    <p className="text-[#1b1c17] text-xl font-black font-mono tracking-[0.1em]">{refCode}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleCopyCode} className="w-10 h-10 rounded-xl bg-[#f5f4ec] text-[#1b1c17] hover:bg-[#e8e0d8] transition-colors flex items-center justify-center cursor-pointer border border-[#d8c3ad]/40">
                      {copied ? <Check size={18} className="stroke-[3] text-emerald-600" /> : <Copy size={18} />}
                    </button>
                    <button onClick={handleShare} className="w-10 h-10 rounded-xl bg-[#1b1c17] text-white hover:bg-[#2a2b22] transition-colors flex items-center justify-center cursor-pointer">
                      <Share2 size={18} />
                    </button>
                  </div>
                </div>
                <p className="text-[#867461] text-xs font-semibold mt-2">Earn 50 pts when a friend signs up with your code.</p>
              </div>
            );
          })()}

          {/* Saved Coordinates */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-[#1b1c17] text-sm font-bold tracking-tight font-serif italic">Saved Coordinates</h3>
              <button onClick={() => setShowAddAddress(!showAddAddress)} className="bg-[#f5f4ec] border border-[#d8c3ad]/55 rounded-lg py-1 px-3 text-[#1b1c17] text-xs font-bold cursor-pointer hover:bg-[#e8e0d8] transition-all">
                {showAddAddress ? 'Cancel' : '+ Add'}
              </button>
            </div>

            <AnimatePresence>
              {showAddAddress && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden', marginBottom: 16 }}>
                  <div className="bg-white border border-[#e8e0d8] rounded-2xl p-4 shadow-sm">
                    <div className="flex flex-wrap gap-2 mb-3">
                      {(['Home', 'Hostel', 'Library', 'Classroom', 'Other'] as const).map(lbl => (
                        <button 
                          key={lbl} 
                          onClick={() => setNewAddrLabel(lbl)} 
                          className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition-colors cursor-pointer ${
                            newAddrLabel === lbl 
                              ? 'border-[#1b1c17] bg-[#1b1c17] text-white' 
                              : 'border-[#e8e0d8] bg-transparent text-[#867461] hover:bg-[#fbf9f1]'
                          }`}
                        >
                          {lbl}
                        </button>
                      ))}
                    </div>
                    {newAddrLabel === 'Other' && (
                      <input 
                        type="text" 
                        placeholder="Custom Label (e.g., GF's Hostel)" 
                        value={newCustomLabel} 
                        onChange={e => setNewCustomLabel(e.target.value)} 
                        className="w-full bg-white border border-[#e8e0d8] p-2.5 rounded-xl text-[#1b1c17] text-sm mb-3 outline-none focus:border-[#855300] transition-colors placeholder:text-[#867461]/60" 
                      />
                    )}
                    
                    {errorMsg && <p className="text-red-500 text-xs font-semibold mb-3">{errorMsg}</p>}
                    <button 
                      onClick={handleAutoFetchLocation} 
                      disabled={gpsLoading} 
                      className={`w-full flex items-center justify-center gap-2 border p-3 rounded-xl font-bold text-sm mb-4 cursor-pointer transition-all ${
                        showGpsSuccess 
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-600' 
                          : 'bg-[#fff8e6] border-[#f59e0b]/30 text-[#855300] hover:bg-[#ffeed1]'
                      }`}
                    >
                      <MapPin size={16} />
                      {gpsLoading ? 'Fetching GPS Coordinates...' : showGpsSuccess ? 'Location Detected!' : 'Auto Fetch Location (GPS)'}
                    </button>

                    {coordinates && (
                      <div className="mb-4">
                        <p className="text-[#867461] text-[11px] mb-2 text-center font-semibold">Drag the map or search to adjust your exact location</p>
                        <LocationPickerMap 
                          lat={coordinates.lat} 
                          lng={coordinates.lng} 
                          onChange={(lat, lng, address) => {
                            setCoordinates({ lat, lng });
                            if (address) {
                              const parts = address.split(',').map(s => s.trim());
                              if (parts.length >= 2) {
                                setNewArea(`${parts[0]}, ${parts[1]}`);
                              } else {
                                setNewArea(address);
                              }
                            }
                          }} 
                        />
                      </div>
                    )}

                    <div className="flex gap-2 mb-3">
                      <input type="text" placeholder="Flat / Room No." value={newFlatNo} onChange={e => setNewFlatNo(e.target.value)} className="flex-1 bg-white border border-[#e8e0d8] p-2.5 rounded-xl text-[#1b1c17] text-sm outline-none focus:border-[#855300] transition-colors placeholder:text-[#867461]/60" />
                      <input type="text" placeholder="Floor (Optional)" value={newFloor} onChange={e => setNewFloor(e.target.value)} className="flex-1 bg-white border border-[#e8e0d8] p-2.5 rounded-xl text-[#1b1c17] text-sm outline-none focus:border-[#855300] transition-colors placeholder:text-[#867461]/60" />
                    </div>
                    <input type="text" placeholder="Area / Building / Campus" value={newArea} onChange={e => setNewArea(e.target.value)} className="w-full bg-white border border-[#e8e0d8] p-2.5 rounded-xl text-[#1b1c17] text-sm mb-3 outline-none focus:border-[#855300] transition-colors placeholder:text-[#867461]/60" />
                    <input type="text" placeholder="Landmark (Optional)" value={newLandmark} onChange={e => setNewLandmark(e.target.value)} className="w-full bg-white border border-[#e8e0d8] p-2.5 rounded-xl text-[#1b1c17] text-sm mb-4 outline-none focus:border-[#855300] transition-colors placeholder:text-[#867461]/60" />
                    <button onClick={handleSaveNewAddress} className="w-full bg-[#1b1c17] hover:bg-[#2a2b22] text-white border-none p-3.5 rounded-xl font-mono font-black text-xs uppercase tracking-widest transition-colors shadow-md">Save Address</button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            {!userProfile.addresses || userProfile.addresses.length === 0 ? (
              <div className="bg-white border border-dashed border-[#e8e0d8] rounded-2xl p-5 text-center">
                <MapPin size={24} className="text-[#867461]/30 mx-auto mb-2" />
                <p className="text-[#867461] text-xs font-semibold">No saved addresses yet. Save your coordinate during checkout!</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {userProfile.addresses.map((addr) => {
                  let IconComponent = MapPin;
                  if (addr.label === 'Home') IconComponent = Home;
                  else if (addr.label === 'Hostel') IconComponent = Building;
                  else if (addr.label === 'Library') IconComponent = BookOpen;
                  else if (addr.label === 'Classroom') IconComponent = GraduationCap;

                  return (
                    <div key={addr.id} className="bg-white border border-[#e8e0d8] rounded-xl p-3.5 flex items-center gap-3 justify-between shadow-sm hover:border-[#d8c3ad] transition-all">
                      <div className="flex items-center gap-3 flex-1">
                        <div className="bg-[#fff8e6] border border-[#f59e0b]/20 rounded-xl p-2 text-[#855300] flex items-center justify-center">
                          <IconComponent size={16} />
                        </div>
                        <div className="flex-1">
                          <p className="text-[#1b1c17] text-xs font-bold uppercase tracking-widest">{addr.label}</p>
                          <p className="text-[#867461] text-[11px] mt-0.5 leading-snug font-semibold">{addr.fullAddress}</p>
                        </div>
                      </div>
                      
                      <button 
                        onClick={async () => {
                          if (!userProfile?.addresses) return;
                          const filtered = userProfile.addresses.filter(a => a.id !== addr.id);
                          try {
                            await updateUserAddresses(filtered);
                            setUserProfile({ ...userProfile, addresses: filtered });
                          } catch (err) {
                            console.error("Failed to delete saved address from profile: ", err);
                          }
                        }}
                        className="bg-transparent border-none text-[#867461]/50 p-2 cursor-pointer flex items-center justify-center hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="w-full bg-[#fff5f5] border border-red-200/60 text-red-600 p-4 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 mt-3 cursor-pointer hover:bg-red-50 hover:border-red-300 transition-all shadow-sm active:scale-[0.98]"
          >
            <LogOut size={18} /> Logout
          </button>

        </div>

        {/* RIGHT COLUMN: Active and Past Orders */}
        <div className="lg:col-span-6 space-y-6">
          
          {/* Active order tracking module */}
          {filteredActiveOrders.length > 0 && (
            <div className="bg-white rounded-3xl border border-[#e8e0d8] p-5 shadow-[0_8px_30px_rgba(83,68,52,0.06)] relative overflow-hidden">
              <div className="relative z-10 flex items-center justify-between gap-4">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[#855300] flex items-center gap-1.5 mb-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b] animate-pulse" /> Live Order Tracker
                  </span>
                  <h3 className="text-[#1b1c17] text-lg font-bold font-serif italic mt-0.5">
                    {filteredActiveOrders.length === 1 
                      ? `Order #${filteredActiveOrders[0].order_type === 'delivery' ? filteredActiveOrders[0].order_id : filteredActiveOrders[0].token_number}`
                      : `${filteredActiveOrders.length} Active Orders`}
                  </h3>
                  <p className="text-[#867461] text-xs mt-1 font-semibold">
                    {filteredActiveOrders.length === 1
                      ? `Status: ${filteredActiveOrders[0].status === 'ready' ? 'Ready for pickup' : filteredActiveOrders[0].status === 'preparing' ? 'Preparing in kitchen' : 'Confirmed'}`
                      : 'Tap to manage and track all'}
                  </p>
                </div>
                <button 
                  onClick={() => {
                    const { setIsTrackerOpen, setSelectedTrackerOrderId } = useStore.getState();
                    if (filteredActiveOrders.length === 1) {
                      setSelectedTrackerOrderId(filteredActiveOrders[0].order_id);
                    } else {
                      setSelectedTrackerOrderId(null);
                    }
                    setIsTrackerOpen(true);
                  }}
                  className="bg-[#9A642C] hover:bg-[#805020] active:scale-95 text-white font-black text-xs uppercase tracking-widest px-4 py-2.5 rounded-xl transition-all shadow-sm shrink-0 font-mono"
                >
                  Track
                </button>
              </div>
            </div>
          )}

          {/* Active Orders List */}
          {filteredActiveOrders.length > 0 && (
            <div>
              <h3 className="text-[#1b1c17] text-sm font-bold tracking-tight mb-3 font-serif italic">Active Orders</h3>
              <div className="flex flex-col gap-3">
                {filteredActiveOrders.map(order => (
                  <div key={order.order_id} className="bg-white border border-[#e8e0d8] rounded-2xl p-4 shadow-sm relative overflow-hidden">
                    <div className="flex justify-between items-center mb-3">
                      <div>
                        <p className="text-[#867461] text-[10px] uppercase tracking-widest font-bold">
                          {order.order_type === 'delivery' ? 'Order ID' : 'Order Token'}
                        </p>
                        <p className="text-[#1b1c17] font-black tracking-tight text-lg font-mono">
                          #{order.order_type === 'delivery' ? order.order_id : order.token_number}
                        </p>
                      </div>
                      <div className="bg-[#fff8e6] text-[#855300] px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border border-[#f59e0b]/20">
                        {order.status}
                      </div>
                    </div>
                    <p className="text-[#867461] text-xs font-semibold">{order.items.length} items • ₹{order.gross_amount}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Order History / Past Orders */}
          {filteredPastOrders.length > 0 && (
            <div ref={ordersRef} className="scroll-mt-6">
              <h3 className="text-[#1b1c17] text-sm font-bold tracking-tight mb-3 font-serif italic">Past Orders</h3>
              <div className="flex flex-col gap-2.5 max-h-[600px] overflow-y-auto pr-1 category-scroll-container">
                {filteredPastOrders.map(order => {
                  const isExpanded = expandedOrder === order.order_id;
                  const date = new Date(order.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                  
                  return (
                    <div key={order.order_id} className="bg-white border border-[#e8e0d8] rounded-2xl overflow-hidden shadow-sm transition-all hover:border-[#d8c3ad]">
                      <div 
                        onClick={() => setExpandedOrder(isExpanded ? null : order.order_id)}
                        className="p-4 flex justify-between items-center cursor-pointer hover:bg-[#fbf9f1]/30 transition-colors"
                      >
                        <div>
                          <p className="text-[#1b1c17] text-sm font-bold font-mono">{date} • ₹{order.gross_amount}</p>
                          <p className="text-[#867461] text-xs font-semibold mt-1">{order.items.length} items • <span className="capitalize font-bold text-[#855300]">{order.order_type}</span></p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-bold uppercase tracking-wider text-[#867461]">{order.status}</span>
                          {isExpanded ? <ChevronUp size={16} className="text-[#867461]" /> : <ChevronDown size={16} className="text-[#867461]" />}
                        </div>
                      </div>
                      
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                          >
                            <div className="px-4 pb-4 border-t border-[#e8e0d8]/50">
                              <ul className="list-none p-0 m-0 mt-3 flex flex-col gap-2">
                                {order.items.map((item, i) => (
                                  <li key={i} className="flex justify-between text-xs font-semibold">
                                    <span className="text-[#1b1c17]">{item.quantity}x {item.name}</span>
                                    <span className="text-[#867461] font-mono">₹{item.unit_price * item.quantity}</span>
                                  </li>
                                ))}
                              </ul>

                              {/* Feedback CTA */}
                              {isCompletedOrderStatus(order.status) && (
                                <div className="mt-4">
                                  {order.feedback ? (
                                    <div className="flex items-center gap-1.5 p-2 bg-[#f5f4ec] rounded-xl border border-[#d8c3ad]/40">
                                      {[1,2,3,4,5].map(s => (
                                        <Star key={s} size={14}
                                          fill={s <= order.feedback!.rating ? '#f59e0b' : 'transparent'}
                                          color={s <= order.feedback!.rating ? '#f59e0b' : '#e8e0d8'}
                                          strokeWidth={1.5}
                                        />
                                      ))}
                                      <span className="text-[#867461] text-[10px] font-black uppercase tracking-widest ml-1">Reviewed</span>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={e => { e.stopPropagation(); setFeedbackOrder(order); }}
                                      className="w-full py-2.5 rounded-xl border border-[#e8e0d8] bg-[#fbf9f1] text-[#1b1c17] text-xs font-bold cursor-pointer flex items-center justify-center gap-1.5 hover:bg-[#f5f4ec] transition-colors"
                                    >
                                      <Star size={14} />
                                      Rate this order
                                    </button>
                                  )}
                                </div>
                              )}

                              {/* Refund / Report Issue CTA */}
                              {isRefundEligibleOrder(order) && (
                                <div className="mt-3">
                                  {(() => {
                                    const statusInfo = getRefundDisplayInfo(order.order_id);
                                    if (statusInfo) {
                                      return (
                                        <div className={`flex items-center justify-center p-2.5 rounded-xl border text-xs font-bold ${statusInfo.bg}`}>
                                          {statusInfo.text}
                                        </div>
                                      );
                                    }
                                    return (
                                      <button
                                        onClick={e => { e.stopPropagation(); setRefundOrder(order); setRefundItems(order.items.map(item => ({ item_id: item.menu_item_id, quantity: item.quantity }))); }}
                                        className="w-full py-2.5 rounded-xl border border-red-200 bg-red-50/50 hover:bg-red-50 text-red-600 text-xs font-bold cursor-pointer flex items-center justify-center gap-1.5 transition-colors"
                                      >
                                        Report an issue / Refund
                                      </button>
                                    );
                                  })()}
                                </div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>

      </div>
      {mounted && typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {showPointsHistory && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex flex-col justify-end"
              onClick={() => setShowPointsHistory(false)}
            >
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="bg-white border-t border-[#e8e0d8] rounded-t-3xl p-6 max-h-[80vh] overflow-y-auto"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold text-[#1b1c17] font-serif italic">Points Ledger</h2>
                  <button onClick={() => setShowPointsHistory(false)} className="text-[#867461] bg-transparent border-none text-2xl cursor-pointer hover:text-[#1b1c17] transition-colors">&times;</button>
                </div>

                <div className="flex flex-col gap-3">
                  {ledgerHistory.length === 0 ? (
                    <p className="text-[#867461] text-center py-5 text-sm font-semibold">No transaction history found.</p>
                  ) : (
                    ledgerHistory.map((tx, idx) => (
                      <div key={tx.id} className="flex justify-between items-center p-4 bg-white rounded-2xl border border-[#e8e0d8] shadow-sm">
                        <div className="flex flex-col gap-1">
                          <span className="text-[#1b1c17] text-sm font-bold capitalize">{tx.source.replace('_', ' ')}</span>
                          <span className="text-[#867461] text-[11px] font-mono font-medium">
                            {new Date(tx.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className={`font-black text-lg font-mono ${tx.amount > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {tx.amount > 0 ? '+' : ''}{tx.amount}
                          </span>
                          <span className="text-[#867461] text-[10px] uppercase font-bold tracking-wider font-mono">pts</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* Feedback Modal */}
      {mounted && typeof document !== 'undefined' && createPortal(
        <FeedbackModal
          order={feedbackOrder}
          onClose={() => setFeedbackOrder(null)}
          onSubmitted={(orderId, rating, comment) => {
            setOrders(prev =>
              prev.map(o =>
                o.order_id === orderId
                  ? { ...o, feedback: { rating, comment, submitted_at: Date.now() } }
                  : o
              )
            );
          }}
        />,
        document.body
      )}

      {/* Refund / Issue Modal */}
      {mounted && typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {refundOrder && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex flex-col justify-end"
              onClick={() => setRefundOrder(null)}
            >
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="bg-white border-t border-[#e8e0d8] rounded-t-3xl p-6 max-h-[90vh] overflow-y-auto"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold text-[#1b1c17] font-serif italic">Report Issue</h2>
                  <button onClick={() => setRefundOrder(null)} className="text-[#867461] bg-transparent border-none text-2xl cursor-pointer hover:text-[#1b1c17] transition-colors">&times;</button>
                </div>

                <div className="flex flex-col gap-4">
                  <div className="relative z-[120]">
                    <label className="text-sm font-bold text-[#1b1c17] mb-2 block font-serif">Reason for Issue</label>
                    <CustomSelect 
                      value={refundReason}
                      onChange={setRefundReason}
                      options={[
                        { value: 'wrong_item', label: 'Wrong Item' },
                        { value: 'missing_item', label: 'Missing Item' },
                        { value: 'bad_quality', label: 'Bad Quality / Spoiled' },
                        { value: 'late_order', label: 'Late Order' },
                        { value: 'cancelled_order', label: 'Order Cancelled' },
                        { value: 'payment_issue', label: 'Payment Issue' },
                        { value: 'other', label: 'Other' },
                      ]}
                    />
                  </div>

                  <div className="relative z-[110]">
                    <label className="text-sm font-bold text-[#1b1c17] mb-2 block mt-1 font-serif">Request Scope</label>
                    <CustomSelect 
                      value={refundScope}
                      onChange={(val) => {
                        setRefundScope(val);
                        if (val === 'items') {
                          setRefundItems(refundOrder.items.map(i => ({ item_id: i.item_id, quantity: i.quantity })));
                        }
                      }}
                      options={[
                        { value: 'full_order', label: 'Full Order (Entire order is affected)' },
                        { value: 'items', label: 'Specific Items Only' },
                      ]}
                    />
                  </div>

                  {refundScope === 'items' && (
                    <div className="bg-[#f5f4ec] border border-[#d8c3ad]/55 p-3 rounded-xl">
                      <p className="text-xs font-bold text-[#867461] mb-3 uppercase tracking-wider font-mono">Select Items & Quantities</p>
                      <div className="flex flex-col gap-3">
                        {refundOrder.items.map(item => {
                          const sel = refundItems.find(r => r.item_id === item.item_id);
                          const isSelected = !!sel && sel.quantity > 0;
                          return (
                            <div key={item.item_id} className="flex items-center gap-3">
                              <input 
                                type="checkbox" 
                                checked={isSelected}
                                onChange={(e) => {
                                    if (e.target.checked) {
                                      setRefundItems([...refundItems, { item_id: item.item_id, quantity: item.quantity }]);
                                    } else {
                                      setRefundItems(refundItems.filter(r => r.item_id !== item.item_id));
                                    }
                                }}
                                className="accent-[#855300]"
                              />
                              <div className="flex-1 text-sm font-bold text-[#1b1c17]">{item.name}</div>
                              {isSelected && (
                                <input 
                                  type="number" 
                                  min={1} 
                                  max={item.quantity}
                                  value={sel?.quantity || 1}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value) || 1;
                                    setRefundItems(refundItems.map(r => r.item_id === item.item_id ? { ...r, quantity: val } : r));
                                  }}
                                  className="w-16 bg-white border border-[#e8e0d8] p-1.5 rounded text-center text-sm font-bold text-[#1b1c17]"
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="text-sm font-bold text-[#1b1c17] mb-1 block font-serif">Additional Details</label>
                    <textarea 
                      placeholder="Please explain the issue briefly..."
                      value={refundNote}
                      onChange={e => setRefundNote(e.target.value)}
                      className="w-full bg-[#f5f4ec] border border-[#d8c3ad]/55 p-3 rounded-xl text-[#1b1c17] outline-none text-sm font-semibold min-h-[100px] focus:border-[#855300]"
                    />
                  </div>

                  <button
                    onClick={handleRefundSubmit}
                    disabled={refundSubmitting || refundNote.length < 5}
                    className="w-full bg-[#1b1c17] hover:bg-[#2a2b22] text-white p-4 rounded-xl font-mono font-black text-xs uppercase tracking-widest disabled:opacity-50 transition-colors shadow-md mt-2"
                  >
                    {refundSubmitting ? 'Submitting...' : 'Submit Request'}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
