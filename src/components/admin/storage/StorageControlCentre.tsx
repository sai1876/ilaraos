'use client';
import React from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Database, FileText, Image as ImageIcon, FolderArchive, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function StorageControlCentre() {
  const metrics = [
    { title: 'Evidence & Proofs', count: 120, size: '4.2 GB', icon: FileText, color: 'text-amber-500' },
    { title: 'Voice Recordings', count: 340, size: '8.1 GB', icon: Database, color: 'text-purple-500' },
    { title: 'Chat Attachments', count: 85, size: '1.2 GB', icon: ImageIcon, color: 'text-blue-500' },
    { title: 'System Archives', count: 12, size: '200 MB', icon: FolderArchive, color: 'text-zinc-500' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Storage Control Centre</h2>
          <p className="text-zinc-500 mt-1">Manage external file storage, retention policies, and drive integrations.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((m, i) => (
          <Card key={i} className="bg-white border-zinc-200">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <m.icon className={`h-8 w-8 ${m.color} bg-opacity-10 p-1.5 rounded-lg bg-current`} />
              </div>
              <div className="mt-4">
                <p className="text-sm font-medium text-zinc-500">{m.title}</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-2xl font-semibold text-zinc-900">{m.size}</span>
                  <span className="text-sm text-zinc-500">({m.count} files)</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-white border-zinc-200">
        <CardHeader>
          <CardTitle>Recent Storage Activity</CardTitle>
          <CardDescription>File uploads and synchronization events</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-12 text-zinc-500 bg-zinc-50 rounded-lg border border-dashed border-zinc-200">
            <div className="text-center">
              <p>Activity log is populated by background outbox jobs.</p>
              <Button variant="outline" className="mt-4">
                Refresh Log
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
