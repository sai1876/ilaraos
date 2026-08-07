import React, { useEffect, useState } from 'react';
import { X, CheckCircle2, AlertTriangle, ArrowRight, ShieldAlert, Sparkles } from 'lucide-react';
import { auth } from '@/lib/firebase';
import SeverityBadge from './SeverityBadge';
import { AgentInsightData } from './AgentInsightCard';

interface AgentInsightDrawerProps {
  isOpen: boolean;
  agent: AgentInsightData | null;
  onClose: () => void;
  onRefresh?: () => void;
  onNavigate?: (moduleName: string) => void;
}

export default function AgentInsightDrawer({
  isOpen,
  agent,
  onClose,
  onRefresh,
  onNavigate
}: AgentInsightDrawerProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !agent) return null;

  const handleAction = async (actionType: string, label: string) => {
    setIsSubmitting(true);
    setActionMessage(null);

    try {
      if (actionType === 'navigate') {
        if (onNavigate) {
          onNavigate(label);
        }
        onClose();
        return;
      }

      let endpoint = '';
      let body: any = {};

      if (actionType === 'acknowledge') {
        endpoint = `/api/business-intelligence/insights/${agent.id}/acknowledge`;
      } else if (actionType === 'create_corrective_task') {
        endpoint = `/api/business-intelligence/insights/${agent.id}/create-task`;
        body = { title: `Task: ${label} for ${agent.agent_name}` };
      } else if (actionType === 'create_approval') {
        endpoint = `/api/business-intelligence/insights/${agent.id}/create-approval`;
        body = { title: `Approval: ${label} (${agent.agent_name})` };
      }

      if (!endpoint) return;

      const authHeaders: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (typeof window !== 'undefined' && auth.currentUser) {
        try {
          const token = await auth.currentUser.getIdToken();
          authHeaders['Authorization'] = `Bearer ${token}`;
        } catch (e) {
          console.warn('Failed to get token in drawer:', e);
        }
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(body)
      });

      if (res.ok) {
        setActionMessage(`Action '${label}' saved to database.`);
        if (onRefresh) onRefresh();
      } else {
        const err = await res.json().catch(() => ({}));
        setActionMessage(`Error: ${err.detail || 'Action failed'}`);
      }
    } catch (err) {
      setActionMessage('Failed to connect to server');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
      {/* Dark translucent overlay */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md md:max-w-lg bg-[#FFFDFC] text-[#241A15] border-l border-[#E8DFD3] shadow-2xl flex flex-col justify-between overflow-y-auto transform transition-transform animate-in slide-in-from-right duration-300">
          
          {/* Header */}
          <div className="p-6 border-b border-[#E8DFD3] bg-[#F5F1EA] sticky top-0 z-10">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="w-4 h-4 text-[#9A642C]" />
                  <h2 id="drawer-title" className="text-xl font-bold font-serif text-[#9A642C]">
                    {agent.agent_name}
                  </h2>
                </div>
                <p className="text-[10px] font-mono text-[#66554A] uppercase tracking-widest">
                  AUTONOMOUS TELEMETRY AUDIT • {agent.generated_at ? new Date(agent.generated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'JUST NOW'}
                </p>
              </div>
              <button
                onClick={onClose}
                aria-label="Close drawer"
                className="p-1.5 rounded-lg text-[#66554A] hover:bg-[#E8DFD3] hover:text-[#241A15] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Drawer Body Content */}
          <div className="p-6 flex-1 flex flex-col gap-6">

            {actionMessage && (
              <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-xs font-mono">
                {actionMessage}
              </div>
            )}

            {/* 2. Target KPI Panel */}
            <div className="p-4 bg-[#F5F1EA] rounded-xl border border-[#E8DFD3] flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold font-mono uppercase tracking-widest text-[#66554A]">TARGET KPI</span>
                <div className="text-base font-black text-[#241A15] font-serif mt-0.5">
                  {agent.target_kpi || 'Operational Metric'}
                </div>
              </div>
              <SeverityBadge severity={agent.severity} />
            </div>

            {/* 3. Current Live Finding */}
            <div>
              <h3 className="text-xs font-bold font-mono uppercase tracking-widest text-[#9A642C] mb-2 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> CURRENT LIVE FINDING
              </h3>
              <div className="p-4 bg-[#FFFDFC] border-2 border-[#9A642C]/20 rounded-xl text-sm text-[#241A15] leading-relaxed italic font-serif">
                "{agent.current_finding}"
              </div>
            </div>

            {/* 4. Evidence Used */}
            {agent.evidence && agent.evidence.length > 0 && (
              <div>
                <h3 className="text-xs font-bold font-mono uppercase tracking-widest text-[#66554A] mb-2 flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-[#9A642C]" /> MATHEMATICAL / OPERATIONAL EVIDENCE USED
                </h3>
                <div className="flex flex-col gap-2">
                  {agent.evidence.map((item, idx) => (
                    <div key={idx} className="p-3 bg-[#F5F1EA]/60 rounded-lg border border-[#E8DFD3] text-xs font-mono text-[#241A15]">
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 5. Business Impact */}
            {agent.business_impact && (
              <div>
                <h3 className="text-xs font-bold font-mono uppercase tracking-widest text-[#66554A] mb-2">
                  BUSINESS IMPACT
                </h3>
                <p className="text-xs text-[#241A15] leading-relaxed bg-[#F5F1EA]/30 p-3 rounded-lg border border-[#E8DFD3]">
                  {agent.business_impact}
                </p>
              </div>
            )}

            {/* 6. Recommended Operational Actions */}
            {agent.recommended_actions && agent.recommended_actions.length > 0 && (
              <div>
                <h3 className="text-xs font-bold font-mono uppercase tracking-widest text-[#66554A] mb-2">
                  RECOMMENDED OPERATIONAL ACTIONS
                </h3>
                <ul className="flex flex-col gap-2">
                  {agent.recommended_actions.map((act, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-xs text-[#241A15]">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <span>{act}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* 7. Owner Controlled Actions */}
            {agent.owner_actions && agent.owner_actions.length > 0 && (
              <div className="pt-2 border-t border-[#E8DFD3]">
                <h3 className="text-xs font-bold font-mono uppercase tracking-widest text-[#9A642C] mb-3">
                  OWNER CONTROLLED ACTIONS
                </h3>
                <div className="flex flex-wrap gap-2">
                  {agent.owner_actions.map((act, idx) => (
                    <button
                      key={idx}
                      disabled={isSubmitting}
                      onClick={() => handleAction(act.action_type, act.label)}
                      className={`px-4 py-2.5 rounded-xl text-xs font-bold font-mono uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50 ${
                        act.variant === 'danger'
                          ? 'bg-red-600 text-white hover:bg-red-700'
                          : act.variant === 'secondary'
                          ? 'bg-[#E8DFD3] text-[#241A15] hover:bg-[#D8CBD3]'
                          : 'bg-[#9A642C] text-white hover:bg-[#7D4F22]'
                      }`}
                    >
                      {act.label} <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  ))}
                </div>
              </div>
            )}

          </div>

          {/* 8. Limitations Footer */}
          <div className="p-4 border-t border-[#E8DFD3] bg-[#F5F1EA] text-[11px] font-mono text-[#8C7A6B]">
            <span className="font-bold text-[#66554A]">System Limitations:</span> {agent.limitations || 'Telemetry generated from past 21-day rolling snapshot.'}
          </div>

        </div>
      </div>
    </div>
  );
}
