'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Clock, IndianRupee, RefreshCw, X } from 'lucide-react';
import PendingEntityDocuments from '@/components/documents/PendingEntityDocuments';
import { operationsApiRequest } from '@/lib/apiClient';

export default function PurchasesPanel({ outletId }: { outletId?: string }) {
  const [purchases, setPurchases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const [purchaseId, setPurchaseId] = useState(() => typeof crypto !== 'undefined' ? crypto.randomUUID() : Math.random().toString(36).slice(2));
  const [vendorId, setVendorId] = useState('');
  const [notes, setNotes] = useState('');
  const [amount, setAmount] = useState('');
  const [docs, setDocs] = useState<any[]>([]);
  const [docsSatisfied, setDocsSatisfied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadPurchases = async () => {
    setLoading(true);
    try {
      const data = await operationsApiRequest<any>('/api/purchases');
      if (data.success) {
        setPurchases(data.purchases || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPurchases();
  }, [outletId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docsSatisfied) {
      alert('Please upload the required purchase quotation.');
      return;
    }
    setIsSubmitting(true);
    try {
      await operationsApiRequest<any>('/api/purchases', {
        method: 'POST',
        body: JSON.stringify({
          purchase_id: purchaseId,
          outlet: outletId || 'main',
          vendor_id: vendorId,
          total_amount_paise: parseFloat(amount) * 100,
          notes,
          items: [{ name: 'Bulk Supplies', qty: 1 }],
          document_ids: docs.map(d => d.document_id)
        })
      });
      alert('Purchase request submitted for approval.');
      setShowCreate(false);
      setPurchaseId(typeof crypto !== 'undefined' ? crypto.randomUUID() : Math.random().toString(36).slice(2));
      setVendorId('');
      setNotes('');
      setAmount('');
      setDocs([]);
      setDocsSatisfied(false);
      loadPurchases();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-serif text-[#d4c4b0]">Purchase Orders</h2>
          <p className="text-xs text-[#a39587] font-mono">Manage vendor POs, goods receipts, and invoices.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadPurchases} className="p-2 bg-[#2d241f] rounded-lg text-[#d4c4b0] hover:text-white transition-colors">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 bg-[#f8bc51] text-[#0A0604] font-bold rounded-lg hover:bg-[#e5a840] transition-colors">
            <Plus size={16} />
            <span className="text-sm">New PO</span>
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="bg-[#1f1814] p-6 rounded-2xl border border-[#3d322a]">
          <div className="flex justify-between items-center mb-4 border-b border-[#3d322a] pb-4">
            <h3 className="text-lg font-serif text-white">Create Purchase Order</h3>
            <button onClick={() => setShowCreate(false)} className="text-[#a39587] hover:text-white">
              <X size={20} />
            </button>
          </div>
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[#d4c4b0] font-mono">Vendor / Supplier</label>
                <input required type="text" value={vendorId} onChange={e => setVendorId(e.target.value)} className="bg-[#2d241f] border border-[#3d322a] text-white rounded-lg p-2 text-sm focus:outline-none focus:border-[#f8bc51]" placeholder="Vendor Name or ID" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[#d4c4b0] font-mono">Total Estimated Amount (Rs.)</label>
                <input required type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} className="bg-[#2d241f] border border-[#3d322a] text-white rounded-lg p-2 text-sm focus:outline-none focus:border-[#f8bc51]" placeholder="e.g. 5000" />
              </div>
            </div>
            
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[#d4c4b0] font-mono">Notes</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} className="bg-[#2d241f] border border-[#3d322a] text-white rounded-lg p-2 text-sm focus:outline-none focus:border-[#f8bc51]" placeholder="Items details or comments..." />
            </div>

            <div className="my-2">
              <PendingEntityDocuments
                entityType="purchases"
                entityId={purchaseId}
                category="document"
                allowedDocumentTypes={['purchase_quotation']}
                requirements={[{ label: 'Purchase Quotation', anyOf: ['purchase_quotation'], min: 1 }]}
                onDocumentsChanged={(newDocs, satisfied) => {
                  setDocs(newDocs);
                  setDocsSatisfied(satisfied);
                }}
                title="PO Evidence"
              />
            </div>

            <button type="submit" disabled={isSubmitting || !docsSatisfied} className="mt-2 py-3 bg-[#f8bc51] text-[#0A0604] font-bold rounded-lg hover:bg-[#e5a840] disabled:opacity-50 transition-colors uppercase tracking-widest text-xs">
              {isSubmitting ? 'Submitting...' : 'Submit Purchase Request'}
            </button>
          </form>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-[#a39587] font-mono text-sm">Loading purchases...</div>
      ) : purchases.length === 0 ? (
        <div className="text-center py-12 text-[#a39587] font-mono text-sm border border-dashed border-[#3d322a] rounded-2xl">No purchase orders found.</div>
      ) : (
        <div className="grid gap-4">
          {purchases.map(p => (
            <div key={p.purchase_id} className="bg-[#1f1814] p-5 rounded-2xl border border-[#3d322a] flex flex-col gap-3">
              <div className="flex justify-between items-start">
                <div className="flex flex-col gap-1">
                  <span className="text-white font-bold font-mono text-sm">{p.vendor_id}</span>
                  <span className="text-xs text-[#a39587]">PO: {p.purchase_id.slice(-8)}</span>
                </div>
                <div className="px-3 py-1 bg-[#2d241f] rounded-lg border border-[#3d322a]">
                  <span className="text-xs font-bold text-[#f8bc51] uppercase tracking-wider">{p.status.replace(/_/g, ' ')}</span>
                </div>
              </div>
              <div className="flex items-center gap-6 mt-2 border-t border-[#3d322a] pt-4">
                <div className="flex items-center gap-2 text-[#d4c4b0]">
                  <IndianRupee size={14} className="text-[#a39587]"/>
                  <span className="text-sm font-bold">{(p.total_amount_paise / 100).toFixed(2)}</span>
                </div>
                <div className="flex items-center gap-2 text-[#d4c4b0]">
                  <Clock size={14} className="text-[#a39587]"/>
                  <span className="text-sm">{new Date(p.created_at).toLocaleDateString()}</span>
                </div>
              </div>
              {/* Additional workflows (GRN, Invoice, Payment) would be integrated here */}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
