'use client';

import React, { useState, useRef } from 'react';
import { Upload, Camera, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { uploadAndAttachDocument, DocumentRecord } from '@/features/documents/documentService';

interface DocumentUploaderProps {
  entityType: string;
  entityId: string;
  category?: DocumentRecord['category'];
  defaultDocumentType?: string;
  allowedDocumentTypes?: string[];
  onUploadSuccess: (doc: DocumentRecord) => void;
  disabled?: boolean;
}

export default function DocumentUploader({
  entityType,
  entityId,
  category = 'evidence',
  defaultDocumentType = 'evidence',
  allowedDocumentTypes,
  onUploadSuccess,
  disabled = false,
}: DocumentUploaderProps) {
  const [selectedType, setSelectedType] = useState(defaultDocumentType);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const doc = await uploadAndAttachDocument(file, {
        category,
        documentType: selectedType,
        relatedEntityType: entityType,
        relatedEntityId: entityId,
      });

      setSuccessMsg(`Uploaded ${file.name} successfully.`);
      setTimeout(() => setSuccessMsg(null), 4000);
      onUploadSuccess(doc);
    } catch (err: any) {
      console.error('Document upload failed:', err);
      setErrorMsg(err.message || 'Failed to upload document');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (cameraInputRef.current) cameraInputRef.current.value = '';
    }
  };

  return (
    <div className="flex flex-col gap-3 bg-[#FAF7F2] border border-[#E8DFD3] rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#66554A]">
          Attach Supporting Document / Evidence
        </label>
        {allowedDocumentTypes && allowedDocumentTypes.length > 0 && (
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            disabled={disabled || isUploading}
            className="bg-white border border-[#E8DFD3] rounded-lg px-2 py-1 text-[10px] font-mono text-[#241A15] outline-none"
          >
            {allowedDocumentTypes.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        )}
      </div>

      {errorMsg && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-700 p-2.5 rounded-xl text-xs flex items-center gap-2">
          <AlertCircle size={14} className="shrink-0 text-red-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-2.5 rounded-xl text-xs flex items-center gap-2">
          <CheckCircle2 size={14} className="shrink-0 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        disabled={disabled || isUploading}
        className="hidden"
        accept="image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.csv,.xlsx"
      />

      <input
        type="file"
        ref={cameraInputRef}
        onChange={handleFileChange}
        disabled={disabled || isUploading}
        className="hidden"
        accept="image/*"
        capture="environment"
      />

      <div className="flex gap-2">
        <button
          type="button"
          disabled={disabled || isUploading}
          onClick={() => fileInputRef.current?.click()}
          className="flex-1 py-2.5 px-3 rounded-xl bg-white border border-[#E8DFD3] hover:border-[#9A642C] text-[#241A15] font-sans font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-50 cursor-pointer"
        >
          {isUploading ? (
            <Loader2 size={14} className="animate-spin text-[#9A642C]" />
          ) : (
            <Upload size={14} className="text-[#9A642C]" />
          )}
          <span>{isUploading ? 'Uploading…' : 'Choose File / Gallery'}</span>
        </button>

        <button
          type="button"
          disabled={disabled || isUploading}
          onClick={() => cameraInputRef.current?.click()}
          className="py-2.5 px-3 rounded-xl bg-white border border-[#E8DFD3] hover:border-[#9A642C] text-[#241A15] font-sans font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all disabled:opacity-50 cursor-pointer"
          title="Take Photo with Camera"
        >
          <Camera size={14} className="text-[#9A642C]" />
          <span className="hidden sm:inline">Camera</span>
        </button>
      </div>
    </div>
  );
}
