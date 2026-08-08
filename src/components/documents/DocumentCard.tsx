'use client';

import React from 'react';
import { Eye, Download, FileText, Lock, Calendar, User, HardDrive } from 'lucide-react';
import { DocumentRecord, getDocumentSignedUrl } from '@/features/documents/documentService';
import DocumentTypeBadge from './DocumentTypeBadge';

interface DocumentCardProps {
  document: DocumentRecord;
  onPreview?: (doc: DocumentRecord) => void;
  onOpenRelated?: (type: string, id: string) => void;
  readOnly?: boolean;
}

export default function DocumentCard({ document, onPreview, onOpenRelated }: DocumentCardProps) {
  const formattedSize = (document.size_bytes / 1024).toFixed(1);
  const formattedDate = new Date(document.uploaded_at).toLocaleString('en-IN', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  });

  const handleDownload = async () => {
    try {
      const res = await getDocumentSignedUrl(document.document_id, 'download');
      window.open(res.url, '_blank');
    } catch (err: any) {
      alert(err.message || 'Failed to download document');
    }
  };

  return (
    <div className="bg-white border border-[#E8DFD3] rounded-2xl p-3.5 shadow-sm hover:border-[#9A642C]/40 transition-all flex flex-col justify-between gap-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="p-2 bg-[#FAF7F2] border border-[#E8DFD3] rounded-xl text-[#9A642C] shrink-0">
            <FileText size={16} />
          </div>
          <div className="overflow-hidden">
            <h4 className="font-sans font-bold text-xs text-[#241A15] truncate" title={document.original_filename}>
              {document.original_filename}
            </h4>
            <div className="flex items-center gap-1.5 mt-0.5">
              <DocumentTypeBadge documentType={document.document_type} />
              {document.access_level === 'private' && (
                <span className="text-[8px] font-mono font-bold text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                  <Lock size={8} />
                  <span>Private</span>
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {onPreview && (
            <button
              onClick={() => onPreview(document)}
              className="p-1.5 rounded-lg bg-[#FAF7F2] hover:bg-[#F3ECE3] text-[#9A642C] transition-colors"
              title="View Document"
            >
              <Eye size={14} />
            </button>
          )}
          <button
            onClick={handleDownload}
            className="p-1.5 rounded-lg bg-[#FAF7F2] hover:bg-[#F3ECE3] text-[#66554A] transition-colors"
            title="Download Document"
          >
            <Download size={14} />
          </button>
        </div>
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-2 gap-2 text-[9px] font-mono text-[#66554A] bg-[#FAF7F2] p-2 rounded-xl border border-[#E8DFD3]/60">
        <div className="flex items-center gap-1">
          <User size={10} className="text-[#9A642C]" />
          <span className="truncate">{document.uploaded_by_role || 'staff'}</span>
        </div>
        <div className="flex items-center gap-1">
          <Calendar size={10} className="text-[#9A642C]" />
          <span>{formattedDate}</span>
        </div>
        <div className="flex items-center gap-1">
          <HardDrive size={10} className="text-[#9A642C]" />
          <span>{formattedSize} KB</span>
        </div>
        {document.invoice_number && (
          <div className="truncate font-bold text-[#241A15]">
            Inv: #{document.invoice_number}
          </div>
        )}
      </div>

      {/* Open Related Entity Link */}
      {onOpenRelated && document.related_entity_type && document.related_entity_id && (
        <button
          onClick={() => onOpenRelated(document.related_entity_type, document.related_entity_id)}
          className="text-[9px] font-mono font-bold text-[#9A642C] hover:underline self-start uppercase tracking-wider"
        >
          Open Record ({document.related_entity_type}: #{document.related_entity_id.slice(-6)})
        </button>
      )}
    </div>
  );
}
