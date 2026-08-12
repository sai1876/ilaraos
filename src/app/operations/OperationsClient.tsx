'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  TrendingUp, 
  Layers, 
  Users, 
  LayoutGrid, 
  Sunset, 
  Settings, 
  LogOut, 
  ArrowLeft, 
  Sliders, 
  Terminal, 
  ChevronRight,
  ChevronLeft,
  ShieldCheck,
  Percent,
  Download,
  History,
  Coffee,
  Undo2,
  Trash2,
  X,
  Save,
  Trophy,
  BrainCircuit,
  MessageCircle
} from 'lucide-react';
import Link from 'next/link';
import { useStore } from '@/store/useStore';

import dynamic from 'next/dynamic';
import StorageDiagnostic from '@/components/common/StorageDiagnostic';

// Firebase core configuration & seeding imports
import { auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';

// Dynamic panel imports
const DashboardStats = dynamic(() => import('@/components/admin/DashboardStats'), { ssr: false });
const MenuManagement = dynamic(() => import('@/components/admin/MenuManagement'), { ssr: false });
const InventoryManagement = dynamic(() => import('@/components/admin/InventoryManagement'), { ssr: false });
const CRMManagement = dynamic(() => import('@/components/admin/CRMManagement'), { ssr: false });
const UIAtmosphereManager = dynamic(() => import('@/components/admin/UIAtmosphereManager'), { ssr: false });
const OfferManagement = dynamic(() => import('@/components/admin/OfferManagement'), { ssr: false });
const StaffManagement = dynamic(() => import('@/components/admin/StaffManagement'), { ssr: false });
const OutletManagement = dynamic(() => import('@/components/admin/OutletManagement'), { ssr: false });
const ApprovalManagement = dynamic(() => import('@/components/admin/ApprovalManagement'), { ssr: false });
const OrderHistory = dynamic(() => import('@/components/admin/OrderHistory'), { ssr: false });
const OrderManagement = dynamic(() => import('@/components/admin/OrderManagement'), { ssr: false });
const RefundManagement = dynamic(() => import('@/components/admin/RefundManagement'), { ssr: false });
const WastageManagement = dynamic(() => import('@/components/admin/WastageManagement'), { ssr: false });
const DailyClosingManagement = dynamic(() => import('@/components/admin/DailyClosingManagement'), { ssr: false });
const CricketManagement = dynamic(() => import('@/components/admin/CricketManagement'), { ssr: false });
const DocumentVault = dynamic(() => import('@/components/admin/DocumentVault'), { ssr: false });
const BusinessIntelligence = dynamic(() => import('@/components/admin/BusinessIntelligence'), { ssr: false });
const WhatsAppInbox = dynamic(() => import('@/components/admin/whatsapp/WhatsAppInbox'), { ssr: false });

type TabType = 'dashboard' | 'whatsapp' | 'menu' | 'offers' | 'inventory' | 'crm' | 'staff' | 'outlets' | 'atmosphere' | 'approvals' | 'orders' | 'active_orders' | 'refunds' | 'wastage' | 'daily_closings' | 'cricket' | 'documents' | 'bi';

interface OperationsClientProps {
  actor: {
    uid: string;
    role: string;
    staffId?: string;
    tenantId: string;
    outletId?: string;
    allowedOutletIds: string[];
    permissions: string[];
  };
}

export default function OperationsClient({ actor }: OperationsClientProps) {
  const [userRole] = useState<string>(actor.role || 'owner');
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [crmFilter, setCrmFilter] = useState<'all' | 'loyal'>('all');
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('ops_sidebar_collapsed') === 'true';
    }
    return false;
  });
  const [showSettings, setShowSettings] = useState<boolean>(false);

  const toggleSidebar = () => {
    setIsCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('ops_sidebar_collapsed', String(next));
      return next;
    });
  };

  const navigateTo = (tab: TabType, filter?: string) => {
    setActiveTab(tab);
    if (tab === 'crm' && filter) {
      setCrmFilter(filter as any);
    } else {
      setCrmFilter('all');
    }
  };

  const [ownerEmail, setOwnerEmail] = useState<string>('');

  const handleLogout = async () => {
    try {
      useStore.getState().resetStore();
      await fetch('/api/auth/session', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logout' })
      });
      await signOut(auth);
      window.location.href = '/login?staff=true';
    } catch (err) {
      console.error(err);
      window.location.href = '/login?staff=true';
    }
  };

  // Inactivity timeout
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const resetTimeout = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        handleLogout();
      }, 300000);
    };

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    resetTimeout();
    events.forEach(event => { document.addEventListener(event, resetTimeout); });

    return () => {
      clearTimeout(timeoutId);
      events.forEach(event => { document.removeEventListener(event, resetTimeout); });
    };
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      if (tabParam && ['dashboard', 'whatsapp', 'menu', 'offers', 'inventory', 'crm', 'staff', 'outlets', 'atmosphere', 'approvals', 'orders', 'active_orders', 'refunds'].includes(tabParam)) {
        setActiveTab(tabParam as TabType);
      }

      setOwnerEmail(localStorage.getItem('ilara_smtp_owner_email') || '');
    }

    const onSessionExpired = () => {
      console.warn('Operations session expired, logging out...');
      handleLogout();
    };

    window.addEventListener('operations-session-expired', onSessionExpired);
    return () => {
      window.removeEventListener('operations-session-expired', onSessionExpired);
    };
  }, []);

  const handleDownloadBackup = async () => {
    try {
      const res = await fetch('/api/export-backup', { credentials: 'include' });
      if (!res.ok) throw new Error('Backup failed');
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cafe-backup-${new Date().toISOString().slice(0,10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error(err);
      alert('Failed to download backup');
    }
  };

  const saveSettings = () => {
    localStorage.setItem('ilara_smtp_owner_email', ownerEmail);
    setShowSettings(false);
  };

  // Nav items configuration
  const navigationItems = [
    { id: 'dashboard',      label: 'Live Telemetry',    icon: TrendingUp,  subtitle: 'Real-time charts' },
    { id: 'whatsapp',       label: 'WhatsApp AI',       icon: MessageCircle, subtitle: 'Inbox & Agent Control' },
    { id: 'daily_closings', label: 'Daily Closing',      icon: LogOut,      subtitle: 'End of Day Audit' },
    { id: 'active_orders',  label: 'Active Orders',      icon: Coffee,      subtitle: 'Kitchen Inflow' },
    { id: 'orders',         label: 'Order History',      icon: History,     subtitle: 'Past transactions' },
    { id: 'menu',           label: 'Menu Catalog',       icon: Sliders,     subtitle: 'Recipe connectors' },
    { id: 'offers',         label: 'Campaign Offers',    icon: Percent,     subtitle: 'AI Smart Coupon' },
    { id: 'inventory',      label: 'Stock Registry',     icon: Layers,      subtitle: 'Material thresholds' },
    { id: 'crm',            label: 'CRM Cohorts',        icon: Users,       subtitle: 'Gemini Activator' },
    { id: 'staff',          label: 'Staff Terminals',    icon: Terminal,    subtitle: 'Key provisions' },
    { id: 'approvals',      label: 'Manager Approvals',  icon: ShieldCheck, subtitle: 'Review Requests' },
    { id: 'refunds',        label: 'Refund Requests',    icon: Undo2,       subtitle: 'Queue & Review' },
    { id: 'wastage',        label: 'Wastage & Remakes',  icon: Trash2,      subtitle: 'Food loss log' },
    { id: 'outlets',        label: 'Hatch Queues',       icon: LayoutGrid,  subtitle: 'Morning HUD & Mood' },
    { id: 'atmosphere',     label: 'UI Atmosphere',      icon: Sunset,      subtitle: 'Weather dynamic prompt' },
    { id: 'cricket',        label: 'IPL Telemetry',      icon: Trophy,      subtitle: 'Live match traffic' },
    { id: 'documents',      label: 'Document Vault',     icon: Save,        subtitle: 'Secure storage' },
    { id: 'bi',             label: 'Business Intel',     icon: BrainCircuit,subtitle: 'IlaraOS Insight' },
  ];

  return (
    <div className="h-screen w-full bg-[#FAF7F2] text-[#241A15] flex flex-col lg:flex-row font-sans overflow-hidden relative">

      {/* Ambient glow blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-[#9A642C]/5 rounded-full filter blur-[140px] pointer-events-none z-0" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-[#C3924F]/4 rounded-full filter blur-[140px] pointer-events-none z-0" />

      {/* ── SIDEBAR (desktop) ── */}
      <aside className={`hidden lg:flex flex-col shrink-0 bg-[#F5F1EA] border-r border-[#E8DFD3] z-20 h-full transition-all duration-300 ${isCollapsed ? 'w-20' : 'w-64 xl:w-72'}`}>
        <style dangerouslySetInnerHTML={{ __html: `
          .owner-sidebar-nav::-webkit-scrollbar { display: none !important; }
          .owner-sidebar-nav { -ms-overflow-style: none !important; scrollbar-width: none !important; }
        `}} />

        {/* Brand */}
        <div className={`px-5 pt-6 pb-4 border-b border-[#E8DFD3] shrink-0 ${isCollapsed ? 'flex justify-center px-0' : ''}`}>
          {isCollapsed ? (
            <button
              onClick={toggleSidebar}
              className="p-1.5 rounded-lg bg-[#9A642C]/10 text-[#9A642C] hover:bg-[#9A642C]/20 transition-all border border-[#9A642C]/25 flex items-center justify-center cursor-pointer"
              title="Expand Sidebar"
            >
              <ChevronRight size={16} />
            </button>
          ) : (
            <div className="flex justify-between items-center w-full gap-2">
              <div className="flex items-center gap-3 min-w-0">
                <img 
                  src="/images/logo_icon.png" 
                  alt="Ilara Logo" 
                  className="h-10 w-auto object-contain shrink-0"
                />
                <div className="min-w-0">
                  <span className="font-serif text-2xl font-bold text-[#9A642C] leading-none tracking-tight block">IlaraOS</span>
                  <span className="font-sans text-[10px] uppercase tracking-[0.2em] font-extrabold text-[#9A642C] leading-none mt-1.5 block">Operations</span>
                  <span className="font-mono text-[7px] uppercase tracking-widest text-[#66554A]/60 mt-1 block truncate">Command Centre</span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                <div className="flex items-center gap-1 bg-[#9A642C]/10 text-[#9A642C] border border-[#9A642C]/20 px-2 py-0.5 rounded-full text-[8px] font-sans font-bold uppercase tracking-wider shadow-sm">
                  <ShieldCheck size={9} />
                  {userRole}
                </div>
                <button
                  onClick={toggleSidebar}
                  className="p-1.5 rounded-xl bg-[#FFFDFC] hover:bg-[#F5F1EA] shadow-[0_2px_8px_rgba(0,0,0,0.02)] text-[#66554A] hover:text-[#241A15] transition-all flex items-center justify-center cursor-pointer border border-[#E8DFD3]"
                  title="Collapse Sidebar"
                >
                  <ChevronLeft size={13} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Scrollable nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-3 flex flex-col gap-0.5 owner-sidebar-nav">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => navigateTo(item.id as TabType)}
                className={`flex items-center gap-3 text-left px-3 py-2.5 rounded-xl transition-all border w-full cursor-pointer ${
                  isActive
                    ? 'bg-[#9A642C]/10 text-[#9A642C] border-[#9A642C]/20 font-bold'
                    : 'bg-transparent text-[#66554A] hover:text-[#241A15] border-transparent hover:bg-[#FAF7F2]'
                } ${isCollapsed ? 'lg:justify-center lg:px-0' : ''}`}
                title={isCollapsed ? item.label : undefined}
              >
                <Icon size={15} className={`shrink-0 ${isActive ? 'text-[#9A642C]' : 'text-[#9A642C]/70'}`} />
                <div className={`min-w-0 ${isCollapsed ? 'lg:hidden' : ''}`}>
                  <p className="text-[11px] uppercase tracking-wider font-bold leading-tight truncate">{item.label}</p>
                  <p className={`text-[8px] font-mono uppercase mt-0.5 tracking-wider truncate ${isActive ? 'text-[#9A642C]/70' : 'text-[#66554A]/50'}`}>{item.subtitle}</p>
                </div>
              </button>
            );
          })}
        </nav>

        {/* Footer: Settings + Logout */}
        <div className={`px-3 py-4 border-t border-[#E8DFD3] shrink-0 flex flex-col gap-2 ${isCollapsed ? 'items-center' : ''}`}>
          {!isCollapsed && (
            <button
              onClick={() => setShowSettings(true)}
              className="flex items-center gap-3 text-left px-3 py-2.5 rounded-xl text-[#66554A] hover:text-[#9A642C] hover:bg-[#9A642C]/5 transition-colors border border-transparent hover:border-[#9A642C]/10 cursor-pointer w-full"
            >
              <Settings size={15} className="shrink-0" />
              <p className="text-[11px] uppercase tracking-wider font-mono font-bold">API Config</p>
            </button>
          )}
          {isCollapsed && (
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 rounded-xl text-[#66554A] hover:text-[#9A642C] hover:bg-[#9A642C]/5 transition-colors cursor-pointer"
              title="API Config"
            >
              <Settings size={15} />
            </button>
          )}

          {!isCollapsed && (
            <button
              onClick={handleDownloadBackup}
              className="flex items-center gap-3 text-left px-3 py-2.5 rounded-xl text-[#66554A] hover:text-[#2F6B54] hover:bg-emerald-50/50 transition-colors border border-transparent hover:border-emerald-100 cursor-pointer w-full"
            >
              <Download size={15} className="shrink-0" />
              <p className="text-[11px] uppercase tracking-wider font-mono font-bold">Export Backup</p>
            </button>
          )}
          {isCollapsed && (
            <button
              onClick={handleDownloadBackup}
              className="p-2 rounded-xl text-[#66554A] hover:text-[#2F6B54] hover:bg-emerald-50/50 transition-colors cursor-pointer"
              title="Export Backup"
            >
              <Download size={15} />
            </button>
          )}

          <button
            onClick={handleLogout}
            className={`flex items-center gap-3 text-left px-3 py-2.5 rounded-xl text-[#B42318] hover:bg-[#B42318]/5 transition-colors border border-transparent cursor-pointer ${isCollapsed ? 'w-auto justify-center px-0' : 'w-full'}`}
            title={isCollapsed ? 'Sign Out' : undefined}
          >
            <LogOut size={15} className="shrink-0" />
            <p className={`text-[11px] uppercase tracking-wider font-mono font-bold ${isCollapsed ? 'lg:hidden' : ''}`}>Sign Out</p>
          </button>
        </div>
      </aside>

      {/* ── MOBILE TOP NAV ── */}
      <div className="lg:hidden flex flex-col shrink-0 bg-[#F5F1EA] border-b border-[#E8DFD3] z-20">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#E8DFD3]">
          <div className="flex items-center gap-2">
            <img 
              src="/images/logo_icon.png" 
              alt="Ilara" 
              className="h-7 w-auto object-contain"
            />
            <div className="flex items-baseline gap-1.5">
              <span className="font-serif text-lg font-bold text-[#9A642C] leading-none">Ilara</span>
              <span className="font-sans text-[9px] uppercase tracking-widest font-extrabold text-[#9A642C] leading-none">{userRole}</span>
            </div>
          </div>
          <div className="flex gap-2 items-center">
            <div className="flex items-center gap-1 bg-[#9A642C]/10 text-[#9A642C] border border-[#9A642C]/20 px-2 py-0.5 rounded text-[7px] font-mono uppercase font-bold tracking-wider">
              <ShieldCheck size={9} />
              {userRole}
            </div>
            <button onClick={() => setShowSettings(true)} className="text-[#66554A]/60 hover:text-[#9A642C] p-1">
              <Settings size={16} />
            </button>
            <button onClick={handleLogout} className="text-[#B42318]/60 hover:text-[#B42318] p-1">
              <LogOut size={16} />
            </button>
          </div>
        </div>
        <nav className="flex overflow-x-auto gap-1 px-3 py-2 category-scroll-container">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => navigateTo(item.id as TabType)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border shrink-0 transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[#9A642C]/10 text-[#9A642C] border-[#9A642C]/20 font-bold'
                    : 'bg-transparent text-[#66554A] border-transparent hover:bg-[#FAF7F2]'
                }`}
              >
                <Icon size={13} className={isActive ? 'text-[#9A642C]' : 'text-[#9A642C]/70'} />
                <span className="text-[10px] uppercase tracking-wider font-bold whitespace-nowrap">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* ── MAIN CONTENT ── */}
      <main className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden z-10 relative">
        <div className="hidden lg:flex items-center justify-between px-6 xl:px-8 py-3 bg-[#F5F1EA]/70 backdrop-blur-sm border-b border-[#E8DFD3] shrink-0">
          <div className="flex items-center gap-4">
            <Link 
              href="/"
              className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-[#66554A]/70 hover:text-[#9A642C] transition-colors"
            >
              <ArrowLeft size={12} />
              Cafe Front
            </Link>
          </div>
          <div className="flex items-center gap-3 font-mono text-[10px]">
            <span className="text-[#66554A]/40 uppercase tracking-widest">KDS Signal:</span>
            <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1 font-bold text-emerald-600">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              ONLINE
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden theme-scrollbar">
          <div className="p-4 lg:p-6 xl:p-8 min-h-full">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="w-full"
            >
              {activeTab === 'dashboard'      && <DashboardStats userRole={userRole} onNavigate={navigateTo} />}
              {activeTab === 'whatsapp'       && <WhatsAppInbox actor={{ uid: actor.uid || '', role: userRole }} />}
              {activeTab === 'active_orders'  && <OrderManagement />}
              {activeTab === 'menu'           && <MenuManagement userRole={userRole} />}
              {activeTab === 'offers'         && <OfferManagement />}
              {activeTab === 'inventory'      && <InventoryManagement userRole={userRole} />}
              {activeTab === 'crm'            && <CRMManagement initialFilter={crmFilter} userRole="admin" />}
              {activeTab === 'staff'          && <StaffManagement userRole={userRole} />}
              {activeTab === 'approvals'      && <ApprovalManagement />}
              {activeTab === 'outlets'        && <OutletManagement />}
              {activeTab === 'atmosphere'     && <UIAtmosphereManager />}
              {activeTab === 'orders'         && <OrderHistory />}
              {activeTab === 'refunds'        && <RefundManagement />}
              {activeTab === 'wastage'        && <WastageManagement userRole={userRole} />}
              {activeTab === 'daily_closings' && <DailyClosingManagement outletId="main" userRole={userRole as any} />}
              {activeTab === 'cricket'        && <CricketManagement />}
              {activeTab === 'documents'      && <DocumentVault userRole={userRole} />}
              {activeTab === 'bi'             && <BusinessIntelligence />}
            </motion.div>
          </div>
        </div>
      </main>

      {/* ── SETTINGS MODAL ── */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm"
            onClick={() => setShowSettings(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ duration: 0.2 }}
              className="bg-[#FFFDFC] rounded-2xl shadow-2xl border border-[#E8DFD3] w-full max-w-md p-6"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-[#9A642C]/10 rounded-xl border border-[#9A642C]/20">
                    <Settings size={16} className="text-[#9A642C]" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-[#241A15] uppercase tracking-wider">API Cloud Config</h2>
                    <p className="text-[10px] font-mono text-[#66554A]/50 uppercase tracking-widest mt-0.5">Owner credentials</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowSettings(false)}
                  className="p-1.5 rounded-lg text-[#66554A]/50 hover:text-[#241A15] hover:bg-[#FAF7F2] transition-all cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="flex flex-col gap-4">
                {[
                  { label: 'Owner Alert Email', value: ownerEmail, setter: setOwnerEmail, type: 'email', placeholder: 'owner@ilaracafe.com' },
                ].map((field) => (
                  <div key={field.label} className="flex flex-col gap-1.5">
                    <span className="font-mono text-[9px] uppercase tracking-widest text-[#66554A] font-bold">{field.label}</span>
                    <input
                      type={field.type}
                      value={field.value}
                      onChange={(e) => field.setter(e.target.value)}
                      placeholder={field.placeholder}
                      className="bg-[#FFFDFC] border border-[#E8DFD3] rounded-xl px-3 py-2.5 text-sm text-[#241A15] focus:outline-none focus:border-[#9A642C] focus:ring-2 focus:ring-[#9A642C]/10 transition-all placeholder:text-[#66554A]/30 font-sans"
                    />
                  </div>
                ))}
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowSettings(false)}
                  className="flex-1 py-2.5 rounded-xl border border-[#E8DFD3] text-[#66554A] text-[11px] font-mono font-bold uppercase tracking-wider hover:bg-[#FAF7F2] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={saveSettings}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#9A642C] text-[#FFFDFC] text-[11px] font-mono font-bold uppercase tracking-wider hover:bg-[#805020] transition-colors cursor-pointer shadow-[0_4px_12px_rgba(154,100,44,0.15)]"
                >
                  <Save size={13} />
                  Save Config
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <StorageDiagnostic />
    </div>
  );
}
