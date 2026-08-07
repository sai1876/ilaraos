'use client';

import { useState, useEffect } from 'react';
import { LayoutGrid, Sparkles, MapPin, ClipboardList, Plus, Trash2 } from 'lucide-react';
import { Outlet, Staff } from '@/lib/types';
import { fetchOutlets, fetchStaffList } from '@/lib/dbService';
import { secureSaveOutlet, secureDeleteOutlet } from '@/app/_actions/secureDbActions';
import TOTPModal from './TOTPModal';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';

interface HUDItem {
  id: string;
  title: string;
  description: string;
  severity: 'critical' | 'warning' | 'info';
}

import dynamic from 'next/dynamic';

const LocationPickerMap = dynamic(() => import('@/components/admin/LocationPickerMap'), { ssr: false });

export default function OutletManagement({ userRole = 'admin', outletId }: { userRole?: 'admin' | 'owner' | 'manager'; outletId?: string }) {
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [editingOutletId, setEditingOutletId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState('28.363'); // default BITS Pilani Lat
  const [lng, setLng] = useState('75.587'); // default BITS Pilani Lng
  const [hatches, setHatches] = useState(''); // Comma separated hatches
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [mapLink, setMapLink] = useState('');
  const [isParsingLink, setIsParsingLink] = useState(false);
  // AI HUD State
  const [hudItems, setHudItems] = useState<HUDItem[]>([]);
  const [loadingHud, setLoadingHud] = useState(false);
  // TOTP Security State
  type PendingOutletAction = 
    | { type: 'add_outlet'; outlet: Outlet }
    | { type: 'delete_outlet'; id: string }
    | null;
  const [pendingAction, setPendingAction] = useState<PendingOutletAction>(null);

  const isDark = userRole !== 'manager';

  // Theme-aware Tailwind class generator
  const t = {
    text: isDark ? 'text-[#f7dec4]' : 'text-[#534434]',
    cardBg: isDark ? 'bg-[#120a06]/40 border-[#302117]' : 'bg-[#f5f4ec] border-[#d8c3ad]/70 shadow-sm',
    title: isDark ? 'text-white font-serif italic' : 'text-[#855300] font-serif italic font-bold',
    subText: isDark ? 'text-[#d4c4b0]/50' : 'text-[#534434]/60',
    innerCardBg: isDark ? 'bg-[#070402]/30 border-[#302117] hover:border-[#f8bc51]/40' : 'bg-white border-[#d8c3ad]/50 hover:border-[#855300]/40 shadow-sm',
    addrBg: isDark ? 'bg-[#1a110b] border-[#4a3424]' : 'bg-[#fbf9f1] border-[#d8c3ad]/30',
    addrText: isDark ? 'text-[#f5f1ea]' : 'text-[#534434]/90',
    editBtn: isDark ? 'text-[#f8bc51] hover:text-[#ffce7b] font-bold' : 'text-[#855300]/80 hover:text-[#855300] hover:underline font-bold',
    badge: isDark ? 'bg-[#302117]/50 text-[#f8bc51] border-[#302117]' : 'bg-[#ffddb8]/80 text-[#855300] border-amber-200/50 font-bold',
    formCardBg: isDark ? 'bg-[#120a06]/40 border-[#f8bc51]/20' : 'bg-[#f5f4ec] border-[#d8c3ad]/70 shadow-sm',
    label: isDark ? 'text-[#d4c4b0]/70' : 'text-[#534434]/80 font-semibold',
    input: isDark ? 'bg-[#070402] border-[#302117] text-white focus:border-[#f8bc51]' : 'bg-white border-[#d8c3ad]/60 text-[#1b1c17] focus:border-[#855300]',
    secondaryBtn: isDark ? 'bg-[#302117]/50 hover:bg-[#f8bc51]/20 text-[#f8bc51] border-[#302117] hover:border-[#f8bc51]/50' : 'bg-white hover:bg-[#eae8e0] text-[#534434] border-[#d8c3ad] hover:border-[#855300]/50 font-bold',
    primaryBtn: isDark ? 'bg-[#f8bc51] hover:bg-[#ffce7b] text-[#0A0604]' : 'bg-[#855300] hover:bg-[#a27b5c] text-white shadow-sm font-bold',
    cancelBtn: isDark ? 'bg-[#302117]/40 hover:bg-[#302117] text-[#d4c4b0] border-[#302117]' : 'bg-[#eae8e0] hover:bg-[#d8c3ad]/50 text-[#534434] border-[#d8c3ad]/50 font-bold',
    hudCrit: isDark ? 'bg-[#e8621a]/10 border-[#e8621a]/30' : 'bg-red-50 border-red-200/80',
    hudWarn: isDark ? 'bg-[#f8bc51]/10 border-[#f8bc51]/30' : 'bg-amber-50 border-amber-200/80',
    hudInfo: isDark ? 'bg-[#302117]/60 border-[#302117]' : 'bg-[#fbf9f1] border-[#d8c3ad]/50',
    hudCritText: isDark ? '#f97316' : '#c2410c',
    hudWarnText: isDark ? '#fbbf24' : '#b45309',
    hudInfoText: isDark ? '#f3f4f6' : '#4b5563',
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        loadOutlets();
        fetchAIInsights();
      } else {
        loadOutlets();
        fetchAIInsights();
      }
    });
    return () => unsubscribe();
  }, []);

  const fetchAIInsights = async () => {
    setLoadingHud(true);
    try {
      const user = auth.currentUser;
      const token = user ? await user.getIdToken() : null;
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch('/api/admin/morning-hud', { headers });
      const data = await res.json();
      if (data.tasks && Array.isArray(data.tasks) && data.tasks.length > 0) {
        setHudItems(data.tasks);
      } else {
        setHudItems([
          { id: 'CHECK-01', title: 'Espresso Calibration', description: 'Calibrate water pressure & grind size for morning rush.', severity: 'info' },
          { id: 'CHECK-02', title: 'Milk & Dairy Stock', description: 'Ensure 15L milk is chilled in primary dispenser.', severity: 'warning' },
          { id: 'CHECK-03', title: 'POS Terminal Audit', description: 'Verify POS terminal sync and UPI QR scanner connectivity.', severity: 'critical' }
        ]);
      }
    } catch (e) {
      console.error("Failed to fetch HUD", e);
      setHudItems([
        { id: 'CHECK-01', title: 'Espresso Calibration', description: 'Calibrate water pressure & grind size for morning rush.', severity: 'info' },
        { id: 'CHECK-02', title: 'Milk & Dairy Stock', description: 'Ensure 15L milk is chilled in primary dispenser.', severity: 'warning' },
        { id: 'CHECK-03', title: 'POS Terminal Audit', description: 'Verify POS terminal sync and UPI QR scanner connectivity.', severity: 'critical' }
      ]);
    } finally {
      setLoadingHud(false);
    }
  };

  const loadOutlets = async () => {
    setLoading(true);
    try {
      const data = await fetchOutlets();
      setOutlets(data);
      const sData = await fetchStaffList();
      setStaffList(sData);
    } catch (err: any) {
      setError(err.message || 'Failed to load outlets.');
    } finally {
      setLoading(false);
    }
  };



  const handleAutoFetchLocation = () => {
    if (!('geolocation' in navigator)) {
      setError("Geolocation is not supported by your browser.");
      return;
    }
    setIsGeocoding(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const newLat = position.coords.latitude;
        const newLng = position.coords.longitude;
        setLat(newLat.toFixed(6));
        setLng(newLng.toFixed(6));
        
        // Reverse geocode to get address
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${newLat}&lon=${newLng}`);
          const data = await res.json();
          if (data && data.display_name) {
            setAddress(data.display_name);
          }
        } catch (err) {
          console.error("Reverse geocoding failed", err);
        } finally {
          setIsGeocoding(false);
        }
      },
      (error) => {
        setError("Failed to retrieve location: " + error.message);
        setIsGeocoding(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleParseMapLink = async () => {
    if (!mapLink) return;
    setIsParsingLink(true);
    setError(null);
    try {
      const res = await fetch(`/api/expand-map-link?url=${encodeURIComponent(mapLink)}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to parse link');
      }
      
      setLat(data.lat.toFixed(6));
      setLng(data.lng.toFixed(6));
      
      // Auto reverse geocode
      try {
        const reverseRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${data.lat}&lon=${data.lng}`);
        const reverseData = await reverseRes.json();
        if (reverseData && reverseData.display_name) {
          setAddress(reverseData.display_name);
        }
      } catch (e) {
        console.error("Reverse geocoding failed", e);
      }

      setMapLink(''); // clear after success
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsParsingLink(false);
    }
  };

  const handleMapChange = (newLat: number, newLng: number, newAddress?: string) => {
    setLat(newLat.toFixed(6));
    setLng(newLng.toFixed(6));
    if (newAddress) {
      setAddress(newAddress);
    }
  };

  const handleAddOutlet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !address || !lat || !lng) {
      setError("Please fill all fields, including placing a map pin.");
      return;
    }
    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);
    if (isNaN(parsedLat) || isNaN(parsedLng)) {
      setError("Latitude and Longitude must be valid numbers.");
      return;
    }

    setError(null);
    const existing = outlets.find(o => o.id === editingOutletId);
    
    const newOutlet: Outlet = {
      id: editingOutletId || `out_${Date.now()}`,
      name,
      address,
      latitude: parsedLat,
      longitude: parsedLng,
      status: existing?.status || 'active',
      hatches: hatches ? hatches.split(',').map(h => h.trim()).filter(h => h) : [],
      created_at: existing?.created_at || Date.now()
    };

    // Strip any possible undefined values that Next.js Server Actions hate
    const safeOutlet = JSON.parse(JSON.stringify(newOutlet));

    setPendingAction({ type: 'add_outlet', outlet: safeOutlet });
  };

  const handleEdit = (outlet: Outlet) => {
    setEditingOutletId(outlet.id);
    setName(outlet.name);
    setAddress(outlet.address);
    setLat(typeof outlet.latitude === 'number' ? outlet.latitude.toString() : '28.363');
    setLng(typeof outlet.longitude === 'number' ? outlet.longitude.toString() : '75.587');
    setHatches(outlet.hatches ? outlet.hatches.join(', ') : '');
    setMapLink('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = (id: string) => {
    setPendingAction({ type: 'delete_outlet', id });
  };

  const executeSecureAction = async (totpCode: string) => {
    if (!pendingAction) return;
    setError(null);

    try {
      if (pendingAction.type === 'add_outlet') {
        await secureSaveOutlet(pendingAction.outlet, totpCode);
        await loadOutlets();
        setEditingOutletId(null);
        setName('');
        setAddress('');
        setHatches('');
      } else if (pendingAction.type === 'delete_outlet') {
        await secureDeleteOutlet(pendingAction.id, totpCode);
        await loadOutlets();
      }
    } catch (err: any) {
      console.error("Secure action failed:", err);
      throw err;
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <div className={`grid grid-cols-1 lg:grid-cols-3 gap-6 ${t.text}`}>
      {/* Outlets configuration and queue counts */}
      <div className="lg:col-span-2 flex flex-col gap-6">
        
        <div className={`backdrop-blur-xl border rounded-3xl p-6 flex flex-col gap-4 ${t.cardBg}`}>
          <div className={`flex justify-between items-center border-b pb-3 ${isDark ? 'border-[#302117]/60' : 'border-[#d8c3ad]/50'}`}>
            <div>
              <h2 className={t.title}>Outlet Management</h2>
              <p className={`text-xs font-mono uppercase tracking-widest mt-0.5 ${t.subText}`}>Physical Locations & Telemetry</p>
            </div>
            <span className={`px-3 py-1.5 rounded-full border font-mono text-[10px] flex items-center gap-1.5 ${t.badge}`}>
              <LayoutGrid size={12} />
              {outlets.length} Registered Outlets
            </span>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-300 rounded-xl p-3 text-xs font-mono">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {outlets.map((outlet) => {
              const manager = staffList.find(s => 
                s.role === 'manager' && 
                s.outlet && 
                (s.outlet === outlet.id || s.outlet === outlet.outlet_id || s.outlet === outlet.name)
              );
              const isAssignedToMe = userRole === 'manager' && outletId && (outlet.id === outletId || outlet.outlet_id === outletId);

              return (
              <div
                key={outlet.id}
                className={`border rounded-2xl p-4 flex flex-col gap-4 transition-colors duration-500 relative ${
                  editingOutletId === outlet.id 
                    ? (isDark ? 'border-[#f8bc51]' : 'border-[#855300]') 
                    : isAssignedToMe 
                      ? (isDark ? 'border-[#f8bc51] bg-[#120a06]/40' : 'border-[#855300] bg-[#ffddb8]/20 shadow-sm') 
                      : t.innerCardBg
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <MapPin size={15} className={isDark ? 'text-[#f8bc51]' : 'text-[#855300]'} />
                    <h4 className={`font-serif italic text-base font-bold ${isDark ? 'text-white' : 'text-[#534434]'}`}>
                      {outlet.name}
                      {isAssignedToMe && (
                        <span className={`ml-2 text-[8px] font-sans uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${isDark ? 'bg-[#f8bc51]/20 text-[#f8bc51] border border-[#f8bc51]/30' : 'bg-[#ffddb8] text-[#855300] border border-amber-300'}`}>My Outlet</span>
                      )}
                    </h4>
                  </div>
                  <span className={`w-1.5 h-1.5 rounded-full ${outlet.status === 'active' ? 'bg-[#10B981] shadow-[0_0_8px_#10B981]' : 'bg-[#d4c4b0]/30'}`} />
                </div>

                <div className={`border p-3 rounded-xl font-mono ${t.addrBg}`}>
                  <div className="flex items-center justify-between mb-1">
                    <p className={`text-[8px] uppercase tracking-wider ${t.subText}`}>Address</p>
                    <p className={`text-[8px] uppercase tracking-wider text-right ${t.subText}`}>Manager: 
                      {manager ? (
                        <button 
                          onClick={() => window.location.href = `?tab=staff&open_staff=${manager.id}`}
                          className={`${t.editBtn} ml-1`}
                        >
                          {manager.name} ({manager.employee_id || 'N/A'})
                        </button>
                      ) : (
                        <span className="ml-1 opacity-50">Nil</span>
                      )}
                    </p>
                  </div>
                  <p className={`text-[10px] leading-relaxed truncate ${t.addrText}`}>{outlet.address}</p>
                  <div className={`flex gap-4 mt-2 border-t pt-2 ${isDark ? 'border-[#302117]/30' : 'border-[#d8c3ad]/30'}`}>
                    <div>
                      <span className={`text-[8px] uppercase tracking-wider ${t.subText}`}>Lat: </span>
                      <span className="text-[9px] font-bold" style={{ color: isDark ? '#f8bc51' : '#855300' }}>{typeof outlet.latitude === 'number' ? outlet.latitude.toFixed(4) : 'N/A'}</span>
                    </div>
                    <div>
                      <span className={`text-[8px] uppercase tracking-wider ${t.subText}`}>Lng: </span>
                      <span className="text-[9px] font-bold" style={{ color: isDark ? '#f8bc51' : '#855300' }}>{typeof outlet.longitude === 'number' ? outlet.longitude.toFixed(4) : 'N/A'}</span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-1 gap-2">
                  <button onClick={() => handleEdit(outlet)} className={`text-[10px] uppercase font-mono tracking-wider transition-colors px-2 ${t.editBtn}`}>
                    Edit
                  </button>
                  {userRole !== 'manager' && (
                    <button onClick={() => handleDelete(outlet.id)} className={`${isDark ? 'text-red-400 hover:text-red-300' : 'text-red-600 hover:text-red-500'} transition-colors`}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
              );
            })}
            
            {outlets.length === 0 && !loading && (
              <div className={`md:col-span-2 border border-dashed rounded-2xl p-8 text-center flex flex-col items-center gap-3 ${isDark ? 'border-[#302117] bg-[#070402]/20' : 'border-[#d8c3ad] bg-[#fbf9f1]/50'}`}>
                 <MapPin size={24} className="opacity-30" />
                 <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-[#534434]'}`}>No Outlets Registered</p>
                 <p className={`text-xs max-w-xs mx-auto leading-relaxed ${t.subText}`}>Add your first physical cafe outlet below to enable location-aware inventory and weather forecasting.</p>
              </div>
            )}
          </div>
        </div>

        {/* Add/Edit Outlet Form */}
        {(userRole !== 'manager' || editingOutletId) && (
          <div className={`backdrop-blur-xl border rounded-3xl p-6 flex flex-col gap-4 ${t.formCardBg}`}>
            <div className={`flex items-center justify-between border-b pb-2 ${isDark ? 'border-[#302117]/60' : 'border-[#d8c3ad]/50'}`}>
              <div>
                <h3 className={`font-serif italic text-lg ${isDark ? 'text-[#f8bc51]' : 'text-[#855300] font-bold'}`}>{editingOutletId ? 'Edit Outlet Details' : 'Register New Outlet'}</h3>
                <p className={`text-xs font-mono uppercase tracking-widest mt-0.5 ${t.subText}`}>{editingOutletId ? 'Update location boundaries' : 'Define location boundaries'}</p>
              </div>
              <Sparkles size={14} className={isDark ? 'text-[#f8bc51]' : 'text-[#855300]'} />
            </div>

            <form onSubmit={handleAddOutlet} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className={`text-[10px] font-mono uppercase tracking-wider ${t.label}`}>Outlet Name</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. Oasis Canopy Hub" className={`rounded-xl px-4 py-2.5 text-sm focus:outline-none transition-colors ${t.input}`} />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className={`text-[10px] font-mono uppercase tracking-wider ${t.label}`}>Full Address</label>
                <input type="text" value={address} onChange={e => setAddress(e.target.value)} required placeholder="Search on the map to auto-fill..." className={`rounded-xl px-4 py-2.5 text-sm focus:outline-none transition-colors flex-1 ${t.input}`} />
              </div>
              
              <div className="flex flex-col gap-1.5">
                <label className={`text-[10px] font-mono uppercase tracking-wider ${t.label}`}>Google Maps Link (Optional)</label>
                <div className="flex gap-2">
                  <input 
                    type="url" 
                    value={mapLink} 
                    onChange={e => setMapLink(e.target.value)} 
                    placeholder="https://maps.app.goo.gl/..." 
                    className={`rounded-xl px-4 py-2.5 text-sm focus:outline-none transition-colors flex-1 ${t.input}`} 
                  />
                  <button 
                    type="button" 
                    onClick={handleParseMapLink}
                    disabled={isParsingLink || !mapLink}
                    className={`px-4 py-2.5 rounded-xl font-mono text-xs uppercase tracking-wider transition-all disabled:opacity-50 flex items-center justify-center min-w-[80px] border ${t.secondaryBtn}`}
                  >
                    {isParsingLink ? 'Parsing...' : 'Sync Pin'}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-2 mt-2">
                <div className="flex items-center justify-between">
                  <label className={`text-[10px] font-mono uppercase tracking-wider ${t.label}`}>Interactive Location Picker</label>
                  <button 
                    type="button"
                    onClick={handleAutoFetchLocation}
                    disabled={isGeocoding}
                    className={`text-[10px] font-mono flex items-center gap-1 uppercase tracking-wider disabled:opacity-50 transition-colors ${t.editBtn}`}
                  >
                    <MapPin size={10} />
                    {isGeocoding ? 'Locating...' : 'Use My Location'}
                  </button>
                </div>
                <LocationPickerMap lat={parseFloat(lat) || 28.363} lng={parseFloat(lng) || 75.587} onChange={handleMapChange} />
                <p className={`text-[9px] font-mono ${t.subText}`}>Use the map's search icon or click anywhere to drop a pin.</p>
              </div>

              <div className="flex flex-col gap-1.5 mt-2">
                <label className={`text-[10px] font-mono uppercase tracking-wider ${t.label}`}>Hatches / Pickup Points (Comma Separated)</label>
                <input type="text" value={hatches} onChange={e => setHatches(e.target.value)} placeholder="e.g. OASIS, SMOKING, MAIN" className={`rounded-xl px-4 py-2.5 text-sm focus:outline-none transition-colors ${t.input}`} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                 <div className="flex flex-col gap-1.5">
                  <label className={`text-[10px] font-mono uppercase tracking-wider ${t.label}`}>Latitude</label>
                  <input type="number" step="any" value={lat} onChange={e => setLat(e.target.value)} required placeholder="28.363" className={`rounded-xl px-4 py-2.5 text-sm focus:outline-none transition-colors ${t.input}`} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className={`text-[10px] font-mono uppercase tracking-wider ${t.label}`}>Longitude</label>
                  <input type="number" step="any" value={lng} onChange={e => setLng(e.target.value)} required placeholder="75.587" className={`rounded-xl px-4 py-2.5 text-sm focus:outline-none transition-colors ${t.input}`} />
                </div>
              </div>

              <div className="flex gap-3 mt-2">
                <button type="submit" className={`flex-1 py-3 rounded-xl font-mono font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${t.primaryBtn}`}>
                  <Plus size={14} /> {editingOutletId ? 'Update Physical Outlet' : 'Register Physical Outlet'}
                </button>
                {editingOutletId && (
                  <button 
                    type="button" 
                    onClick={() => { setEditingOutletId(null); setName(''); setAddress(''); setHatches(''); setMapLink(''); }}
                    className={`py-3 px-6 rounded-xl font-mono font-bold text-xs uppercase tracking-widest transition-all border ${t.cancelBtn}`}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </div>
        )}

      </div>

      {/* Right Column - AI Morning Action HUD */}
      <div>
        <div className={`backdrop-blur-xl border rounded-3xl p-6 flex flex-col gap-4 relative overflow-hidden ${t.cardBg}`}>
          {/* Glowing back mesh */}
          {isDark && <div className="absolute top-[-30%] right-[-20%] w-48 h-48 bg-[#f8bc51]/5 rounded-full filter blur-xl" />}

          <div className={`flex items-center justify-between border-b pb-3 ${isDark ? 'border-[#302117]/60' : 'border-[#d8c3ad]/50'}`}>
            <div className="flex items-center gap-2">
              <ClipboardList size={16} className={isDark ? 'text-[#f8bc51]' : 'text-[#855300]'} />
              <h3 className={`font-serif italic text-lg ${isDark ? 'text-white' : 'text-[#855300] font-bold'}`}>Morning HUD Checklist</h3>
            </div>
            <button 
              onClick={fetchAIInsights} 
              disabled={loadingHud} 
              className={`transition-colors p-1 rounded-full ${isDark ? 'text-[#f8bc51] hover:text-[#ffce7b]' : 'text-[#855300] hover:text-[#a27b5c]'} ${loadingHud ? 'animate-spin' : ''}`}
              title="Refresh AI Insights"
            >
              <Sparkles size={14} />
            </button>
          </div>

          <div className="flex flex-col gap-4 mt-2">
            {loadingHud ? (
              // Skeleton loaders
              [1,2,3].map(i => (
                <div key={i} className={`border rounded-2xl p-4 animate-pulse flex items-start gap-3 ${isDark ? 'bg-[#302117]/20 border-[#302117]/40' : 'bg-white border-[#d8c3ad]/30'}`}>
                  <div className={`w-5 h-5 rounded mt-0.5 ${isDark ? 'bg-[#302117]/50' : 'bg-[#d8c3ad]/30'}`} />
                  <div className="flex-1">
                    <div className={`h-4 w-32 rounded mb-2 ${isDark ? 'bg-[#302117]/80' : 'bg-[#d8c3ad]/50'}`}></div>
                    <div className={`h-8 w-full rounded ${isDark ? 'bg-[#302117]/50' : 'bg-[#d8c3ad]/30'}`}></div>
                  </div>
                </div>
              ))
            ) : hudItems.length > 0 ? (
              hudItems.map((task, idx) => {
                const isCrit = task.severity === 'critical';
                const isWarn = task.severity === 'warning';
                
                const colorCode = isCrit ? t.hudCritText : (isWarn ? t.hudWarnText : t.hudInfoText);
                const bgClass = isCrit ? t.hudCrit : (isWarn ? t.hudWarn : t.hudInfo);

                return (
                  <div key={idx} className={`border rounded-2xl p-4 transition-colors ${bgClass}`}>
                    <div className="flex items-start gap-2.5">
                      <span className="font-mono text-sm font-bold" style={{ color: colorCode }}>{task.id}</span>
                      <div>
                        <h5 className={`font-serif italic text-sm font-bold ${isDark ? 'text-white' : 'text-[#534434]'}`}>{task.title}</h5>
                        <p className={`text-[10px] mt-1 leading-relaxed ${isDark ? 'text-[#d4c4b0]/70' : 'text-[#534434]/85'}`}>
                          {task.description}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-6">
                <p className={`text-xs font-mono ${t.subText}`}>No insights generated yet.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <TOTPModal
        isOpen={!!pendingAction}
        onClose={() => setPendingAction(null)}
        onVerify={executeSecureAction}
        title={pendingAction?.type === 'delete_outlet' ? "Delete Outlet" : "Register Outlet"}
        description="Please enter your Google Authenticator code to authorize this action."
      />
    </div>
  );
}
