'use client';

import React, { useState, useEffect, useRef } from 'react';
import * as faceapi from '@vladmandic/face-api';
import { RefreshCw, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';

export default function MobileScanner() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionType, setSessionType] = useState<'verify' | 'enroll'>('verify');
  const [status, setStatus] = useState<'initializing' | 'loading_models' | 'fetching_rider' | 'scanning' | 'success' | 'failed' | 'expired'>('initializing');
  const [errorMsg, setErrorMsg] = useState('');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const startedRef = useRef(false);

  // Refs to prevent stale closures in setInterval
  const statusRef = useRef(status);
  const sessionIdRef = useRef(sessionId);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sid = params.get('session_id');
    if (sid) {
      setSessionId(sid);
      if (!startedRef.current) {
        startedRef.current = true;
        initializeScanner(sid);
      }
    } else {
      setStatus('expired');
      setErrorMsg('Invalid QR Code. No session ID found.');
    }
    
    return () => {
      stopCamera();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (statusRef.current === 'scanning') {
      stopCamera();
      startCamera();
    }
  }, [facingMode]);

  const initializeScanner = async (sid: string) => {
    setStatus('initializing');
    try {
      // Load face-api models
      setStatus('loading_models');
      await faceapi.nets.ssdMobilenetv1.loadFromUri('/models');
      await faceapi.nets.faceLandmark68Net.loadFromUri('/models');
      await faceapi.nets.faceRecognitionNet.loadFromUri('/models');
      
      // Fetch scan session from operational API
      setStatus('fetching_rider');
      const res = await fetch(`/api/operations/biometrics/session?session_id=${sid}`);
      if (!res.ok) {
        throw new Error('Verification session has expired or is invalid.');
      }
      const data = await res.json();
      
      setSessionType(data.type);
      setStatus('scanning');
      startCamera();
    } catch (e) {
      console.error(e);
      setStatus('failed');
      setErrorMsg(e instanceof Error ? e.message : String(e));
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(err => {
          // Play can be safely aborted if we stop camera immediately after a match
          if (err.name !== 'AbortError') {
            console.error("Video play error:", err);
          }
        });
        
        // Start recognition loop
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = setInterval(performRecognition, 1000);
      }
    } catch (err) {
      console.error(err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setErrorMsg(`Camera error: ${errorMessage}`);
      setStatus('failed');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const performRecognition = async () => {
    // Only perform if scanning
    if (!videoRef.current || statusRef.current !== 'scanning') return;

    try {
      const detection = await faceapi.detectSingleFace(videoRef.current).withFaceLandmarks().withFaceDescriptor();
      if (detection && statusRef.current === 'scanning') {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setStatus('fetching_rider');
        stopCamera();
        
        await sendResult(Array.from(detection.descriptor));
      }
    } catch (e) {
      console.error("Detection error:", e);
    }
  };

  const sendResult = async (descriptorArray: number[]) => {
    const currentSessionId = sessionIdRef.current;
    if (!currentSessionId) {
      console.warn("sendResult called but sessionId is null");
      return;
    }
    
    try {
      const res = await fetch('/api/operations/biometrics/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: currentSessionId, descriptor: descriptorArray })
      });
      
      const data = await res.json();
      if (res.ok && data.success) {
        setStatus('success');
      } else {
        setStatus('failed');
        setErrorMsg(data.error || 'Verification failed');
      }
    } catch (e) {
      console.error(e);
      setStatus('failed');
      setErrorMsg('Network error during verification.');
    }
  };

  return (
    <div className="min-h-screen bg-[#070402] text-white flex flex-col font-sans">
      <header className="p-5 border-b border-[#302117] flex justify-center items-center bg-[#120a06]">
        <h1 className="font-serif italic text-[#f8bc51] text-2xl font-black">Ilara Cafe AI Scanner</h1>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-6 relative">
        {status === 'initializing' && (
          <div className="flex flex-col items-center text-[#d4c4b0]/50 gap-4">
            <RefreshCw className="animate-spin" size={32} />
            <span className="font-mono text-xs uppercase tracking-widest">Connecting to session...</span>
          </div>
        )}
        
        {status === 'loading_models' && (
          <div className="flex flex-col items-center text-[#f8bc51] gap-4">
            <RefreshCw className="animate-spin" size={32} />
            <span className="font-mono text-xs uppercase tracking-widest">Loading Neural Networks...</span>
          </div>
        )}

        {status === 'fetching_rider' && (
          <div className="flex flex-col items-center text-[#60A5FA] gap-4">
            <RefreshCw className="animate-spin" size={32} />
            <span className="font-mono text-xs uppercase tracking-widest">Processing Biometrics...</span>
          </div>
        )}

        {status === 'expired' && (
          <div className="flex flex-col items-center text-red-400 gap-4 text-center">
            <AlertTriangle size={48} />
            <h2 className="text-xl font-bold font-mono">Invalid Session</h2>
            <p className="text-sm font-mono opacity-70">{errorMsg}</p>
          </div>
        )}

        {status === 'scanning' && (
          <div className="flex flex-col items-center w-full h-full justify-between gap-8">
            <div className="text-center">
              <h2 className="font-mono uppercase tracking-widest text-sm text-[#60A5FA]">
                {sessionType === 'enroll' ? 'Biometric Enrollment' : 'Identity Verification'}
              </h2>
              <p className="text-[#d4c4b0]/60 text-xs mt-2 font-mono">
                {sessionType === 'enroll' ? 'AI Active. Hold still to register face.' : 'AI Active. Look at the camera.'}
              </p>
            </div>
            
            <div className="relative w-full max-w-sm aspect-[3/4] bg-[#120a06] rounded-3xl overflow-hidden border-4 border-[#60A5FA] shadow-[0_0_50px_rgba(96,165,250,0.2)]">
              <video 
                ref={videoRef}
                autoPlay 
                playsInline 
                muted 
                className="w-full h-full object-cover bg-black"
              />
              
              <div className="absolute inset-0 border-2 border-[#60A5FA] rounded-3xl animate-ping opacity-10 pointer-events-none"></div>
              <div className="absolute top-0 left-0 w-full h-[3px] bg-[#60A5FA] shadow-[0_0_15px_#60A5FA] pointer-events-none" style={{ animation: 'scan 1.5s linear infinite' }}>
                <style>{`
                  @keyframes scan {
                    0% { top: 0%; }
                    50% { top: 98%; }
                    100% { top: 0%; }
                  }
                `}</style>
              </div>

              {!streamRef.current && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm">
                  <span className="font-mono text-xs uppercase tracking-widest text-[#60A5FA] animate-pulse">Waiting for camera...</span>
                </div>
              )}
            </div>
            
            {/* Fail button kept for hard overrides/testing timeout manually if needed */}
            <div className="w-full max-w-sm flex gap-4">
              <button 
                onClick={() => setFacingMode(prev => prev === 'user' ? 'environment' : 'user')}
                className="w-1/2 bg-[#1e1511] hover:bg-[#302117] text-[#f8bc51] border border-[#f8bc51]/30 py-4 rounded-2xl font-mono font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-all"
              >
                <RefreshCw size={20} /> Flip
              </button>
              <button 
                onClick={() => { stopCamera(); setStatus('failed'); setErrorMsg('Scan cancelled by operator.'); }}
                className="w-1/2 bg-[#1e1511] hover:bg-red-950/20 text-red-400 border border-red-500/20 py-4 rounded-2xl font-mono font-bold uppercase tracking-widest transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {status === 'success' && (
          <div className="flex flex-col items-center text-emerald-400 gap-4 text-center">
            <CheckCircle size={64} className="animate-bounce" />
            <h2 className="text-2xl font-bold font-serif italic">Scan Successful</h2>
            <p className="text-sm font-mono opacity-80 max-w-xs leading-relaxed">
              Biometrics verified and saved. You can close this window now.
            </p>
          </div>
        )}

        {status === 'failed' && (
          <div className="flex flex-col items-center text-red-500 gap-4 text-center">
            <XCircle size={48} />
            <h2 className="text-xl font-bold font-mono">Verification Failed</h2>
            <p className="text-sm font-mono opacity-70">{errorMsg}</p>
          </div>
        )}
      </main>
    </div>
  );
}
