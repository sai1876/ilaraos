'use client';

import React, { useState, useEffect } from 'react';
import { FolderOpen, RefreshCw } from 'lucide-react';
import { DocumentRecord, fetchEntityDocuments } from '@/features/documents/documentService';
import DocumentCard from './DocumentCard';
import DocumentUploader from './DocumentUploader';
import DocumentRequirement from './DocumentRequirement';
import DocumentPreview from './DocumentPreview';

export interface EntityDocumentsPanelProps {
  entityType: string;
  entityId: string;
  category?: DocumentRecord['category'];
  allowedDocumentTypes?: string[];
  requiredDocumentTypes?: string[];
  maxFiles?: number;
  readOnly?: boolean;
  canUpload?: boolean;
  onDocumentsChanged?: (documents: DocumentRecord[]) => void;
  onOpenRelated?: (type: string, id: string) => void;
  title?: string;
}

export default function EntityDocumentsPanel({
  entityType,
  entityId,
  category = 'evidence',
  allowedDocumentTypes,
  requiredDocumentTypes = [],
  maxFiles = 10,
  readOnly = false,
  canUpload = true,
  onDocumentsChanged,
  onOpenRelated,
  title = 'Evidence & Documents',
}: EntityDocumentsPanelProps) {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewDoc, setPreviewDoc] = useState<DocumentRecord | null>(null);

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const res = await fetchEntityDocuments(entityType, entityId);
      setDocuments(res.documents || []);
      if (onDocumentsChanged) onDocumentsChanged(res.documents || []);
    } catch (err) {
      console.error(`Failed to fetch documents for ${entityType}:${entityId}:`, err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (entityId) {
      loadDocuments();
    }
  }, [entityType, entityId]);

  const handleUploadSuccess = (newDoc: DocumentRecord) => {
    const updated = [newDoc, ...documents];
    setDocuments(updated);
    if (onDocumentsChanged) onDocumentsChanged(updated);
  };

  // Check required document satisfaction
  const attachedTypes = new Set(documents.map((d) => d.document_type));
  const satisfiedCount = requiredDocumentTypes.filter((req) => attachedTypes.has(req)).length;
  const isFullySatisfied = requiredDocumentTypes.length === 0 || satisfiedCount === requiredDocumentTypes.length;

  return (
    <div className="bg-[#FFFDFC] border border-[#E8DFD3] rounded-2xl p-4 shadow-sm flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#E8DFD3] pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-[#9A642C]/10 rounded-lg text-[#9A642C]">
            <FolderOpen size={16} />
          </div>
          <div>
            <h3 className="font-serif font-bold text-xs text-[#241A15]">{title}</h3>
            {requiredDocumentTypes.length > 0 && (
              <span className={`text-[9px] font-mono font-bold ${isFullySatisfied ? 'text-emerald-700' : 'text-red-600'}`}>
                {satisfiedCount} / {requiredDocumentTypes.length} required proof complete
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={loadDocuments}
          className="p-1.5 rounded-lg text-[#66554A] hover:bg-[#FAF7F2] transition-colors"
          title="Refresh documents"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Required Document Badges */}
      {requiredDocumentTypes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {requiredDocumentTypes.map((reqType) => (
            <DocumentRequirement
              key={reqType}
              type={reqType}
              isSatisfied={attachedTypes.has(reqType)}
            />
          ))}
        </div>
      )}

      {/* Document Uploader */}
      {!readOnly && canUpload && documents.length < maxFiles && (
        <DocumentUploader
          entityType={entityType}
          entityId={entityId}
          category={category}
          defaultDocumentType={requiredDocumentTypes[0] || allowedDocumentTypes?.[0] || 'evidence'}
          allowedDocumentTypes={allowedDocumentTypes || requiredDocumentTypes}
          onUploadSuccess={handleUploadSuccess}
        />
      )}

      {/* Attached Documents List */}
      {loading ? (
        <div className="py-6 text-center text-xs font-mono text-[#66554A]">Loading entity documents…</div>
      ) : documents.length === 0 ? (
        <div className="py-6 text-center text-xs font-mono text-[#66554A] bg-[#FAF7F2] rounded-xl border border-dashed border-[#E8DFD3]">
          No documents attached to this record.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {documents.map((doc) => (
            <DocumentCard
              key={doc.document_id}
              document={doc}
              onPreview={(d) => setPreviewDoc(d)}
              onOpenRelated={onOpenRelated}
              readOnly={readOnly}
            />
          ))}
        </div>
      )}

      {/* Preview Modal */}
      {previewDoc && (
        <DocumentPreview document={previewDoc} onClose={() => setPreviewDoc(null)} />
      )}
    </div>
  );
}
