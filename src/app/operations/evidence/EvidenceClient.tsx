'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { UploadEvidenceDialog } from './components/UploadEvidenceDialog';
import { EvidenceDetailDrawer } from './components/EvidenceDetailDrawer';
import { EvidenceRecord } from '@/server/evidence/types';

interface EvidenceClientProps {
  actor: {
    uid: string;
    role: string;
    staffId?: string;
    outletId?: string;
  };
}

export default function EvidenceClient({ actor }: EvidenceClientProps) {
  const [evidenceList, setEvidenceList] = useState<Partial<EvidenceRecord>[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string | null>(null);

  // Search/Filters
  const [searchNumber, setSearchNumber] = useState('');
  const [searchEntity, setSearchEntity] = useState('');
  const categoryFilter = '';
  const importanceFilter = '';

  const fetchEvidence = async (cursor?: string, reset = false) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (cursor) params.append('cursor', cursor);
      if (searchNumber) params.append('evidenceNo', searchNumber);
      if (searchEntity) params.append('relatedEntityKey', searchEntity);
      if (categoryFilter) params.append('category', categoryFilter);
      if (importanceFilter) params.append('importance', importanceFilter);

      const res = await fetch(`/api/evidence?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load evidence');
      const data = await res.json();
      
      if (reset) {
        setEvidenceList(data.items);
      } else {
        setEvidenceList(prev => [...prev, ...data.items]);
      }
      setNextCursor(data.nextCursor);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEvidence(undefined, true);
  }, [searchNumber, searchEntity, categoryFilter, importanceFilter]);

  const handleUploadSuccess = () => {
    setIsUploading(false);
    fetchEvidence(undefined, true);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight">Evidence / ProofOps</h1>
        {(actor.role === 'owner' || actor.role === 'admin' || actor.role === 'manager') && (
          <Button onClick={() => setIsUploading(true)}>Add Evidence</Button>
        )}
      </div>

      {/* Metrics (Fresh-on-load) */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {/* Placeholder for metrics, can be calculated or fetched separately */}
        <Card className="p-4 bg-white/5 border border-white/10"><div className="text-sm text-gray-400">Total</div><div className="text-2xl font-bold">{evidenceList.length}+</div></Card>
      </div>

      <div className="flex gap-4 mb-4">
        <Input 
          placeholder="Search by Evidence No (EV-...)" 
          value={searchNumber}
          onChange={e => setSearchNumber(e.target.value)}
          className="w-64"
        />
        <Input 
          placeholder="Search by Related (ORDER:123)" 
          value={searchEntity}
          onChange={e => setSearchEntity(e.target.value)}
          className="w-64"
        />
        {/* additional filters... */}
      </div>

      <div className="rounded-md border border-white/10 overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-white/5 border-b border-white/10">
            <tr>
              <th className="px-4 py-3 font-medium">Evidence No</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Importance</th>
              <th className="px-4 py-3 font-medium">State</th>
              <th className="px-4 py-3 font-medium">Created</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {evidenceList.map((ev, i) => (
              <tr key={ev.id || i} className="hover:bg-white/5">
                <td className="px-4 py-3 font-mono">{ev.evidence_no}</td>
                <td className="px-4 py-3">{ev.category}</td>
                <td className="px-4 py-3">{ev.evidence_type}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    ev.importance === 'IMPORTANT' ? 'bg-amber-500/20 text-amber-500' : 
                    ev.importance === 'CRITICAL' ? 'bg-red-500/20 text-red-500' : 'bg-white/10'
                  }`}>
                    {ev.importance}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    ev.storage_state === 'ACTIVE' ? 'bg-blue-500/20 text-blue-500' :
                    ev.storage_state === 'ARCHIVED' ? 'bg-green-500/20 text-green-500' :
                    ev.storage_state?.includes('FAILED') ? 'bg-red-500/20 text-red-500' : 'bg-white/10'
                  }`}>
                    {ev.storage_state === 'ACTIVE' ? 'Active Storage' : 
                     ev.storage_state === 'ARCHIVED' ? 'Secure Archive' : 
                     ev.storage_state === 'DELETE_FAILED' ? 'Archive Verified • Cleanup Pending' :
                     ev.storage_state?.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-400">
                  {ev.created_at ? new Date(((ev.created_at as any)._seconds || 0) * 1000 || (ev.created_at as any)).toLocaleDateString() : 'N/A'}
                </td>
                <td className="px-4 py-3">
                  <Button variant="ghost" size="sm" onClick={() => setSelectedEvidenceId(ev.id!)}>View</Button>
                </td>
              </tr>
            ))}
            {evidenceList.length === 0 && !isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  No evidence recorded yet. Evidence uploaded through Ilara operations will appear here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      
      {nextCursor && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => fetchEvidence(nextCursor)} disabled={isLoading}>
            {isLoading ? 'Loading...' : 'Load More'}
          </Button>
        </div>
      )}

      {isUploading && (
        <UploadEvidenceDialog 
          isOpen={isUploading} 
          onClose={() => setIsUploading(false)} 
          onSuccess={handleUploadSuccess} 
          actor={actor} 
        />
      )}

      {selectedEvidenceId && (
        <EvidenceDetailDrawer
          evidenceId={selectedEvidenceId}
          isOpen={!!selectedEvidenceId}
          onClose={() => setSelectedEvidenceId(null)}
          actor={actor}
        />
      )}
    </div>
  );
}
