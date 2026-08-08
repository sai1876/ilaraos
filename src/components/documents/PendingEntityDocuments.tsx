'use client';

import React, { useState, useEffect } from 'react';
import { FolderOpen, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { DocumentRecord, fetchEntityDocuments } from '@/features/documents/documentService';
import DocumentCard from './DocumentCard';
import DocumentUploader from './DocumentUploader';

export interface EvidenceRequirement {
  id?: string;
  label: string;
  anyOf: string[];
  min?: number;
}

export interface PendingEntityDocumentsProps {
  entityType: string;
  entityId: string;
  category?: DocumentRecord['category'];
  allowedDocumentTypes?: string[];
  requirements?: EvidenceRequirement[];
  maxFiles?: number;
  onDocumentsChanged?: (documents: DocumentRecord[], allRequirementsMet: boolean) => void;
  title?: string;
}

export default function PendingEntityDocuments({
  entityType,
  entityId,
  category = 'evidence',
  allowedDocumentTypes,
  requirements = [],
  maxFiles = 10,
  onDocumentsChanged,
  title = 'Evidence & Documents',
}: PendingEntityDocumentsProps) {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const res = await fetchEntityDocuments(entityType, entityId);
      // We only care about available or pending docs for this entity.
      const validDocs = (res.documents || []).filter(
        (d) => d.status === 'available' || d.status === 'uploading' || d.attachment_state === 'pending_entity'
      );
      setDocuments(validDocs);
      checkRequirements(validDocs);
    } catch (err) {
      console.error(`Failed to fetch pending documents for ${entityType}:${entityId}:`, err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (entityId) {
      loadDocuments();
    }
  }, [entityType, entityId]);

  const checkRequirements = (currentDocs: DocumentRecord[]) => {
    if (!onDocumentsChanged) return;
    
    const attachedTypes = new Set(currentDocs.map((d) => d.document_type));
    
    let allSatisfied = true;
    for (const req of requirements) {
      let matchCount = 0;
      for (const t of req.anyOf) {
        if (attachedTypes.has(t)) matchCount++;
      }
      if (matchCount < (req.min || 1)) {
        allSatisfied = false;
        break;
      }
    }
    
    onDocumentsChanged(currentDocs, allSatisfied);
  };

  const handleUploadSuccess = (newDoc: DocumentRecord) => {
    const updated = [newDoc, ...documents];
    setDocuments(updated);
    checkRequirements(updated);
  };

  const attachedTypes = new Set(documents.map((d) => d.document_type));
  
  const getSatisfiedCount = () => {
    let count = 0;
    requirements.forEach(req => {
      let matchCount = 0;
      for (const t of req.anyOf) {
        if (attachedTypes.has(t)) matchCount++;
      }
      if (matchCount >= (req.min || 1)) {
        count++;
      }
    });
    return count;
  };

  const satisfiedCount = getSatisfiedCount();
  const isFullySatisfied = requirements.length === 0 || satisfiedCount === requirements.length;

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
            {requirements.length > 0 && (
              <span className={`text-[9px] font-mono font-bold ${isFullySatisfied ? 'text-emerald-700' : 'text-red-600'}`}>
                {satisfiedCount} / {requirements.length} required proof complete
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={loadDocuments}
          className="p-1.5 rounded-lg text-[#66554A] hover:bg-[#FAF7F2] transition-colors cursor-pointer"
          title="Refresh pending documents"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Complex Requirement Badges */}
      {requirements.length > 0 && (
        <div className="flex flex-col gap-2">
          {requirements.map((req, idx) => {
            let matchCount = 0;
            for (const t of req.anyOf) {
              if (attachedTypes.has(t)) matchCount++;
            }
            const isSatisfied = matchCount >= (req.min || 1);

            return (
              <div key={idx} className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs font-mono ${isSatisfied ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
                <div className="flex items-center gap-2">
                  {isSatisfied ? <CheckCircle2 size={14} className="text-emerald-600" /> : <AlertCircle size={14} className="text-red-600" />}
                  <span className="font-bold">{req.label}</span>
                </div>
                {!isSatisfied && <span className="uppercase text-[9px] font-bold tracking-widest">Required</span>}
              </div>
            );
          })}
        </div>
      )}

      {/* Document Uploader */}
      {documents.length < maxFiles && (
        <DocumentUploader
          entityType={entityType}
          entityId={entityId}
          category={category}
          defaultDocumentType={allowedDocumentTypes?.[0] || 'evidence'}
          allowedDocumentTypes={allowedDocumentTypes}
          onUploadSuccess={handleUploadSuccess}
        />
      )}

      {/* Attached Documents List */}
      {loading ? (
        <div className="py-6 text-center text-xs font-mono text-[#66554A]">Loading pending documents…</div>
      ) : documents.length === 0 ? (
        <div className="py-6 text-center text-xs font-mono text-[#66554A] bg-[#FAF7F2] rounded-xl border border-dashed border-[#E8DFD3]">
          No documents attached to this pending record yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {documents.map((doc) => (
            <DocumentCard
              key={doc.document_id}
              document={doc}
              readOnly={false}
            />
          ))}
        </div>
      )}
    </div>
  );
}
