'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { auth } from '@/lib/firebase';
import { X, QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  staffId: string;
  staffName: string;
  onSuccess: () => void;
  userRole?: string;
}

export default function FaceEnrollmentModal({ isOpen, onClose, staffId, staffName, onSuccess, userRole }: Props) {
  const isDark = userRole !== 'manager';
  const [enrollSessionId, setEnrollSessionId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [hostUrl, setHostUrl] = useState('');

  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined') {
      // Auto-detect the current browser domain & port (e.g. http://192.168.1.7:3000)
      setHostUrl(window.location.origin);
    }
  }, [isOpen]);

  useEffect(() => {
    let active = true;
    const initSession = async () => {
      if (isOpen && staffId) {
        try {
          const idToken = await auth.currentUser?.getIdToken();
          const res = await fetch('/api/operations/biometrics/session', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({ type: 'enroll', staff_id: staffId })
          });
          if (!res.ok) throw new Error('Failed to create session');
          const data = await res.json();
          if (active) setEnrollSessionId(data.session_id);
        } catch (err) {
          console.error(err);
        }
      } else {
        setEnrollSessionId(null);
      }
    };
    initSession();
    return () => { active = false; };
  }, [isOpen, staffId]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    let active = true;
    if (isOpen && enrollSessionId) {
      const checkStatus = async () => {
        try {
          const res = await fetch(`/api/operations/biometrics/session?session_id=${enrollSessionId}`);
          if (res.status === 410 || res.status === 404) {
            return;
          }
          if (res.ok) {
            const data = await res.json();
            if (data.status === 'success') {
              onSuccess();
              onClose();
              return;
            }
          }
        } catch (err) {
          console.error(err);
        }
        if (active) timer = setTimeout(checkStatus, 2000);
      };
      checkStatus();
    }
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [isOpen, enrollSessionId]);

  if (!isOpen || !mounted) return null;

  const scannerLink = `${hostUrl || 'http://localhost:3000'}/scanner?session_id=${enrollSessionId || ''}`;

  return createPortal(
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md ${isDark ? '' : 'theme-light-override'}`}>
      <div className="bg-[#120a06] border border-[#302117] rounded-3xl p-6 md:p-8 max-w-md w-full relative overflow-hidden shadow-2xl">
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 text-[#d4c4b0]/60 hover:text-white transition-colors z-10"
        >
          <X size={20} />
        </button>

        <div className="relative z-10 flex flex-col items-center text-center gap-4">
          <div>
            <h3 className="text-xl font-serif italic text-[#f8bc51] font-bold">Enroll Biometrics</h3>
            <p className="text-[10px] font-mono text-[#d4c4b0]/60 uppercase tracking-widest mt-1">
              Registering: {staffName}
            </p>
          </div>

          <div className="bg-white p-4 rounded-3xl mx-auto shadow-[0_0_30px_rgba(248,188,81,0.2)] mt-2">
            {enrollSessionId ? (
              <QRCodeSVG 
                value={scannerLink}
                size={200}
                level="H"
                includeMargin={false}
                fgColor="#0A0604"
              />
            ) : (
              <div className="w-[200px] h-[200px] flex items-center justify-center text-xs font-mono text-gray-400">
                Generating session...
              </div>
            )}
          </div>

          <div className="w-full flex flex-col gap-1 text-left px-2">
            <label className="text-[9px] font-mono text-[#d4c4b0]/60 uppercase tracking-widest">
              Server Host URL (Edit if using phone on local Wi-Fi)
            </label>
            <input 
              type="text" 
              value={hostUrl} 
              onChange={(e) => setHostUrl(e.target.value)} 
              className="bg-[#070402] border border-[#302117] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#f8bc51] w-full font-mono"
              placeholder="e.g. http://192.168.1.7:3000"
            />
          </div>

          <div className="mt-1">
            <h3 className="text-sm font-mono text-[#f8bc51] font-bold flex justify-center items-center gap-2">
              <QrCode size={16} />
              High-Res Mobile Capture
            </h3>
            <p className="text-[10px] font-mono text-[#d4c4b0]/60 uppercase tracking-widest mt-1 px-4 leading-relaxed">
              Scan with your phone to use its high-resolution camera for biometric registration.
            </p>
          </div>
          
          <div className="w-full mt-1 bg-[#f8bc51]/10 border border-[#f8bc51]/30 py-2 px-6 rounded-xl">
             <a 
               href={scannerLink}
               target="_blank"
               rel="noreferrer"
               className="text-[#f8bc51] font-mono text-[9px] uppercase tracking-widest hover:underline flex justify-center items-center gap-1"
             >
               Open on this PC (Testing)
             </a>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
