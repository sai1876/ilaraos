'use client';

import React, { useState, useEffect } from 'react';
import { 
  Search, 
  FileText, 
  Download, 
  Eye, 
  RefreshCw, 
  Link as LinkIcon, 
  ExternalLink 
} from 'lucide-react';
import { 
  fetchVaultDocuments, 
  getDocumentSignedUrl, 
  linkExistingDocumentToEntity,
  DocumentRecord 
} from '@/features/documents/documentService';
import DocumentPreview from '@/components/documents/DocumentPreview';
import DocumentUploader from '@/components/documents/DocumentUploader';
import DocumentTypeBadge from '@/components/documents/DocumentTypeBadge';

const TABS = [
  { id: 'all', label: 'All Files' },
  { id: 'evidence', label: 'Proofs' },
  { id: 'invoice', label: 'Invoices' },
  { id: 'receipt', label: 'Receipts' },
  { id: 'document', label: 'Staff Documents' },
  { id: 'compliance', label: 'Compliance' },
  { id: 'report', label: 'Reports' },
  { id: 'media', label: 'Media' },
];

export default function DocumentVault({ 
  userRole = 'manager',
  onOpenRecordAction
}: { 
  userRole?: string;
  onOpenRecordAction?: (entityType: string, entityId: string) => void;
}) {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('available');
  const [previewDoc, setPreviewDoc] = useState<DocumentRecord | null>(null);
  
  // Upload modal state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [generalDocId, setGeneralDocId] = useState<string | null>(null);
  const [isCreatingContainer, setIsCreatingContainer] = useState(false);

  // Link existing modal state
  const [linkingDoc, setLinkingDoc] = useState<DocumentRecord | null>(null);
  const [targetType, setTargetType] = useState('expenses');
  const [targetId, setTargetId] = useState('');
  const [isLinking, setIsLinking] = useState(false);

  const loadVault = async () => {
    setLoading(true);
    try {
      const res = await fetchVaultDocuments({
        category: activeTab === 'all' ? undefined : activeTab,
        status: statusFilter,
        search: searchQuery || undefined,
      });
      setDocuments(res.documents || []);
    } catch (err) {
      console.error('Failed to fetch Document Vault files:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVault();
  }, [activeTab, statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadVault();
  };

  const handleDownload = async (docId: string) => {
    try {
      const res = await getDocumentSignedUrl(docId, 'download');
      window.open(res.url, '_blank');
    } catch (err: any) {
      alert(err.message || 'Failed to download document');
    }
  };

  const handleOpenUpload = async () => {
    setIsCreatingContainer(true);
    setShowUploadModal(true);
    try {
      // We must get auth token manually since we aren't using a helper hook that provides it here.
      // But we can just use relative fetch if the middleware handles it, or wait, we just use fetch
      const res = await fetch('/api/general-documents', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to init general document');
      const data = await res.json();
      setGeneralDocId(data.document_id);
    } catch (e: any) {
      alert(e.message);
      setShowUploadModal(false);
    } finally {
      setIsCreatingContainer(false);
    }
  };

  const handleConfirmLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkingDoc || !targetId.trim()) return;
    setIsLinking(true);

    try {
      await linkExistingDocumentToEntity(linkingDoc.document_id, targetType, targetId.trim());
      alert(`Document linked to ${targetType}:${targetId.trim()} successfully!`);
      setLinkingDoc(null);
      setTargetId('');
      await loadVault();
    } catch (err: any) {
      alert(err.message || 'Failed to link document');
    } finally {
      setIsLinking(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="flex flex-col h-full p-6 font-sans bg-[#FFFDFC] text-[#241A15] border border-[#E8DFD3] rounded-3xl shadow-sm no-scrollbar">
      {/* Header */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between border-b border-[#E8DFD3] pb-4 gap-4">
        <div>
          <h2 className="text-2xl font-serif font-bold text-[#241A15]">Document Vault Archive</h2>
          <p className="text-xs text-[#66554A] mt-1">Centralized operational evidence & financial document repository.</p>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          <button
            onClick={handleOpenUpload}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#9A642C] text-white text-xs font-mono font-bold uppercase tracking-wider hover:bg-[#855300] transition-colors shadow-sm cursor-pointer"
          >
            <span>+ Upload Document</span>
          </button>
          <button
            onClick={loadVault}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#FAF7F2] border border-[#E8DFD3] text-xs font-mono font-bold text-[#66554A] hover:bg-[#F3ECE3] transition-colors cursor-pointer"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col md:flex-row gap-3 mb-5">
        <form onSubmit={handleSearchSubmit} className="flex-1 relative">
          <input
            type="text"
            placeholder="Search filenames, invoice #, vendors, descriptions…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-[#FAF7F2] border border-[#E8DFD3] text-xs font-mono outline-none focus:border-[#9A642C]"
          />
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#66554A]" />
        </form>

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-[#FAF7F2] border border-[#E8DFD3] rounded-xl px-3 py-2.5 text-xs font-mono text-[#241A15] outline-none"
          >
            <option value="available">Available Files</option>
            <option value="archived">Archived</option>
            <option value="all">All Statuses</option>
          </select>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex gap-2 mb-6 border-b border-[#E8DFD3] pb-2 overflow-x-auto no-scrollbar">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-1.5 text-xs font-mono font-bold tracking-wider uppercase transition-colors whitespace-nowrap rounded-lg cursor-pointer ${
              activeTab === tab.id
                ? 'bg-[#9A642C] text-white shadow-sm'
                : 'bg-[#FAF7F2] text-[#66554A] hover:bg-[#F3ECE3] border border-[#E8DFD3]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Vault Documents Table */}
      {loading ? (
        <div className="flex justify-center items-center h-48 text-[#66554A] font-mono text-xs gap-2">
          <RefreshCw size={20} className="animate-spin text-[#9A642C]" />
          <span>Fetching vault records…</span>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-[#E8DFD3] overflow-hidden shadow-sm flex-1 overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs font-mono">
            <thead>
              <tr className="border-b border-[#E8DFD3] bg-[#FAF7F2] text-[#66554A] font-bold">
                <th className="p-3">File Name</th>
                <th className="p-3">Type / Category</th>
                <th className="p-3">Related Business Record</th>
                <th className="p-3">Size</th>
                <th className="p-3">Uploaded By</th>
                <th className="p-3">Date</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {documents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-[#66554A]">
                    <FileText className="w-8 h-8 mx-auto mb-2 opacity-50 text-[#9A642C]" />
                    No documents found matching the filter criteria.
                  </td>
                </tr>
              ) : (
                documents.map((doc) => (
                  <tr key={doc.document_id} className="border-b border-[#E8DFD3]/40 hover:bg-[#FAF7F2]/60 transition-colors">
                    <td className="p-3 font-sans font-bold text-[#241A15] max-w-[220px] truncate" title={doc.original_filename}>
                      {doc.original_filename}
                    </td>
                    <td className="p-3">
                      <DocumentTypeBadge documentType={doc.document_type || doc.category} />
                    </td>
                    <td className="p-3 text-[#66554A]">
                      {doc.related_entity_type && doc.related_entity_id ? (
                        <button
                          onClick={() => onOpenRecordAction && onOpenRecordAction(doc.related_entity_type, doc.related_entity_id)}
                          className="hover:underline text-[#9A642C] font-bold text-left flex items-center gap-1"
                        >
                          <span className="uppercase">{doc.related_entity_type}</span>
                          <span className="text-[10px]">#{doc.related_entity_id.slice(-6)}</span>
                          <ExternalLink size={10} />
                        </button>
                      ) : (
                        <span className="opacity-50">Unlinked</span>
                      )}
                    </td>
                      <td className="p-3 text-[#66554A]">
                        {formatSize(doc.size_bytes || 0)}
                      </td>
                      <td className="p-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-bold">{doc.uploaded_by_role || 'Staff'}</span>
                          <span className="text-[9px] uppercase tracking-wider text-muted-foreground truncate max-w-[100px]">{doc.uploaded_by || 'Unknown User'}</span>
                        </div>
                      </td>
                      <td className="p-3 text-muted-foreground whitespace-nowrap">
                        {doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'Unknown Date'}
                      </td>
                    <td className="p-3 text-right space-x-1.5">
                      <button
                        onClick={() => setPreviewDoc(doc)}
                        className="p-1.5 bg-[#FAF7F2] hover:bg-[#F3ECE3] text-[#9A642C] transition-colors rounded-lg border border-[#E8DFD3]"
                        title="Preview File"
                      >
                        <Eye size={13} />
                      </button>
                      <button
                        onClick={() => handleDownload(doc.document_id)}
                        className="p-1.5 bg-[#FAF7F2] hover:bg-[#F3ECE3] text-[#66554A] transition-colors rounded-lg border border-[#E8DFD3]"
                        title="Download File"
                      >
                        <Download size={13} />
                      </button>
                      <button
                        onClick={() => setLinkingDoc(doc)}
                        className="p-1.5 bg-[#FAF7F2] hover:bg-[#F3ECE3] text-[#2F6B54] transition-colors rounded-lg border border-[#E8DFD3]"
                        title="Attach / Reuse File on Record"
                      >
                        <LinkIcon size={13} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Preview Modal */}
      {previewDoc && (
        <DocumentPreview document={previewDoc} onClose={() => setPreviewDoc(null)} />
      )}

      {/* Link Existing Document Modal */}
      {linkingDoc && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#241A15]/60 backdrop-blur-sm" onClick={() => setLinkingDoc(null)} />
          <div className="bg-white border border-[#E8DFD3] rounded-2xl w-full max-w-sm p-5 shadow-2xl relative z-10">
            <h3 className="font-serif font-bold text-sm text-[#241A15] mb-1">Reuse / Link Document</h3>
            <p className="text-[10px] text-[#66554A] font-mono mb-4 truncate">{linkingDoc.original_filename}</p>

            <form onSubmit={handleConfirmLink} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1 text-[10px] font-mono font-bold text-[#66554A]">
                <label>Target Entity Module</label>
                <select
                  value={targetType}
                  onChange={(e) => setTargetType(e.target.value)}
                  className="bg-[#FAF7F2] border border-[#E8DFD3] rounded-lg p-2 text-xs text-[#241A15] outline-none"
                >
                  <option value="expenses">Expense Record</option>
                  <option value="purchases">Purchase Order</option>
                  <option value="refund_requests">Refund Request</option>
                  <option value="wastage_events">Wastage Record</option>
                  <option value="daily_closings">Daily Closing</option>
                  <option value="approvals">Approval Request</option>
                </select>
              </div>

              <div className="flex flex-col gap-1 text-[10px] font-mono font-bold text-[#66554A]">
                <label>Target Record ID</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. exp_1786095000"
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  className="bg-[#FAF7F2] border border-[#E8DFD3] rounded-lg p-2 text-xs text-[#241A15] outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setLinkingDoc(null)}
                  className="px-3 py-2 rounded-lg bg-[#FAF7F2] text-xs font-mono font-bold text-[#66554A]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLinking}
                  className="px-4 py-2 rounded-lg bg-[#9A642C] text-white text-xs font-mono font-bold uppercase tracking-wider shadow-sm disabled:opacity-50"
                >
                  {isLinking ? 'Linking…' : 'Attach Document'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Standalone Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#241A15]/60 backdrop-blur-sm" onClick={() => setShowUploadModal(false)} />
          <div className="bg-[#FFFDFC] border border-[#E8DFD3] rounded-2xl w-full max-w-md p-6 shadow-2xl relative z-10 flex flex-col gap-4">
            <h3 className="font-serif font-bold text-lg text-[#241A15]">Upload General Document</h3>
            <p className="text-xs text-[#66554A]">
              Upload standalone documents, supplier invoices, or certificates. You can link them to specific business records later.
            </p>
            
            {isCreatingContainer ? (
              <div className="flex flex-col items-center py-6 gap-2">
                <RefreshCw size={20} className="animate-spin text-[#9A642C]" />
                <span className="text-xs font-mono text-[#66554A]">Preparing secure container...</span>
              </div>
            ) : generalDocId ? (
              <div className="mt-2">
                <DocumentUploader
                  entityType="general_documents"
                  entityId={generalDocId}
                  category="document"
                  allowedDocumentTypes={['general_document', 'supplier_invoice', 'expense_receipt', 'expense_invoice']}
                  onUploadSuccess={() => {
                    // Refresh in background
                  }}
                />
              </div>
            ) : (
              <div className="text-xs text-red-600 font-mono text-center">Failed to create document container.</div>
            )}
            
            <button
              onClick={() => {
                setShowUploadModal(false);
                if (generalDocId) loadVault();
              }}
              className="mt-2 px-4 py-2.5 rounded-xl bg-[#FAF7F2] border border-[#E8DFD3] hover:bg-[#F3ECE3] text-[#241A15] font-mono font-bold text-xs transition-colors self-end"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
