'use client';

import React, { useState, useEffect } from 'react';
import { auth } from '@/lib/firebase';
import { DailyClosingDocument } from '@/lib/types';
import { getBusinessDateContext } from '@/lib/businessDate';
import { Loader2, CheckCircle2, Lock, FileText, Send, XCircle, Camera, Upload } from 'lucide-react';
import { uploadFileViaIntent } from '@/lib/fileUpload';

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * ILARA CAFE - DAILY BUSINESS DATE CLOSING & CASH RECONCILIATION DOMAIN POLICIES
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * 1. BUSINESS DATE ALIGNMENT
 *    - Closings are generated and locked against a logical business date, NOT calendar date.
 *    - Store shifts operating past midnight are grouped under the correct active business date.
 * 
 * 2. CASH & UPI RECONCILIATION DIFFERENCES
 *    - Physical Counted Cash vs Expected Cash (derived from paid orders minus refunds).
 *    - Merchant App UPI vs Expected UPI (derived from digital transaction logs).
 *    - Managers must document notes and explanations for discrepancies.
 * 
 * 3. 4-EYE PRINCIPLE AUDIT LOCK
 *    - Draft -> Submitted (Manager) -> Approved & Locked (Owner).
 *    - Once Approved & Locked, transaction records are frozen and cannot be modified.
 * ══════════════════════════════════════════════════════════════════════════════
 */

interface DailyClosingManagementProps {
  outletId: string;
  userRole: 'manager' | 'admin' | 'owner';
}

