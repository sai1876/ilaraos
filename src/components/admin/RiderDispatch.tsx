'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db, auth } from '@/lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { OrderDocument, Staff } from '@/lib/types';
import { Package, Truck, CheckSquare, Square, Lock, AlertTriangle, User, Search, RefreshCw, X, QrCode, CheckCircle, Eye, EyeOff } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

interface RiderDispatchProps {
  outletId?: string;
  userRole?: string;
}

export default function RiderDispatch({ outletId, userRole }: RiderDispatchProps) {
  const [orders, setOrders] = useState<OrderDocument[]>([]);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [riders, setRiders] = useState<Staff[]>([]);
  const [selectedRiderId, setSelectedRiderId] = useState<string>('');
  
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Security Flow State
  const [dispatchMode, setDispatchMode] = useState<'idle' | 'face_scan' | 'passcode'>('idle');
  const [scanAttempts, setScanAttempts] = useState(0);
  const [scanSessionId, setScanSessionId] = useState<string | null>(null);
  const [passcode, setPasscode] = useState('');
  const [showPasscode, setShowPasscode] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Listen for mobile scanner sync via secure polling
  useEffect(() => {
    let timer: NodeJS.Timeout;
    let active = true;

    const checkStatus = async () => {
      if (dispatchMode === 'face_scan' && scanSessionId && !dispatching) {
        try {
          const res = await fetch(`/api/operations/biometrics/session?session_id=${scanSessionId}`);
          if (res.status === 410 || res.status === 404) return;
          if (res.ok) {
            const data = await res.json();
            if (data.status === 'success') { await executeDispatch(); return; }
            else if (data.status === 'failed') { simulateScanFailure(); return; }
          }
        } catch (err) { console.error(err); }
        if (active) timer = setTimeout(checkStatus, 2000);
      }
    };

    if (dispatchMode === 'face_scan' && scanSessionId) checkStatus();
    return () => { active = false; clearTimeout(timer); };
  }, [dispatchMode, scanSessionId, dispatching]);

  // Fetch ready delivery orders
  useEffect(() => {
    const isGlobal = userRole === 'admin' || userRole === 'owner';
    let q;
    if (!isGlobal && outletId) {
      q = query(
        collection(db, 'orders'),
        where('outlet_id', '==', outletId),
        where('status', '==', 'ready'),
        where('order_type', '==', 'delivery')
      );
    } else {
      q = query(
        collection(db, 'orders'),
        where('status', '==', 'ready'),
        where('order_type', '==', 'delivery')
      );
    }
    const unsubscribe = onSnapshot(q, (snap) => {
      const fetched: OrderDocument[] = [];
      snap.forEach(doc => fetched.push(doc.data() as OrderDocument));
      fetched.sort((a, b) => b.created_at - a.created_at);
      setOrders(fetched);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [outletId, userRole]);

  // Fetch active riders
  useEffect(() => {
    const isGlobal = userRole === 'admin' || userRole === 'owner';
    let q;
    if (!isGlobal && outletId) {
      q = query(
        collection(db, 'staff_directory'),
        where('outlet_id', '==', outletId),
        where('role', '==', 'rider'),
        where('status', '==', 'active')
      );
    } else {
      q = query(
        collection(db, 'staff_directory'),
        where('role', '==', 'rider'),
        where('status', '==', 'active')
      );
    }
    const unsubscribe = onSnapshot(q, (snap) => {
      const fetched: Staff[] = [];
      snap.forEach(doc => fetched.push({ id: doc.id, ...doc.data() } as Staff));
      setRiders(fetched);
      if (fetched.length > 0) setSelectedRiderId(fetched[0].id);
    });
    return () => unsubscribe();
  }, [outletId, userRole]);

  const toggleOrderSelection = (orderId: string) => {
    const next = new Set(selectedOrderIds);
    if (next.has(orderId)) next.delete(orderId); else next.add(orderId);
    setSelectedOrderIds(next);
  };

  const selectAll = () => {
    if (selectedOrderIds.size === filteredOrders.length) setSelectedOrderIds(new Set());
    else setSelectedOrderIds(new Set(filteredOrders.map(o => o.order_id)));
  };

  const handleStartDispatch = async () => {
    if (selectedOrderIds.size === 0) { setErrorMsg("Select at least one order."); return; }
    if (!selectedRiderId) { setErrorMsg("Select a delivery partner."); return; }
    setErrorMsg(''); setScanAttempts(0); setPasscode('');
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/operations/biometrics/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
        body: JSON.stringify({ type: 'verify', rider_id: selectedRiderId })
      });
      if (!res.ok) throw new Error('Failed to create scan session');
      const data = await res.json();
      setScanSessionId(data.session_id);
      setDispatchMode('face_scan');
    } catch (e) { console.error(e); setErrorMsg("Failed to start scan session."); }
  };

  const executeDispatch = async (passcodeValue?: string) => {
    setDispatching(true); setErrorMsg('');
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error("Authentication required");
      const res = await fetch('/api/operations/delivery/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
        body: JSON.stringify({
          order_ids: Array.from(selectedOrderIds),
          rider_id: selectedRiderId,
          ...(passcodeValue ? { passcode: passcodeValue } : { session_id: scanSessionId })
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to dispatch orders');
      setDispatchMode('idle');
      setSelectedOrderIds(new Set());
      const rider = riders.find(r => r.id === selectedRiderId);
      setSuccessMessage(`Successfully dispatched ${selectedOrderIds.size} orders to ${rider?.name || 'Rider'}!`);
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setErrorMsg("Dispatch failed: " + err.message);
    } finally { setDispatching(false); }
  };

  const simulateScanFailure = () => {
    const next = scanAttempts + 1;
    setScanAttempts(next);
    if (next >= 5) setDispatchMode('passcode');
  };

  const handlePasscodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passcode) { setErrorMsg("Passcode cannot be empty"); return; }
    await executeDispatch(passcode);
  };

  const filteredOrders = orders.filter(o =>
    o.token_number.includes(searchTerm) || o.user_id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Dynamic scanner URL â€” no hardcoded IPs
  const scannerUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/scanner?session_id=${scanSessionId}`
    : `/scanner?session_id=${scanSessionId}`;

  return (
    <div className="w-full flex flex-col gap-6 font-sans text-[#1b1c17]">
      {/* Header */}
      <div className="bg-card border border-border shadow-[0_4px_20px_rgba(62,39,35,0.06)] rounded-3xl p-6 flex justify-between items-center relative overflow-hidden">
        <div className="absolute top-[-30%] right-[-10%] w-48 h-48 bg-blue-500/5 rounded-full filter blur-xl pointer-events-none" />
        <div>
          <h2 className="font-serif italic text-2xl text-foreground flex items-center gap-2">
            <Truck size={22} className="text-blue-500" />
            Hatch Dispatch Console
          </h2>
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground/60 mt-0.5">
            Bundle ready orders and assign logistics partners securely
          </p>
        </div>
      </div>

      {/* Success Banner */}
      <AnimatePresence>
        {successMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -20, height: 0 }}
            className="w-full bg-emerald-50 border border-emerald-200 p-4 rounded-2xl flex items-center gap-4 text-emerald-700 overflow-hidden"
          >
            <CheckCircle size={20} className="shrink-0" />
            <div>
              <p className="font-mono uppercase tracking-widest text-sm font-bold">Handoff Complete</p>
              <p className="text-xs opacity-80 font-mono mt-1">{successMessage}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Order Queue */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <div className="bg-card border border-border shadow-[0_4px_20px_rgba(62,39,35,0.06)] rounded-3xl p-6 flex flex-col gap-4 h-full">
            <div className="flex justify-between items-center border-b border-border/40 pb-3">
              <div className="flex items-center gap-2">
                <Package size={16} className="text-emerald-600" />
                <h3 className="font-serif italic text-lg text-foreground">Ready for Dispatch</h3>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/40" size={14} />
                <input
                  type="text"
                  placeholder="Search Tokens..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-[#f5f4ec] border border-border rounded-xl pl-9 pr-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-amber-400/50 transition-colors"
                />
              </div>
            </div>

            {/* Bulk Selection */}
            <div className="flex items-center justify-between bg-[#f5f4ec] border border-border/60 p-3 rounded-xl">
              <button onClick={selectAll} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
                {selectedOrderIds.size > 0 && selectedOrderIds.size === filteredOrders.length
                  ? <CheckSquare size={16} className="text-[#855300]" />
                  : <Square size={16} />}
                <span className="font-mono text-[10px] uppercase tracking-wider font-bold">Select All</span>
              </button>
              <span className="font-mono text-[10px] uppercase tracking-wider text-[#855300] bg-[#ffddb8]/60 px-2 py-0.5 rounded border border-amber-200/50">
                {selectedOrderIds.size} Selected
              </span>
            </div>

            <div className="flex flex-col gap-3 overflow-y-auto max-h-[60vh] pr-2">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground/40 gap-2">
                  <RefreshCw className="animate-spin" size={20} />
                  <span className="font-mono text-[10px] uppercase tracking-widest">Scanning Queue...</span>
                </div>
              ) : filteredOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground/40 gap-2 text-center border border-dashed border-border rounded-xl">
                  <CheckSquare size={24} />
                  <span className="font-mono text-[10px] uppercase tracking-widest leading-relaxed">No delivery orders waiting.<br />The hatch is clear.</span>
                </div>
              ) : (
                filteredOrders.map(order => {
                  const isSelected = selectedOrderIds.has(order.order_id);
                  return (
                    <div
                      key={order.order_id}
                      onClick={() => toggleOrderSelection(order.order_id)}
                      className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[#ffddb8]/30 border-amber-300 shadow-[0_0_15px_rgba(133,83,0,0.06)]'
                          : 'bg-white border-border hover:border-amber-300/50'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        {isSelected
                          ? <CheckSquare size={20} className="text-[#855300]" />
                          : <Square size={20} className="text-muted-foreground/40" />}
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-mono font-bold text-lg text-foreground">#{order.token_number}</h4>
                            <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded text-[9px] font-mono uppercase tracking-widest font-bold">Ready</span>
                          </div>
                          <p className="text-[10px] font-mono text-muted-foreground/60 mt-1 uppercase tracking-wider">{order.items.length} Items &bull; â‚¹{order.gross_amount}</p>
                        </div>
                      </div>
                      <div className="mt-2 sm:mt-0 text-left sm:text-right">
                        <p className="text-[10px] font-mono text-foreground max-w-[150px] truncate">
                          {typeof order.delivery_address === 'string' ? order.delivery_address : 'Campus Location'}
                        </p>
                        <p className="text-[9px] font-mono text-muted-foreground/40 uppercase tracking-widest mt-0.5">{new Date(order.created_at).toLocaleTimeString()}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right: Rider Assignment */}
        <div className="flex flex-col gap-6">
          <div className="bg-card border border-border shadow-[0_4px_20px_rgba(62,39,35,0.06)] rounded-3xl p-6 flex flex-col gap-5 relative overflow-hidden">
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-blue-500/5 rounded-full filter blur-2xl pointer-events-none" />
            <div className="flex items-center justify-between border-b border-border/40 pb-2">
              <h3 className="font-serif italic text-lg text-foreground">Delivery Partner</h3>
              <User size={14} className="text-blue-500" />
            </div>
            <div className="flex flex-col gap-2">
              <label className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/70">Assign To (Available Riders)</label>
              <select
                value={selectedRiderId}
                onChange={e => setSelectedRiderId(e.target.value)}
                className="bg-[#f5f4ec] border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:border-amber-400/50 transition-colors appearance-none font-mono"
              >
                {riders.length === 0
                  ? <option value="">No Riders Available</option>
                  : riders.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.name} (ID: {r.employee_id || r.id.substring(0, 4)}) {r.status === 'offline' ? '[OFFLINE]' : ''}
                    </option>
                  ))
                }
              </select>
            </div>
            {errorMsg && dispatchMode === 'idle' && (
              <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-[10px] font-mono flex items-start gap-2">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                {errorMsg}
              </div>
            )}
            <button
              onClick={handleStartDispatch}
              disabled={selectedOrderIds.size === 0 || riders.length === 0}
              className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-border disabled:text-muted-foreground/40 text-white rounded-xl py-3.5 font-mono font-bold text-xs uppercase tracking-widest transition-all mt-4 flex justify-center items-center gap-2 shadow-sm disabled:shadow-none"
            >
              <Truck size={14} />
              Handover {selectedOrderIds.size > 0 ? selectedOrderIds.size : ''} Orders
            </button>
          </div>
        </div>
      </div>

      {/* Security Verification Modal */}
      <AnimatePresence>
        {dispatchMode !== 'idle' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1b1c17]/40 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-card border border-border rounded-3xl p-6 md:p-8 max-w-md w-full relative overflow-hidden shadow-[0_20px_60px_rgba(62,39,35,0.15)]"
            >
              <div className={`absolute top-0 right-0 w-full h-full rounded-full filter blur-[100px] pointer-events-none opacity-10 ${dispatchMode === 'face_scan' ? 'bg-blue-400' : 'bg-amber-400'}`} />
              <button
                onClick={() => setDispatchMode('idle')}
                className="absolute top-6 right-6 text-muted-foreground/60 hover:text-foreground transition-colors z-10"
              >
                <X size={20} />
              </button>

              <div className="relative z-10 flex flex-col items-center text-center gap-4">
                {dispatchMode === 'face_scan' ? (
                  <>
                    <div className="bg-white p-4 rounded-3xl mx-auto shadow-[0_4px_20px_rgba(62,39,35,0.08)]">
                      <QRCodeSVG value={scannerUrl} size={220} level="H" includeMargin={false} fgColor="#1b1c17" />
                    </div>
                    <div className="mt-4">
                      <h3 className="text-xl font-serif italic text-foreground font-bold flex justify-center items-center gap-2">
                        <QrCode size={20} className="text-blue-500" />
                        Mobile Handoff
                      </h3>
                      <p className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-widest mt-2 px-4 leading-relaxed">
                        Scan with your phone to perform camera verification.
                      </p>
                      <div className="mt-4 bg-blue-50 border border-blue-200 py-2 rounded-xl">
                        <a href={scannerUrl} target="_blank" rel="noreferrer"
                          className="text-blue-600 font-mono text-[9px] uppercase tracking-widest hover:underline flex justify-center items-center gap-1">
                          Open on this PC (Testing)
                        </a>
                      </div>
                    </div>
                    <div className="w-full flex gap-3 mt-4">
                      <button
                        onClick={() => executeDispatch()}
                        disabled={dispatching}
                        className="flex-1 bg-blue-500 hover:bg-blue-600 text-white py-3 rounded-xl font-mono font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2"
                      >
                        {dispatching ? <RefreshCw className="animate-spin" size={14} /> : 'Simulate Success'}
                      </button>
                      <button
                        onClick={simulateScanFailure}
                        className="flex-1 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 py-3 rounded-xl font-mono font-bold text-[10px] uppercase tracking-widest"
                      >
                        Fail ({scanAttempts}/5)
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-16 h-16 bg-[#ffddb8]/60 border border-amber-200 rounded-full flex items-center justify-center text-[#855300]">
                      <Lock size={28} />
                    </div>
                    <div>
                      <h3 className="text-xl font-serif italic text-foreground font-bold">Passcode Fallback</h3>
                      <p className="text-[10px] font-mono text-red-600 uppercase tracking-widest mt-2 px-4 leading-relaxed border border-red-200 bg-red-50 py-2 rounded-lg">
                        Scanner locked. Enter rider's secure passcode.
                      </p>
                    </div>
                    <form onSubmit={handlePasscodeSubmit} className="w-full mt-4 flex flex-col gap-4">
                      <div className="relative flex items-center">
                        <input
                          type={showPasscode ? 'text' : 'password'}
                          placeholder="4-Digit Passcode"
                          value={passcode}
                          onChange={e => setPasscode(e.target.value)}
                          className="w-full bg-[#f5f4ec] border border-border rounded-xl px-4 py-3 pr-12 text-center tracking-[1em] text-foreground focus:outline-none focus:border-amber-400/50 text-lg font-mono"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => setShowPasscode(!showPasscode)}
                          className="absolute right-4 text-[#867461] hover:text-[#451a03] transition-colors"
                          tabIndex={-1}
                        >
                          {showPasscode ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                      {errorMsg && <p className="text-[10px] font-mono text-red-600 uppercase tracking-widest text-center animate-pulse">{errorMsg}</p>}
                      <button
                        type="submit"
                        disabled={dispatching || passcode.length < 4}
                        className="w-full bg-[#855300] hover:bg-[#6b4400] disabled:bg-border disabled:text-muted-foreground/40 text-white py-3 rounded-xl font-mono font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2"
                      >
                        {dispatching ? <RefreshCw className="animate-spin" size={14} /> : 'Authorize Handover'}
                      </button>
                    </form>
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
