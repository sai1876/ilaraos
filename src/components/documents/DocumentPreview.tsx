'use client';

import React, { useState, useEffect } from 'react';
import { X, Download, ExternalLink, RefreshCw, FileText, AlertCircle } from 'lucide-react';
import { getDocumentSignedUrl, DocumentRecord } from '@/features/documents/documentService';

interface DocumentPreviewProps {
  document: DocumentRecord | null;
  onClose: () => void;
}

export default function DocumentPreview({ document, onClose }: DocumentPreviewProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [imageError, setImageError] = useState(false);

  const loadPreview = () => {
    if (!document) {
      setSignedUrl(null);
      return;
    }

    setLoading(true);
    setError(null);
    setImageError(false);
    setSignedUrl(null);

    getDocumentSignedUrl(document.document_id, 'inline')
      .then((res) => {
        setSignedUrl(res.url);
      })
      .catch((err: any) => {
        console.error('Failed to get signed URL:', err);
        setError(err.message || 'Could not load private document preview');
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    loadPreview();
  }, [document]);

  if (!document) return null;

  const isImage = document.mime_type.startsWith('image/');
  const isPdf = document.mime_type === 'application/pdf';

  const handleDownload = async () => {
    try {
      const res = await getDocumentSignedUrl(document.document_id, 'download');
      window.open(res.url, '_blank');
    } catch (err: any) {
      alert(err.message || 'Failed to download document');
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#241A15]/75 backdrop-blur-sm" onClick={onClose} />

      <div className="bg-white border border-[#E8DFD3] rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl relative z-10 overflow-hidden">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-[#E8DFD3] flex items-center justify-between bg-[#FAF7F2]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-[#9A642C]/10 rounded-xl text-[#9A642C]">
              <FileText size={16} />
            </div>
            <div>
              <h3 className="font-serif font-bold text-sm text-[#241A15] truncate max-w-md">
                {document.original_filename}
              </h3>
              <p className="text-[10px] font-mono text-[#66554A]">
                {document.document_type.replace(/_/g, ' ')} • {(document.size_bytes / 1024).toFixed(1)} KB
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadPreview}
              className="p-2 rounded-xl bg-white border border-[#E8DFD3] text-[#66554A] hover:bg-[#F3ECE3] hover:text-[#241A15] transition-colors"
              title="Refresh Preview"
            >
              <RefreshCw size={14} />
            </button>
            <button
              onClick={handleDownload}
              className="p-2 rounded-xl bg-white border border-[#E8DFD3] text-[#66554A] hover:bg-[#F3ECE3] hover:text-[#241A15] transition-colors"
              title="Download File"
            >
              <Download size={14} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-white border border-[#E8DFD3] text-[#66554A] hover:bg-[#F3ECE3] transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Modal Content */}
        <div className="flex-1 p-5 overflow-auto flex items-center justify-center min-h-[300px] bg-zinc-900">
          {loading ? (
            <div className="flex flex-col items-center gap-2 text-white/70">
              <RefreshCw size={24} className="animate-spin text-[#C3924F]" />
              <span className="text-xs font-mono">Generating 300s secure signed link…</span>
            </div>
          ) : error ? (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          ) : signedUrl ? (
            isImage && !imageError ? (
              <img
                src={signedUrl}
                alt={document.original_filename}
                onError={() => setImageError(true)}
                className="max-h-[60vh] max-w-full object-contain rounded-lg shadow-md"
              />
            ) : isImage && imageError ? (
              <div className="flex flex-col items-center justify-center gap-3 text-white">
                <AlertCircle size={48} className="text-red-400/80" />
                <p className="text-xs font-mono text-zinc-300">Preview could not be displayed.</p>
                <div className="flex items-center gap-3 mt-2">
                  <button
                    onClick={loadPreview}
                    className="px-4 py-2 bg-zinc-800 text-white rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-zinc-700"
                  >
                    <RefreshCw size={12} /> Retry Preview
                  </button>
                  <a
                    href={signedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-zinc-800 text-white rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-zinc-700"
                  >
                    <ExternalLink size={12} /> Open File
                  </a>
                  <button
                    onClick={handleDownload}
                    className="px-4 py-2 bg-[#9A642C] text-white rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-[#805020]"
                  >
                    <Download size={12} /> Download
                  </button>
                </div>
              </div>
            ) : isPdf ? (
              <div className="w-full flex flex-col gap-2 h-full">
                <div className="flex justify-end">
                  <a
                    href={signedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 bg-zinc-800 text-white rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-zinc-700 transition-colors inline-flex w-max"
                  >
                    <span>Open in New Tab</span>
                    <ExternalLink size={12} />
                  </a>
                </div>
                <iframe
                  src={signedUrl}
                  title={document.original_filename}
                  className="w-full h-[60vh] rounded-lg border border-zinc-700 bg-white"
                />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 text-white">
                <FileText size={48} className="text-zinc-500" />
                <p className="text-xs font-mono text-zinc-300">Preview not natively supported for file type: {document.mime_type}</p>
                <a
                  href={signedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-[#9A642C] text-white rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-[#805020]"
                >
                  <span>Open in External Tab</span>
                  <ExternalLink size={12} />
                </a>
              </div>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}
