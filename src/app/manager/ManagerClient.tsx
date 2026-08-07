'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  TrendingUp, 
  Layers, 
  LayoutGrid, 
  Terminal, 
  ShieldCheck,
  History,
  Truck,
  LogOut,
  Sliders,
  Calendar,
  Coffee,
  Undo2,
  Trash2,
  ClipboardList,
  Users,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import { useStore } from '@/store/useStore';
import dynamic from 'next/dynamic';

// Dynamic panel imports
const DashboardStats = dynamic(() => import('@/components/admin/DashboardStats'), { ssr: false });
const MenuManagement = dynamic(() => import('@/components/admin/MenuManagement'), { ssr: false });
const InventoryManagement = dynamic(() => import('@/components/admin/InventoryManagement'), { ssr: false });
const StaffManagement = dynamic(() => import('@/components/admin/StaffManagement'), { ssr: false });
const OutletManagement = dynamic(() => import('@/components/admin/OutletManagement'), { ssr: false });
const OrderHistory = dynamic(() => import('@/components/admin/OrderHistory'), { ssr: false });
const OrderManagement = dynamic(() => import('@/components/admin/OrderManagement'), { ssr: false });
const RiderDispatch = dynamic(() => import('@/components/admin/RiderDispatch'), { ssr: false });
const StaffCopilot = dynamic(() => import('@/components/admin/StaffCopilot'), { ssr: false });
const ScheduleDashboard = dynamic(() => import('@/components/admin/ScheduleDashboard'), { ssr: false });
const RefundManagement = dynamic(() => import('@/components/admin/RefundManagement'), { ssr: false });
const WastageManagement = dynamic(() => import('@/components/admin/WastageManagement'), { ssr: false });
const DailyClosingManagement = dynamic(() => import('@/components/admin/DailyClosingManagement'), { ssr: false });
const CRMManagement = dynamic(() => import('@/components/admin/CRMManagement'), { ssr: false });
const DocumentVault = dynamic(() => import('@/components/admin/DocumentVault'), { ssr: false });

type TabType = 'dashboard' | 'active_orders' | 'orders' | 'dispatch' | 'menu' | 'inventory' | 'staff' | 'outlets' | 'schedule' | 'refunds' | 'wastage' | 'daily_closings' | 'crm' | 'documents';

interface ManagerClientProps {
  actor: {
    uid: string;
    role: string;
    staffId?: string;
    outletId?: string;
  };
}

