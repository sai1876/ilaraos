'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface UploadEvidenceDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  actor: { role: string };
}

export function UploadEvidenceDialog({ isOpen, onClose, onSuccess, actor }: UploadEvidenceDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState('');
  const [evidenceType, setEvidenceType] = useState('IMAGE');
  const [importance, setImportance] = useState<'NORMAL' | 'IMPORTANT'>('NORMAL');
  const [importanceReason, setImportanceReason] = useState('');
  const [relatedType, setRelatedType] = useState('');
  const [relatedId, setRelatedId] = useState('');
  
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [oversizedWarning, setOversizedWarning] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const canUploadImportant = ['owner', 'admin', 'manager'].includes(actor.role);

  const checkFileSize = (f: File, imp: 'NORMAL' | 'IMPORTANT') => {
    if (imp === 'IMPORTANT') return true;
    
    // Normal limits
    const mb = f.size / (1024 * 1024);
    if (f.type.startsWith('image/') && mb > 10) return false;
    if (f.type === 'application/pdf' && mb > 20) return false;
    if (f.type.startsWith('audio/') && mb > 20) return false;
    if (f.type.startsWith('video/')) return false;
    return true;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      setFile(selected);
      setOversizedWarning(false);
      setErrorMsg('');

      if (!checkFileSize(selected, importance)) {
        setOversizedWarning(true);
      }
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    if (importance === 'IMPORTANT' && !importanceReason.trim()) {
      setErrorMsg('Please provide a reason for IMPORTANT evidence.');
      return;
    }

    setIsUploading(true);
    setErrorMsg('');
    setProgress(0);
    
    try {
      if (importance === 'NORMAL') {
        setStatusText('Creating Evidence Record...');
        
        // 1. Intent
        const intentRes = await fetch('/api/evidence/upload-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            original_file_name: file.name,
            mime_type: file.type,
            declared_size_bytes: file.size,
            category: category || 'General',
            evidence_type: evidenceType,
            related_entities: relatedId ? [{ type: relatedType, id: relatedId }] : []
          })
        });

        if (!intentRes.ok) throw new Error(await intentRes.text());
        const { evidence_id, upload_url } = await intentRes.json();

        // 2. Upload
        setStatusText('Uploading...');
        await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('PUT', upload_url);
          xhr.setRequestHeader('Content-Type', file.type);
          
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              setProgress(Math.round((e.loaded / e.total) * 100));
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve(null);
            else reject(new Error('Upload Failed to Storage'));
          };
          
          xhr.onerror = () => reject(new Error('Network Interrupted'));
          xhr.send(file);
        });

        // 3. Finalize
        setStatusText('Verifying...');
        const finRes = await fetch(`/api/evidence/${evidence_id}/finalize`, { method: 'POST' });
        if (!finRes.ok) throw new Error(await finRes.text());
        
        alert('Evidence Active');
        onSuccess();
      } else {
        // IMPORTANT FLOW
        setStatusText('Creating Secure Archive Session...');
        
        // 1. Intent
        const intentRes = await fetch('/api/evidence/direct-archive-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            original_file_name: file.name,
            mime_type: file.type,
            declared_size_bytes: file.size,
            category: category || 'General',
            evidence_type: evidenceType,
            importance_reason: importanceReason,
            related_entities: relatedId ? [{ type: relatedType, id: relatedId }] : []
          })
        });

        if (!intentRes.ok) throw new Error(await intentRes.text());
        const { evidence_id, google_resumable_uri } = await intentRes.json();

        // 2. Upload to Drive Resumable
        setStatusText('Uploading to Secure Archive...');
        await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('PUT', google_resumable_uri);
          // Drive expects content type for resumable session chunk
          xhr.setRequestHeader('Content-Type', file.type);
          
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              setProgress(Math.round((e.loaded / e.total) * 100));
            }
          };

          xhr.onload = () => {
            if (xhr.status === 200 || xhr.status === 201) resolve(null);
            else reject(new Error(`Upload Failed: ${xhr.statusText}`));
          };
          
          xhr.onerror = () => reject(new Error('Network Interrupted'));
          xhr.send(file);
        });

        // 3. Finalize
        setStatusText('Verifying Archive...');
        const finRes = await fetch(`/api/evidence/${evidence_id}/finalize-direct-archive`, { method: 'POST' });
        if (!finRes.ok) throw new Error(await finRes.text());
        
        alert('Secure Archive Complete');
        onSuccess();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Something went wrong');
    } finally {
      setIsUploading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-[#111] border border-white/10 rounded-xl p-6 w-full max-w-xl text-white">
        <h2 className="text-xl font-bold mb-4">Add Evidence</h2>
        
        <div className="space-y-4">
          <div>
            <label className="text-sm text-gray-400 block mb-1">File</label>
            <input type="file" onChange={handleFileChange} className="w-full" disabled={isUploading} />
          </div>

          {oversizedWarning && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded text-sm space-y-2">
              <p>File exceeds active-storage limit.</p>
              {canUploadImportant && (
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="bg-red-500/20 text-red-400 hover:bg-red-500/30"
                  onClick={() => {
                    setImportance('IMPORTANT');
                    setOversizedWarning(false);
                  }}
                >
                  Upload as Important
                </Button>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-400 block mb-1">Category</label>
              <Input value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Refund" disabled={isUploading} />
            </div>
            <div>
              <label className="text-sm text-gray-400 block mb-1">Evidence Type</label>
              <Input value={evidenceType} onChange={e => setEvidenceType(e.target.value)} placeholder="IMAGE, PDF, AUDIO" disabled={isUploading} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-400 block mb-1">Related Entity Type</label>
              <Input value={relatedType} onChange={e => setRelatedType(e.target.value)} placeholder="ORDER" disabled={isUploading} />
            </div>
            <div>
              <label className="text-sm text-gray-400 block mb-1">Related Entity ID</label>
              <Input value={relatedId} onChange={e => setRelatedId(e.target.value)} placeholder="ORD-184" disabled={isUploading} />
            </div>
          </div>

          <div>
            <label className="text-sm text-gray-400 block mb-1">Importance</label>
            <div className="flex gap-2">
              <button 
                className={`flex-1 py-2 rounded text-sm ${importance === 'NORMAL' ? 'bg-blue-600 text-white' : 'bg-white/5 text-gray-400'}`}
                onClick={() => setImportance('NORMAL')}
                disabled={isUploading}
              >
                Normal
              </button>
              {canUploadImportant && (
                <button 
                  className={`flex-1 py-2 rounded text-sm ${importance === 'IMPORTANT' ? 'bg-amber-600 text-white' : 'bg-white/5 text-gray-400'}`}
                  onClick={() => {
                    setImportance('IMPORTANT');
                    setOversizedWarning(false);
                  }}
                  disabled={isUploading}
                >
                  Important
                </button>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {importance === 'NORMAL' 
                ? 'Stored in active storage temporarily. Automatically becomes eligible for secure archive after 72 hours.' 
                : 'Uploaded directly to the secure Google Drive archive. Temporary Supabase storage is bypassed.'}
            </p>
          </div>

          {importance === 'IMPORTANT' && (
            <div>
              <label className="text-sm text-gray-400 block mb-1">Reason for Importance</label>
              <Input value={importanceReason} onChange={e => setImportanceReason(e.target.value)} placeholder="Refund dispute, Serious complaint, etc." disabled={isUploading} />
            </div>
          )}

          {errorMsg && <div className="text-red-500 text-sm mt-2">{errorMsg}</div>}

          {isUploading && (
            <div className="mt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-300">{statusText}</span>
                <span className="text-gray-300">{progress}%</span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-2">
                <div className="bg-blue-500 h-2 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 mt-6">
            <Button variant="ghost" onClick={onClose} disabled={isUploading}>Cancel</Button>
            <Button onClick={handleUpload} disabled={isUploading || !file || oversizedWarning}>Upload</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