export default function DailyClosingManagement({ outletId, userRole }: DailyClosingManagementProps) {
  const [closings, setClosings] = useState<DailyClosingDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'draft' | 'submitted' | 'locked' | 'rejected' | 'history'>('draft');
  const [generating, setGenerating] = useState(false);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [outletError, setOutletError] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const toast = {
    success: (msg: string) => { setToastMsg({ text: msg, type: 'success' }); setTimeout(() => setToastMsg(null), 3500); },
    error: (msg: string) => { setToastMsg({ text: msg, type: 'error' }); setTimeout(() => setToastMsg(null), 3500); },
  };

  // Form states for submission
  const [countedCash, setCountedCash] = useState<Record<string, number>>({});
  const [verifiedUpi, setVerifiedUpi] = useState<Record<string, number>>({});
  const [managerNotes, setManagerNotes] = useState<Record<string, string>>({});
  const [cashProofs, setCashProofs] = useState<Record<string, string[]>>({});
  const [paymentProofs, setPaymentProofs] = useState<Record<string, string[]>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  
  // Form states for review
  const [founderNotes, setFounderNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchClosings();
  }, [outletId, activeTab]);

  const fetchClosings = async () => {
    try {
      setLoading(true);
      setOutletError(null);
      const user = auth.currentUser;
      if (!user) return;
      const token = await user.getIdToken();
      
      // Build URL — omit outlet_id if empty so the API derives it from the manager's auth token
      const params = new URLSearchParams();
      if (outletId) params.set('outlet_id', outletId);
      if (activeTab !== 'history') params.set('status', activeTab);
      const url = `/api/daily-closing/list?${params.toString()}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        if (data.closings && data.closings.length > 0) {
          setClosings(data.closings);
        } else if (activeTab === 'draft') {
          // Dynamically generate today's draft from real orders
          const { business_date } = getBusinessDateContext();
          const genRes = await fetch('/api/daily-closing/generate', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}` 
            },
            body: JSON.stringify({ business_date, ...(outletId ? { outlet_id: outletId } : {}) })
          });
          const genData = await genRes.json();
          if (genData.success && genData.closing) {
            setClosings([genData.closing]);
          } else {
            setClosings([]);
          }
        } else {
          setClosings([]);
        }
      } else if (res.status === 403 && data.error?.includes('Outlet')) {
        setOutletError(data.error);
        setClosings([]);
      } else {
        toast.error(data.error || 'Failed to fetch closings');
      }
    } catch (err: any) {
      toast.error('Error fetching closings');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    try {
      setGenerating(true);
      const user = auth.currentUser;
      if (!user) return;
      const token = await user.getIdToken();

      const { business_date } = getBusinessDateContext();

      const body: Record<string, string> = { business_date };
      if (outletId) body.outlet_id = outletId; // omit if empty — server uses actor.outletId

      const res = await fetch('/api/daily-closing/generate', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify(body)
      });

      const data = await res.json();
      if (data.success) {
        toast.success('Generated successfully');
        fetchClosings();
      } else {
        toast.error(data.error || 'Generation failed');
      }
    } catch (err: any) {
      toast.error('Error generating closing');
    } finally {
      setGenerating(false);
    }
  };

  const handleProofUpload = async (closingId: string, e: React.ChangeEvent<HTMLInputElement>, type: 'cash' | 'payment') => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    setUploading(prev => ({ ...prev, [`${closingId}-${type}`]: true }));
    try {
      const document = await uploadFileViaIntent(file, {
        category: 'evidence',
        relatedEntityType: 'daily_closing',
        relatedEntityId: closingId,
        originalFilename: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        accessLevel: 'private'
      });
      
      let url = document.document_id;
      if (document.bucket && document.object_path) {
        url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${document.bucket}/${document.object_path}`;
      }

      if (type === 'cash') {
        setCashProofs(prev => ({ ...prev, [closingId]: [...(prev[closingId] || []), url] }));
      } else {
        setPaymentProofs(prev => ({ ...prev, [closingId]: [...(prev[closingId] || []), document.document_id] }));
      }
      toast.success('Proof uploaded successfully');
    } catch (err: any) {
      toast.error(err.message || 'Failed to upload proof');
    } finally {
      setUploading(prev => ({ ...prev, [`${closingId}-${type}`]: false }));
    }
  };

  const handleSubmit = async (closing: DailyClosingDocument) => {
    const cashRaw = countedCash[closing.closing_id];
    const upiRaw = verifiedUpi[closing.closing_id];
    const note = managerNotes[closing.closing_id] || '';
    const currentCashProofs = cashProofs[closing.closing_id] || [];
    const currentPaymentProofs = paymentProofs[closing.closing_id] || [];

    const cash = (cashRaw === undefined || isNaN(cashRaw)) ? 0 : cashRaw;
    const upi = (upiRaw === undefined || isNaN(upiRaw)) ? 0 : upiRaw;

    try {
      setSubmittingId(closing.closing_id);
      const user = auth.currentUser;
      if (!user) return;
      const token = await user.getIdToken();

      const res = await fetch('/api/daily-closing/submit', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({
          closing_id: closing.closing_id,
          counted_cash: Number(cash),
          verified_upi: Number(upi),
          manager_cash_note: note,
          manager_notes: note,
          ...(currentCashProofs.length > 0 ? { cash_proof_photo_urls: currentCashProofs } : {}),
          ...(currentPaymentProofs.length > 0 ? { payment_proof_refs: currentPaymentProofs } : {})
        })
      });

      const data = await res.json();
      if (data.success) {
        toast.success('Submitted for review');
        fetchClosings();
      } else {
        toast.error(data.error || 'Submission failed');
      }
    } catch (err: any) {
      toast.error('Error submitting closing');
    } finally {
      setSubmittingId(null);
    }
  };

  const handleReview = async (closing_id: string, decision: 'approved' | 'rejected') => {
    try {
      setSubmittingId(closing_id);
      const user = auth.currentUser;
      if (!user) return;
      const token = await user.getIdToken();
      const note = founderNotes[closing_id];

      const res = await fetch('/api/daily-closing/review', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({
          closing_id,
          decision,
          founder_review_note: note
        })
      });

      const data = await res.json();
      if (data.success) {
        toast.success(decision === 'approved' ? 'Closing Locked' : 'Closing Rejected');
        fetchClosings();
      } else {
        toast.error(data.error || 'Review failed');
      }
    } catch (err: any) {
      toast.error('Error reviewing closing');
    } finally {
      setSubmittingId(null);
    }
  };

  const renderDashboardCards = (closing: DailyClosingDocument) => {
    const safeNum = (val: any): number => {
      if (typeof val === 'number' && !isNaN(val)) return val;
      if (typeof val === 'string') {
        const parsed = parseFloat(val);
        if (!isNaN(parsed)) return parsed;
      }
      return 0;
    };

    const safeFormat = (val: any): string => safeNum(val).toFixed(2);

    const grossSales = (closing.sales_summary as any)?.gross_sales ?? (closing.sales_summary as any)?.total_gross_sales ?? ((closing.sales_summary as any)?.gross_sales_paise ? (closing.sales_summary as any).gross_sales_paise / 100 : 0);
    const netSales = (closing.sales_summary as any)?.net_sales ?? ((closing.sales_summary as any)?.net_sales_paise ? (closing.sales_summary as any).net_sales_paise / 100 : 0);
    const expectedCash = closing.cash_reconciliation?.expected_cash ?? 0;
    const expectedUpi = closing.payment_reconciliation?.expected_upi ?? 0;
    const cashDiff = closing.cash_reconciliation?.cash_difference ?? 0;
    const upiDiff = closing.payment_reconciliation?.upi_difference ?? 0;
    const refundsPaid = closing.refund_summary?.refund_amount_paid_today ?? 0;
    const wastageCount = closing.wastage_summary?.wastage_events_count ?? 0;
    
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 my-4 font-sans">
        <div className="p-4 bg-[#F3ECE3]/40 rounded-xl border border-[#E8DFD3]">
          <p className="text-xs font-bold uppercase tracking-wider text-[#66554A]">Gross Sales</p>
          <p className="text-xl font-bold font-mono text-[#241A15]">₹{safeFormat(grossSales)}</p>
        </div>
        <div className="p-4 bg-[#F3ECE3]/40 rounded-xl border border-[#E8DFD3]">
          <p className="text-xs font-bold uppercase tracking-wider text-[#66554A]">Net Sales</p>
          <p className="text-xl font-bold font-mono text-[#2F6B54]">₹{safeFormat(netSales)}</p>
        </div>
        <div className="p-4 bg-[#F3ECE3]/40 rounded-xl border border-[#E8DFD3]">
          <p className="text-xs font-bold uppercase tracking-wider text-[#66554A]">Expected Cash</p>
          <p className="text-xl font-bold font-mono text-[#241A15]">₹{safeFormat(expectedCash)}</p>
        </div>
        <div className="p-4 bg-[#F3ECE3]/40 rounded-xl border border-[#E8DFD3]">
          <p className="text-xs font-bold uppercase tracking-wider text-[#66554A]">Expected UPI</p>
          <p className="text-xl font-bold font-mono text-[#241A15]">₹{safeFormat(expectedUpi)}</p>
        </div>
        <div className={`p-4 rounded-xl border ${Math.abs(safeNum(cashDiff)) > 100 ? 'bg-[#B42318]/5 border-[#B42318]/20' : 'bg-[#F3ECE3]/40 border-[#E8DFD3]'}`}>
          <p className="text-xs font-bold uppercase tracking-wider text-[#66554A]">Cash Difference</p>
          <p className={`text-xl font-bold font-mono ${Math.abs(safeNum(cashDiff)) > 100 ? 'text-[#B42318]' : 'text-[#241A15]'}`}>
            ₹{safeFormat(cashDiff)}
          </p>
        </div>
        <div className="p-4 bg-[#F3ECE3]/40 rounded-xl border border-[#E8DFD3]">
          <p className="text-xs font-bold uppercase tracking-wider text-[#66554A]">UPI Difference</p>
          <p className="text-xl font-bold font-mono text-[#241A15]">₹{safeFormat(upiDiff)}</p>
        </div>
        <div className="p-4 bg-[#F3ECE3]/40 rounded-xl border border-[#E8DFD3]">
          <p className="text-xs font-bold uppercase tracking-wider text-[#66554A]">Refunds Paid</p>
          <p className="text-xl font-bold font-mono text-[#A15C17]">₹{safeFormat(refundsPaid)}</p>
        </div>
        <div className="p-4 bg-[#F3ECE3]/40 rounded-xl border border-[#E8DFD3]">
          <p className="text-xs font-bold uppercase tracking-wider text-[#66554A]">Wastage Count</p>
          <p className="text-xl font-bold font-mono text-[#241A15]">{safeNum(wastageCount)}</p>
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 bg-[#FAF7F2] text-[#241A15] min-h-screen font-sans">

      {/* Inline Toast */}
      {toastMsg && (
        <div className={`flex items-center gap-3 px-5 py-3 rounded-2xl text-sm font-mono border ${
          toastMsg.type === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-[#2F6B54]'
            : 'bg-rose-50 border-rose-200 text-[#B42318]'
        }`}>
          <span>{toastMsg.type === 'success' ? '✓' : '✕'}</span>
          <span className="uppercase tracking-widest text-[10px] font-bold">{toastMsg.text}</span>
        </div>
      )}

      {/* Outlet not assigned error */}
      {outletError && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex flex-col gap-2">
          <p className="font-serif italic text-lg text-amber-800 font-bold">Outlet Not Configured</p>
          <p className="font-mono text-xs text-amber-700 uppercase tracking-wider">{outletError}</p>
          <p className="text-sm text-amber-600 mt-1">
            Ask your admin to set the <code className="bg-amber-100 px-1 rounded">outlet_id</code> field on your staff record in Firestore. 
            This links your account to a specific hatch so daily closing data can be scoped correctly.
          </p>
        </div>
      )}

      <div className="flex justify-between items-start">
        <h1 className="text-3xl font-black font-serif text-[#9A642C]">Daily Closing</h1>
        {['manager', 'admin', 'owner'].includes(userRole) && activeTab === 'draft' && (() => {
          const dateContext = getBusinessDateContext();
          return (
            <div className="flex flex-col items-end gap-2">
              {dateContext.operating_state === 'closed_before_open' && (
                <div className="text-sm text-[#A15C17] bg-[#A15C17]/5 px-3 py-1.5 rounded-md border border-[#A15C17]/20 max-w-sm text-right font-mono">
                  Store is currently outside operating hours. This will generate the previous business date closing.
                </div>
              )}
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="flex items-center gap-2 px-5 py-3 bg-[#9A642C] text-[#FFFDFC] rounded-xl hover:bg-[#805020] transition-colors disabled:opacity-50 font-mono text-xs uppercase tracking-widest font-bold shadow-[0_4px_12px_rgba(154,100,44,0.15)] cursor-pointer"
              >
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                Generate Today's Draft
              </button>
            </div>
          );
        })()}
      </div>

      <div className="flex space-x-2 border-b border-[#E8DFD3]">
        {(['draft', 'submitted', 'locked', 'rejected', 'history'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 capitalize font-bold text-xs border-b-2 transition-colors tracking-widest ${
              activeTab === tab ? 'border-[#9A642C] text-[#9A642C]' : 'border-transparent text-[#66554A] hover:text-[#241A15]'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin text-[#9A642C]" />
        </div>
      ) : closings.length === 0 ? (
        <div className="text-center p-12 text-[#66554A] bg-[#FFFDFC] rounded-xl border border-dashed border-[#E8DFD3] font-mono text-xs uppercase tracking-widest">
          No records found in this view.
        </div>
      ) : (
        <div className="space-y-6">
          {closings.map(closing => (
            <div key={closing.closing_id} className="border border-[#E8DFD3] rounded-xl p-6 bg-[#FFFDFC] shadow-sm">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-bold flex items-center gap-2 text-[#241A15]">
                    Business Date: {closing.business_date}
                    {closing.status === 'locked' && <Lock className="w-4 h-4 text-[#2F6B54]" />}
                    {closing.status === 'submitted' && <Send className="w-4 h-4 text-blue-600" />}
                    {closing.status === 'rejected' && <XCircle className="w-4 h-4 text-[#B42318]" />}
                  </h3>
                  <p className="text-xs font-mono text-[#66554A]/60">ID: {closing.closing_id}</p>
                </div>
                <span className="px-3 py-1 bg-[#F3ECE3] text-[#9A642C] text-xs font-bold rounded-full capitalize font-mono">
                  {closing.status}
                </span>
              </div>

              {renderDashboardCards(closing)}

              {(closing.status === 'draft' || closing.status === 'rejected') && (
                <div className="mt-6 space-y-4 border-t border-[#E8DFD3] pt-4">
                  <h4 className="font-bold text-[#241A15]">Manager Verification</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-[#66554A] mb-1">Counted Cash (₹)</label>
                      <input
                        type="number"
                        min="0"
                        value={countedCash[closing.closing_id] ?? ''}
                        onChange={e => setCountedCash({ ...countedCash, [closing.closing_id]: Number(e.target.value) })}
                        className="w-full bg-[#FFFDFC] border border-[#E8DFD3] rounded-xl p-3 focus:ring-2 focus:ring-[#9A642C]/20 focus:border-[#9A642C] outline-none text-[#241A15] font-mono"
                        placeholder="Enter physical cash amount"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-[#66554A] mb-1">Verified UPI (₹)</label>
                      <input
                        type="number"
                        min="0"
                        value={verifiedUpi[closing.closing_id] ?? ''}
                        onChange={e => setVerifiedUpi({ ...verifiedUpi, [closing.closing_id]: Number(e.target.value) })}
                        className="w-full bg-[#FFFDFC] border border-[#E8DFD3] rounded-xl p-3 focus:ring-2 focus:ring-[#9A642C]/20 focus:border-[#9A642C] outline-none text-[#241A15] font-mono"
                        placeholder="Enter merchant app amount"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-bold uppercase tracking-wider text-[#66554A] mb-1">Notes (Required if large difference)</label>
                      <textarea
                        value={managerNotes[closing.closing_id] ?? ''}
                        onChange={e => setManagerNotes({ ...managerNotes, [closing.closing_id]: e.target.value })}
                        className="w-full bg-[#FFFDFC] border border-[#E8DFD3] rounded-xl p-3 focus:ring-2 focus:ring-[#9A642C]/20 focus:border-[#9A642C] outline-none text-[#241A15]"
                        rows={2}
                        placeholder="Explain any differences, wastage issues, or operational notes."
                      />
                    </div>
                    <div className="col-span-2 md:col-span-1">
                      <label className="block text-xs font-bold uppercase tracking-wider text-[#66554A] mb-1">Upload Cash Proofs</label>
                      <label className="flex items-center justify-center gap-2 w-full bg-[#FFFDFC] border border-[#E8DFD3] border-dashed rounded-xl p-3 cursor-pointer hover:bg-[#F3ECE3]/40 transition-colors">
                        {uploading[`${closing.closing_id}-cash`] ? (
                          <Loader2 className="w-4 h-4 animate-spin text-[#9A642C]" />
                        ) : (
                          <Camera className="w-4 h-4 text-[#9A642C]" />
                        )}
                        <span className="text-xs font-bold text-[#66554A]">
                          {(cashProofs[closing.closing_id]?.length || 0)} Uploaded
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={e => handleProofUpload(closing.closing_id, e, 'cash')}
                          disabled={uploading[`${closing.closing_id}-cash`]}
                        />
                      </label>
                    </div>
                    <div className="col-span-2 md:col-span-1">
                      <label className="block text-xs font-bold uppercase tracking-wider text-[#66554A] mb-1">Upload UPI Proofs</label>
                      <label className="flex items-center justify-center gap-2 w-full bg-[#FFFDFC] border border-[#E8DFD3] border-dashed rounded-xl p-3 cursor-pointer hover:bg-[#F3ECE3]/40 transition-colors">
                        {uploading[`${closing.closing_id}-payment`] ? (
                          <Loader2 className="w-4 h-4 animate-spin text-[#9A642C]" />
                        ) : (
                          <Upload className="w-4 h-4 text-[#9A642C]" />
                        )}
                        <span className="text-xs font-bold text-[#66554A]">
                          {(paymentProofs[closing.closing_id]?.length || 0)} Uploaded
                        </span>
                        <input
                          type="file"
                          accept="image/*,application/pdf"
                          className="hidden"
                          onChange={e => handleProofUpload(closing.closing_id, e, 'payment')}
                          disabled={uploading[`${closing.closing_id}-payment`]}
                        />
                      </label>
                    </div>
                  </div>
                  <button
                    onClick={() => handleSubmit(closing)}
                    disabled={submittingId === closing.closing_id}
                    className="flex items-center gap-2 px-5 py-3 bg-[#9A642C] text-[#FFFDFC] font-mono text-xs uppercase tracking-widest font-bold rounded-xl hover:bg-[#805020] transition-colors disabled:opacity-50 cursor-pointer shadow-[0_4px_12px_rgba(154,100,44,0.15)]"
                  >
                    {submittingId === closing.closing_id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Submit for Review
                  </button>
                </div>
              )}

              {closing.status === 'submitted' && (userRole === 'admin' || userRole === 'owner') && (
                <div className="mt-6 space-y-4 border-t border-[#E8DFD3] pt-4 bg-[#FAF7F2] -mx-6 px-6 pb-6 rounded-b-xl">
                  <h4 className="font-bold text-[#241A15] pt-4">Admin/Owner Review</h4>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-[#66554A] mb-1">Review Notes</label>
                    <textarea
                      value={founderNotes[closing.closing_id] ?? ''}
                      onChange={e => setFounderNotes({ ...founderNotes, [closing.closing_id]: e.target.value })}
                      className="w-full bg-[#FFFDFC] border border-[#E8DFD3] rounded-xl p-3 focus:ring-2 focus:ring-[#9A642C]/20 focus:border-[#9A642C] outline-none text-[#241A15]"
                      rows={2}
                      placeholder="Feedback to manager or internal audit notes."
                    />
                  </div>
                  <div className="flex gap-4">
                    {userRole === 'owner' && (
                      <button
                        onClick={() => handleReview(closing.closing_id, 'approved')}
                        disabled={submittingId === closing.closing_id}
                        className="flex items-center gap-2 px-5 py-3 bg-[#2F6B54] text-[#FFFDFC] font-mono text-xs uppercase tracking-widest font-bold rounded-xl hover:bg-[#204a3a] transition-colors disabled:opacity-50 cursor-pointer shadow-md"
                      >
                        {submittingId === closing.closing_id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                        Approve & Lock
                      </button>
                    )}
                    <button
                      onClick={() => handleReview(closing.closing_id, 'rejected')}
                      disabled={submittingId === closing.closing_id}
                      className="flex items-center gap-2 px-5 py-3 bg-[#B42318] text-[#FFFDFC] font-mono text-xs uppercase tracking-widest font-bold rounded-xl hover:bg-[#901c13] transition-colors disabled:opacity-50 cursor-pointer shadow-md"
                    >
                      {submittingId === closing.closing_id ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                      Reject
                    </button>
                  </div>
                </div>
              )}

              {(closing.founder_review_note || closing.manager_notes || closing.cash_reconciliation?.cash_proof_photo_urls?.length || closing.payment_reconciliation?.payment_proof_refs?.length) && (
                <div className="mt-4 p-4 bg-[#F3ECE3]/40 rounded-xl border border-[#E8DFD3] space-y-4">
                  {closing.manager_notes && (
                    <div>
                      <span className="font-bold text-xs uppercase tracking-wider text-[#66554A]">Manager Note:</span>
                      <p className="text-sm text-[#241A15] mt-0.5">{closing.manager_notes}</p>
                    </div>
                  )}
                  {closing.founder_review_note && (
                    <div>
                      <span className="font-bold text-xs uppercase tracking-wider text-[#9A642C]">Reviewer Note:</span>
                      <p className="text-sm text-[#241A15] mt-0.5">{closing.founder_review_note}</p>
                    </div>
                  )}
                  {((closing.cash_reconciliation?.cash_proof_photo_urls && closing.cash_reconciliation.cash_proof_photo_urls.length > 0) || 
                    (closing.payment_reconciliation?.payment_proof_refs && closing.payment_reconciliation.payment_proof_refs.length > 0)) && (
                    <div className="pt-2 border-t border-[#E8DFD3]/50">
                      <span className="font-bold text-xs uppercase tracking-wider text-[#66554A]">Attached Evidence:</span>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {closing.cash_reconciliation?.cash_proof_photo_urls?.map((url, i) => (
                          <a key={`cash-${i}`} href={url} target="_blank" rel="noreferrer" className="flex items-center gap-1 px-3 py-1.5 bg-[#FFFDFC] border border-[#E8DFD3] rounded-lg text-xs font-mono text-[#9A642C] hover:bg-[#F3ECE3] transition-colors">
                            <Camera className="w-3 h-3" /> Cash Proof {i + 1}
                          </a>
                        ))}
                        {closing.payment_reconciliation?.payment_proof_refs?.map((ref, i) => (
                          <span key={`payment-${i}`} className="flex items-center gap-1 px-3 py-1.5 bg-[#FFFDFC] border border-[#E8DFD3] rounded-lg text-xs font-mono text-[#9A642C]">
                            <FileText className="w-3 h-3" /> Payment Proof Ref: {ref.substring(0, 8)}...
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