export default function ManagerClient({ actor }: ManagerClientProps) {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [crmFilter, setCrmFilter] = useState<'all' | 'loyal'>('all');
  const [managerOutletId, setManagerOutletId] = useState<string>(actor.outletId || 'main');
  const [managerRole, setManagerRole] = useState<'admin' | 'owner' | 'manager'>(
    (actor.role as 'admin' | 'owner' | 'manager') || 'manager'
  );
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('manager_sidebar_collapsed') === 'true';
    }
    return false;
  });

  const toggleSidebar = () => {
    setIsCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('manager_sidebar_collapsed', String(next));
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
    events.forEach(event => {
      document.addEventListener(event, resetTimeout);
    });

    return () => {
      clearTimeout(timeoutId);
      events.forEach(event => {
        document.removeEventListener(event, resetTimeout);
      });
    };
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      if (tabParam && ['dashboard', 'orders', 'active_orders', 'dispatch', 'menu', 'inventory', 'staff', 'outlets', 'schedule', 'refunds'].includes(tabParam)) {
        setActiveTab(tabParam as TabType);
      }
    }

    // Verify server session
    fetch('/api/auth/session')
      .then(res => {
        if (!res.ok) throw new Error('Session verification failed');
        return res.json();
      })
      .then(data => {
        if (data.actor?.role) {
          setManagerRole(data.actor.role as any);
        }
        if (data.actor?.outlet_id) {
          setManagerOutletId(data.actor.outlet_id);
        }
      })
      .catch(err => {
        console.error("Manager session verification error:", err);
      });
  }, []);

  // Nav items configuration
  const navigationItems = [
    { id: 'dashboard', label: 'Live Telemetry', icon: TrendingUp, subtitle: 'Real-time charts' },
    { id: 'daily_closings', label: 'Daily Closing', icon: ClipboardList, subtitle: 'End of Day Audit' },
    { id: 'active_orders', label: 'Active Orders', icon: Coffee, subtitle: 'Kitchen Inflow' },
    { id: 'orders', label: 'Order History', icon: History, subtitle: 'Past transactions' },
    { id: 'dispatch', label: 'Rider Dispatch', icon: Truck, subtitle: 'Hatch handover' },
    { id: 'menu', label: 'Menu Catalog', icon: Sliders, subtitle: 'Recipe connectors' },
    { id: 'inventory', label: 'Stock Registry', icon: Layers, subtitle: 'Material thresholds' },
    { id: 'staff', label: 'Staff Terminals', icon: Terminal, subtitle: 'Key provisions' },
    { id: 'schedule', label: 'Staff Schedule', icon: Calendar, subtitle: 'Shift planner' },
    { id: 'refunds', label: 'Refund Requests', icon: Undo2, subtitle: 'Queue & Review' },
    { id: 'wastage', label: 'Wastage & Remakes', icon: Trash2, subtitle: 'Food loss log' },
    { id: 'outlets', label: 'Hatch queues', icon: LayoutGrid, subtitle: 'Morning HUD & Mood' },
    { id: 'crm', label: 'Loyalty Patrons', icon: Users, subtitle: 'Patron Profiles' },
    { id: 'documents', label: 'Document Vault', icon: ClipboardList, subtitle: 'Secure storage' },
  ];

  return (
    <div className="h-screen w-full bg-[#fbf9f1] text-[#1b1c17] flex flex-col lg:flex-row font-sans overflow-hidden relative">

      {/* Ambient glow blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-[#f8bc51]/5 rounded-full filter blur-[120px] pointer-events-none z-0" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-[#E8621A]/5 rounded-full filter blur-[120px] pointer-events-none z-0" />

      {/* ── SIDEBAR (desktop) ── */}
      <aside className={`hidden lg:flex flex-col shrink-0 bg-[#f5f4ec] border-r border-[#d8c3ad] z-20 h-full transition-all duration-300 ${isCollapsed ? 'w-20' : 'w-64 xl:w-72'}`}>
        <style dangerouslySetInnerHTML={{ __html: `
          .sidebar-nav::-webkit-scrollbar {
            display: none !important;
          }
          .sidebar-nav {
            -ms-overflow-style: none !important;
            scrollbar-width: none !important;
          }
        `}} />
        {/* Brand */}
        <div className={`px-5 pt-6 pb-4 border-b border-[#d8c3ad]/60 shrink-0 ${isCollapsed ? 'flex justify-center px-0' : ''}`}>
          {isCollapsed ? (
            <button
              onClick={toggleSidebar}
              className="p-1.5 rounded-lg bg-[#855300]/10 text-[#855300] hover:bg-[#855300]/20 transition-all border border-[#855300]/25 flex items-center justify-center cursor-pointer"
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
                  <span className="font-serif text-2xl font-bold text-[#855300] leading-none tracking-tight block">Ilara</span>
                  <span className="font-sans text-[10px] uppercase tracking-[0.2em] font-extrabold text-[#a27b5c] leading-none mt-1.5 block">Manager</span>
                  <span className="font-mono text-[7px] uppercase tracking-widest text-[#534434]/40 mt-1 block truncate">Operational Command</span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                <div className="flex items-center gap-1 bg-[#855300]/5 text-[#855300]/80 border border-[#855300]/15 px-2 py-0.5 rounded-full text-[8px] font-sans font-bold uppercase tracking-wider shadow-sm">
                  <ShieldCheck size={9} />
                  Mgr
                </div>
                <button
                  onClick={toggleSidebar}
                  className="p-1.5 rounded-xl bg-white hover:bg-[#eae8e0] shadow-[0_2px_8px_rgba(0,0,0,0.04)] text-[#534434] hover:text-[#1b1c17] transition-all flex items-center justify-center cursor-pointer border border-[#d8c3ad]/50"
                  title="Collapse Sidebar"
                >
                  <ChevronLeft size={13} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Scrollable nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-3 flex flex-col gap-0.5 sidebar-nav">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => navigateTo(item.id as TabType)}
                className={`flex items-center gap-3 text-left px-3 py-2.5 rounded-xl transition-all border w-full cursor-pointer ${
                  isActive
                    ? 'bg-[#ffddb8]/80 text-[#855300] border-amber-200/50 shadow-[0_2px_8px_rgba(133,83,0,0.08)] font-bold'
                    : 'bg-transparent text-[#534434]/85 hover:text-[#1b1c17] border-transparent hover:bg-[#eae8e0]'
                } ${isCollapsed ? 'lg:justify-center lg:px-0' : ''}`}
                title={isCollapsed ? item.label : undefined}
              >
                <Icon size={15} className={`shrink-0 ${isActive ? 'text-[#855300]' : 'text-[#855300]/70'}`} />
                <div className={`min-w-0 ${isCollapsed ? 'lg:hidden' : ''}`}>
                  <p className="text-[11px] uppercase tracking-wider font-bold leading-tight truncate">{item.label}</p>
                  <p className={`text-[8px] font-mono uppercase mt-0.5 tracking-wider truncate ${isActive ? 'text-[#855300]/70' : 'text-[#534434]/50'}`}>{item.subtitle}</p>
                </div>
              </button>
            );
          })}
        </nav>

        {/* Logout pinned at bottom */}
        <div className={`px-3 py-4 border-t border-[#d8c3ad]/60 shrink-0 ${isCollapsed ? 'flex justify-center' : ''}`}>
          <button
            onClick={handleLogout}
            className={`flex items-center gap-3 text-left px-3 py-2.5 rounded-xl text-red-600 hover:bg-red-50 transition-colors border border-transparent cursor-pointer ${isCollapsed ? 'w-auto lg:px-0 lg:justify-center' : 'w-full'}`}
            title={isCollapsed ? 'Sign Out' : undefined}
          >
            <LogOut size={15} className="shrink-0" />
            <p className={`text-[11px] uppercase tracking-wider font-mono font-bold ${isCollapsed ? 'lg:hidden' : ''}`}>Sign Out</p>
          </button>
        </div>
      </aside>

      {/* ── MOBILE TOP NAV ── */}
      <div className="lg:hidden flex flex-col shrink-0 bg-[#f5f4ec] border-b border-[#d8c3ad] z-20">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#d8c3ad]/60">
          <div className="flex items-center gap-2">
            <img 
              src="/images/logo_icon.png" 
              alt="Ilara" 
              className="h-7 w-auto object-contain"
            />
            <div className="flex items-baseline gap-1.5">
              <span className="font-serif text-lg font-bold text-[#855300] leading-none">Ilara</span>
              <span className="font-sans text-[9px] uppercase tracking-widest font-extrabold text-[#a27b5c] leading-none">Manager</span>
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex items-center gap-1 bg-[#855300]/10 text-[#855300] border border-[#855300]/25 px-2 py-0.5 rounded text-[7px] font-mono uppercase font-bold tracking-wider">
              <ShieldCheck size={9} />
              Mgr
            </div>
            <button onClick={handleLogout} className="text-[#534434]/60 hover:text-red-600 p-1">
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
                    ? 'bg-[#ffddb8]/80 text-[#855300] border-amber-200/50 font-bold'
                    : 'bg-transparent text-[#534434]/85 border-transparent hover:bg-[#eae8e0]'
                }`}
              >
                <Icon size={13} className={isActive ? 'text-[#855300]' : 'text-[#855300]/70'} />
                <span className="text-[10px] uppercase tracking-wider font-bold whitespace-nowrap">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* ── MAIN CONTENT ── */}
      <main className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden z-10 relative">
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
              {activeTab === 'dashboard' && <DashboardStats outletId={managerOutletId} userRole={managerRole} onNavigate={(t, f) => navigateTo(t as TabType, f)} />}
              {activeTab === 'active_orders' && <OrderManagement outletId={managerOutletId} userRole={managerRole} />}
              {activeTab === 'orders' && <OrderHistory outletId={managerOutletId} userRole={managerRole} />}
              {activeTab === 'dispatch' && <RiderDispatch outletId={managerOutletId} userRole={managerRole} />}
              {activeTab === 'menu' && <MenuManagement userRole={managerRole} outletId={managerOutletId} />}
              {activeTab === 'inventory' && <InventoryManagement userRole={managerRole} outletId={managerOutletId} />}
              {activeTab === 'staff' && <StaffManagement userRole={managerRole} />}
              {activeTab === 'schedule' && <ScheduleDashboard userRole={managerRole} />}
              {activeTab === 'outlets' && <OutletManagement userRole={managerRole} outletId={managerOutletId} />}
              {activeTab === 'refunds' && <RefundManagement outletId={managerOutletId} userRole={managerRole} />}
              {activeTab === 'wastage' && <WastageManagement userRole={managerRole} />}
              {activeTab === 'daily_closings' && <DailyClosingManagement outletId={managerOutletId} userRole={managerRole} />}
              {activeTab === 'crm' && <CRMManagement initialFilter={crmFilter} userRole={managerRole} />}
              {activeTab === 'documents' && <DocumentVault userRole={managerRole} />}
            </motion.div>
          </div>
        </div>
      </main>

      <StaffCopilot />
    </div>
  );
}
