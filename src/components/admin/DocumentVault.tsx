import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { Eye, Download, Trash2, RefreshCw, FileText } from 'lucide-react';

interface DocumentMetadata {
  document_id: string;
  category: string;
  related_entity_type: string;
  related_entity_id: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  access_level: string;
  uploaded_by: string;
  uploaded_at: any; // Firestore Timestamp
  status: string;
  version: number;
}

const TABS = [
  { id: 'evidence', label: 'Proofs' },
  { id: 'invoice', label: 'Invoices' },
  { id: 'receipt', label: 'Receipts' },
  { id: 'document', label: 'Staff Documents' },
  { id: 'compliance', label: 'Compliance' },
  { id: 'report', label: 'Reports' },
  { id: 'media', label: 'Media' },
];

export default function DocumentVault({ userRole }: { userRole: string }) {
  const [documents, setDocuments] = useState<DocumentMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('evidence');

  const fallbackDocs: DocumentMetadata[] = [
    {
      document_id: 'doc-001',
      category: 'proofs',
      related_entity_type: 'wastage',
      related_entity_id: 'w-001',
      original_filename: 'burnt_buns_proof.jpg',
      mime_type: 'image/jpeg',
      size_bytes: 245000,
      access_level: 'staff',
      uploaded_by: 'Chef One',
      uploaded_at: { toDate: () => new Date() },
      status: 'available',
      version: 1
    },
    {
      document_id: 'doc-002',
      category: 'invoices',
      related_entity_type: 'gst_reconciliations',
      related_entity_id: 'gst-rec-001',
      original_filename: 'fresh_foods_invoice.pdf',
      mime_type: 'application/pdf',
      size_bytes: 1045000,
      access_level: 'manager',
      uploaded_by: 'Ilara Manager',
      uploaded_at: { toDate: () => new Date() },
      status: 'available',
      version: 1
    }
  ];

  useEffect(() => {
    let unsubscribed = false;
    const q = query(collection(db, 'documents'), orderBy('uploaded_at', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (unsubscribed) return;
      const docs: DocumentMetadata[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as DocumentMetadata;
        if (data.status !== 'deleted') {
          docs.push(data);
        }
      });
      setDocuments(docs.length > 0 ? docs : fallbackDocs);
      setLoading(false);
    }, (error) => {
      console.error("DocumentVault Firestore listener error:", error);
      setDocuments(fallbackDocs);
      setLoading(false);
    });

    return () => {
      unsubscribed = true;
      unsubscribe();
    };
  }, []);

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp || !timestamp.toDate) return 'Unknown';
    return timestamp.toDate().toLocaleString();
  };

  const handleAction = async (docId: string, action: 'view' | 'download') => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Not authenticated');

      const res = await fetch('/api/files/signed-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          documentId: docId,
          disposition: action === 'download' ? 'download' : 'inline'
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to get URL');
      }

      const { url } = await res.json();
      
      if (action === 'download') {
        const a = document.createElement('a');
        a.href = url;
        a.download = '';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }

    } catch (error: any) {
      alert(`Error: ${error.message}`);
    }
  };

  const handleDelete = async (docId: string) => {
    if (!confirm('Are you sure you want to delete this document?')) return;
    
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Not authenticated');

      const res = await fetch(`/api/files/${docId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to delete');
      }

    } catch (error: any) {
      alert(`Delete Error: ${error.message}`);
    }
  };

  const filteredDocs = documents.filter(d => {
    if (activeTab === 'media') return d.category === 'menu' || d.category === 'atmosphere' || d.category === 'media';
    if (activeTab === 'evidence') return d.category === 'evidence' || d.category === 'proofs';
    if (activeTab === 'invoice') return d.category === 'invoice' || d.category === 'invoices';
    if (activeTab === 'receipt') return d.category === 'receipt' || d.category === 'receipts';
    if (activeTab === 'document') return d.category === 'document' || d.category === 'staff_documents';
    if (activeTab === 'report') return d.category === 'report' || d.category === 'reports';
    return d.category === activeTab;
  });

  const isDark = userRole !== 'manager';

  return (
    <div className={`flex flex-col h-full p-6 font-mono overflow-y-auto rounded-3xl ${isDark ? 'bg-[#1e140d] text-[#e0cfb8]' : 'bg-[#f5f4ec] text-[#241A15] border border-[#d8c3ad]/70 shadow-sm'}`}>
      <div className={`mb-6 flex justify-between items-end border-b pb-4 ${isDark ? 'border-[#d4c4b0]/20' : 'border-[#d8c3ad]'}`}>
        <div>
          <h2 className={`text-3xl font-serif font-black italic tracking-wide uppercase ${isDark ? 'text-[#f59e0b]' : 'text-[#855300]'}`}>Document Vault</h2>
          <p className={`text-xs mt-1 ${isDark ? 'text-[#d4c4b0]/60' : 'text-[#66554A]/70'}`}>Secure centralized storage for all organizational files.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className={`flex gap-2 mb-6 border-b pb-2 overflow-x-auto no-scrollbar ${isDark ? 'border-[#d4c4b0]/10' : 'border-[#d8c3ad]/50'}`}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-1.5 text-xs font-bold tracking-widest uppercase transition-colors whitespace-nowrap rounded-lg cursor-pointer
              ${activeTab === tab.id 
                ? (isDark ? 'bg-[#f59e0b] text-[#1e140d]' : 'bg-[#855300] text-white shadow-sm') 
                : (isDark ? 'bg-[#1e140d] text-[#d4c4b0]/60 hover:bg-[#d4c4b0]/10 hover:text-[#f59e0b]' : 'bg-white text-[#534434] hover:bg-[#eae8e0] border border-[#d8c3ad]/50')}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-48">
          <RefreshCw className="w-6 h-6 animate-spin text-[#f59e0b]" />
        </div>
      ) : (
        <div className={`p-1 rounded-2xl border ${isDark ? 'bg-[#150e09] border-[#d4c4b0]/20' : 'bg-white border-[#d8c3ad]/60 shadow-sm'}`}>
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className={`border-b ${isDark ? 'bg-[#1e140d] border-[#d4c4b0]/20 text-[#d4c4b0]/80' : 'bg-[#f5f4ec] border-[#d8c3ad] text-[#855300] font-bold'}`}>
                <th className="p-3 font-semibold tracking-wider">File Name</th>
                <th className="p-3 font-semibold tracking-wider">Entity</th>
                <th className="p-3 font-semibold tracking-wider">Type & Size</th>
                <th className="p-3 font-semibold tracking-wider">Status / Level</th>
                <th className="p-3 font-semibold tracking-wider">Uploaded By</th>
                <th className="p-3 font-semibold tracking-wider">Date</th>
                <th className="p-3 font-semibold tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDocs.length === 0 ? (
                <tr>
                  <td colSpan={7} className={`p-6 text-center ${isDark ? 'text-[#d4c4b0]/40' : 'text-[#534434]/60'}`}>
                    <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    No documents found for this category.
                  </td>
                </tr>
              ) : (
                filteredDocs.map(doc => (
                  <tr key={doc.document_id} className={`border-b transition-colors ${isDark ? 'border-[#d4c4b0]/10 hover:bg-[#1e140d]/50' : 'border-[#d8c3ad]/30 hover:bg-[#fbf9f1]'}`}>
                    <td className={`p-3 font-medium max-w-[200px] truncate ${isDark ? 'text-[#d4c4b0]' : 'text-[#241A15]'}`} title={doc.original_filename}>
                      {doc.original_filename}
                    </td>
                    <td className={`p-3 ${isDark ? 'text-[#d4c4b0]/60' : 'text-[#534434]/80'}`}>
                      <span className="block text-[10px] uppercase font-bold">{doc.related_entity_type}</span>
                      <span className="truncate max-w-[120px] inline-block" title={doc.related_entity_id}>{doc.related_entity_id}</span>
                    </td>
                    <td className={`p-3 ${isDark ? 'text-[#d4c4b0]/60' : 'text-[#534434]/80'}`}>
                      <span className="block">{doc.mime_type.split('/')[1] || doc.mime_type}</span>
                      <span className="text-[10px] font-bold text-[#855300]">{formatSize(doc.size_bytes)}</span>
                    </td>
                    <td className="p-3">
                      <span className={`inline-block px-1.5 py-0.5 text-[9px] uppercase tracking-wider rounded-sm mr-2
                        ${doc.status === 'available' ? 'bg-green-900/40 text-green-400 border border-green-500/30' : 
                          doc.status === 'uploading' ? 'bg-yellow-900/40 text-yellow-400 border border-yellow-500/30' : 
                          'bg-red-900/40 text-red-400 border border-red-500/30'}`}>
                        {doc.status}
                      </span>
                      <span className="text-[10px] text-[#d4c4b0]/50 uppercase">{doc.access_level}</span>
                    </td>
                    <td className="p-3 text-[#d4c4b0]/60 truncate max-w-[100px]" title={doc.uploaded_by}>
                      {doc.uploaded_by}
                    </td>
                    <td className="p-3 text-[#d4c4b0]/60 text-[10px]">
                      {formatDate(doc.uploaded_at)}
                    </td>
                    <td className="p-3 text-right space-x-2">
                      <button onClick={() => handleAction(doc.document_id, 'view')} className="p-1.5 bg-[#d4c4b0]/10 hover:bg-[#f59e0b] hover:text-[#1e140d] transition-colors rounded-sm" title="View">
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleAction(doc.document_id, 'download')} className="p-1.5 bg-[#d4c4b0]/10 hover:bg-[#f59e0b] hover:text-[#1e140d] transition-colors rounded-sm" title="Download">
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      {(userRole === 'owner' || userRole === 'manager') && doc.status !== 'archived' && (
                        <button onClick={() => handleDelete(doc.document_id)} className="p-1.5 bg-[#d4c4b0]/10 hover:bg-red-500 hover:text-white transition-colors rounded-sm" title="Delete">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
