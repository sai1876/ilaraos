'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { EvidenceRecord } from '@/server/evidence/types';

interface EvidenceDetailDrawerProps {
  evidenceId: string;
  isOpen: boolean;
  onClose: () => void;
  actor: { role: string };
}

export function EvidenceDetailDrawer({ evidenceId, isOpen, onClose, actor }: EvidenceDetailDrawerProps) {
  const [record, setRecord] = useState<Partial<EvidenceRecord> | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessInfo, setAccessInfo] = useState<{ mode: string, url: string, mimeType?: string } | null>(null);
  const [accessError, setAccessError] = useState('');

  useEffect(() => {
    if (isOpen && evidenceId) {
      fetchDetail();
    }
  }, [isOpen, evidenceId]);

  const fetchDetail = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/evidence/${evidenceId}`);
      if (!res.ok) throw new Error('Failed to load evidence detail');
      setRecord(await res.json());
      
      // Auto-fetch access strategy
      await fetchAccess();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchAccess = async (purpose = 'VIEW') => {
    setAccessError('');
    try {
      const res = await fetch(`/api/evidence/${evidenceId}/access?purpose=${purpose}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      if (purpose === 'DOWNLOAD') {
        window.open(data.url, '_blank');
      } else {
        setAccessInfo(data);
      }
    } catch (err: any) {
      setAccessError(err.message || 'Access denied');
    }
  };

  if (!isOpen) return null;

  const renderPreview = () => {
    if (accessError) return <div className="p-4 bg-red-500/10 text-red-500 rounded">{accessError}</div>;
    if (!accessInfo) return <div className="text-gray-500 p-4">Loading preview...</div>;

    const mime = accessInfo.mimeType || '';
    if (mime.startsWith('image/')) {
      return <img src={accessInfo.url} alt="Evidence Preview" className="max-w-full h-auto rounded" />;
    }
    if (mime.startsWith('audio/')) {
      return <audio controls src={accessInfo.url} className="w-full" />;
    }
    if (mime.startsWith('video/')) {
      return <video controls src={accessInfo.url} className="w-full" />;
    }
    if (mime === 'application/pdf') {
      return <iframe src={accessInfo.url} className="w-full h-96 bg-white rounded" />;
    }
    return <div className="p-4 bg-white/5 rounded text-gray-400 text-center">Preview not available for this file type. Please download.</div>;
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50">
      <div className="bg-[#111] border-l border-white/10 w-full max-w-md h-full overflow-y-auto flex flex-col text-white shadow-2xl">
        <div className="p-4 border-b border-white/10 flex justify-between items-center bg-black/20">
          <h2 className="text-lg font-bold">Evidence Details</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </div>

        {loading ? (
          <div className="p-6 text-center text-gray-400">Loading...</div>
        ) : record ? (
          <div className="p-6 flex-1 space-y-6">
            <div>
              <h3 className="text-2xl font-mono font-bold">{record.evidence_no}</h3>
              <div className="flex gap-2 mt-2">
                <span className="px-2 py-1 bg-white/10 rounded-full text-xs">{record.category}</span>
                <span className="px-2 py-1 bg-white/10 rounded-full text-xs">{record.evidence_type}</span>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  record.importance === 'IMPORTANT' ? 'bg-amber-500/20 text-amber-500' : 
                  record.importance === 'CRITICAL' ? 'bg-red-500/20 text-red-500' : 'bg-blue-500/20 text-blue-500'
                }`}>
                  {record.importance}
                </span>
              </div>
            </div>

            <div className="bg-black/40 p-4 rounded-xl space-y-3">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="text-gray-400">Status</div>
                <div>{record.storage_state}</div>
                <div className="text-gray-400">Integrity</div>
                <div>{record.integrity_status || 'Pending'}</div>
                <div className="text-gray-400">Created At</div>
                <div>{record.created_at ? new Date((record.created_at as any)._seconds * 1000).toLocaleString() : 'N/A'}</div>
                
                {record.archive_due_at && (
                  <>
                    <div className="text-gray-400">Archive Due</div>
                    <div>{new Date((record.archive_due_at as any)._seconds * 1000).toLocaleString()}</div>
                  </>
                )}
                {record.archived_at && (
                  <>
                    <div className="text-gray-400">Archived At</div>
                    <div>{new Date((record.archived_at as any)._seconds * 1000).toLocaleString()}</div>
                  </>
                )}
              </div>
            </div>

            {record.related_entities && record.related_entities.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-gray-400 mb-2">Related Records</h4>
                <div className="space-y-2">
                  {record.related_entities.map((e, i) => (
                    <div key={i} className="flex justify-between items-center bg-white/5 px-3 py-2 rounded">
                      <span>{e.type} - {e.id}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h4 className="text-sm font-semibold text-gray-400 mb-2">Preview</h4>
              <div className="bg-black/40 rounded-xl overflow-hidden border border-white/5">
                {renderPreview()}
              </div>
              <div className="mt-4 flex gap-2">
                <Button className="w-full" variant="outline" onClick={() => fetchAccess('DOWNLOAD')}>
                  Download Securely
                </Button>
              </div>
            </div>

            {(actor.role === 'owner' || actor.role === 'admin') && (
              <div className="mt-8 pt-4 border-t border-white/10 text-xs text-gray-500 break-all">
                <p>Internal ID: {record.id}</p>
                {record.sha256 && <p>SHA256: {record.sha256}</p>}
                {record.provider_checksum && <p>Provider ({record.provider_checksum_algorithm}): {record.provider_checksum}</p>}
              </div>
            )}
          </div>
        ) : (
          <div className="p-6 text-center text-red-400">Record not found</div>
        )}
      </div>
    </div>
  );
}
