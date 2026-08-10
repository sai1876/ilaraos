'use client';
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { HardDrive, CheckCircle2, AlertCircle } from 'lucide-react';

export default function GoogleDriveSettings({ searchParams }: { searchParams: URLSearchParams }) {
  const [loading, setLoading] = useState(false);
  const integrationStatus = searchParams.get('integration');

  const handleConnect = () => {
    setLoading(true);
    window.location.href = `/api/integrations/google-drive/connect?returnPath=${encodeURIComponent(window.location.pathname + window.location.search)}`;
  };

  return (
    <Card className="max-w-2xl bg-white border-zinc-200">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
            <HardDrive className="h-6 w-6" />
          </div>
          <div>
            <CardTitle className="text-xl">Google Drive Integration</CardTitle>
            <CardDescription className="text-zinc-500 mt-1">
              Connect your Google Workspace or personal Google Drive to store evidence, call recordings, and archives. 
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {integrationStatus === 'success' && (
          <div className="flex items-start gap-3 p-4 bg-green-50 text-green-700 rounded-lg border border-green-200">
            <CheckCircle2 className="h-5 w-5 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">Integration Successful</p>
              <p className="text-sm mt-1">Your Google Drive account has been connected and the standard folder hierarchy is being provisioned.</p>
            </div>
          </div>
        )}
        
        <div className="bg-zinc-50 p-4 rounded-lg border border-zinc-200 text-sm text-zinc-600">
          <p className="font-semibold text-zinc-900 mb-2">How it works:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>IlaraOS will create an <strong>IlaraOS-System</strong> folder in your Drive.</li>
            <li>We only request access to files created by the application (<code>drive.file</code> scope).</li>
            <li>Files are securely isolated per-tenant.</li>
            <li>No files are ever made public; they are streamed through the IlaraOS backend.</li>
          </ul>
        </div>

        <div className="flex justify-end pt-2">
          <Button 
            onClick={handleConnect} 
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {loading ? 'Connecting...' : 'Connect Google Drive'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
