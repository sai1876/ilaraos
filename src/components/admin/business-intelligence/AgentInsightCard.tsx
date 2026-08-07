import React from 'react';
import { Activity, ChevronRight } from 'lucide-react';
import SeverityBadge from './SeverityBadge';

export interface AgentInsightData {
  id: string;
  agent_name: string;
  target_kpi?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status?: string;
  current_finding: string;
  evidence?: string[];
  business_impact?: string;
  recommended_actions?: string[];
  owner_actions?: { label: string; action_type: string; variant?: 'primary' | 'secondary' | 'danger' }[];
  limitations?: string;
  generated_at?: string;
}

interface AgentInsightCardProps {
  agent: AgentInsightData;
  onClick: (agent: AgentInsightData) => void;
  isSelected?: boolean;
}

export default function AgentInsightCard({ agent, onClick, isSelected }: AgentInsightCardProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick(agent);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onClick(agent)}
      onKeyDown={handleKeyDown}
      className={`p-4 rounded-xl border transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between group ${
        isSelected
          ? 'bg-[#F9F6F0] border-[#9A642C] shadow-md ring-2 ring-[#9A642C]/20'
          : 'bg-[#FFFDFC] border-[#E8DFD3] hover:border-[#9A642C]/50 hover:shadow-md hover:-translate-y-0.5'
      }`}
    >
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${
        agent.severity === 'critical' ? 'bg-red-500' :
        agent.severity === 'high' ? 'bg-orange-500' :
        agent.severity === 'medium' ? 'bg-amber-500' : 'bg-blue-500'
      }`} />

      <div>
        <div className="flex items-center justify-between gap-2 mb-2 pl-1">
          <div className="flex items-center gap-2">
            <Activity className={`w-4 h-4 ${
              agent.severity === 'critical' ? 'text-red-500' :
              agent.severity === 'high' ? 'text-orange-500' :
              agent.severity === 'medium' ? 'text-amber-500' : 'text-blue-500'
            }`} />
            <span className="text-sm font-bold text-[#241A15]">{agent.agent_name}</span>
          </div>
          <SeverityBadge severity={agent.severity} />
        </div>

        <p className="text-xs text-[#66554A] italic leading-relaxed line-clamp-3 mb-3 pl-1">
          {agent.current_finding}
        </p>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-[#E8DFD3]/60 text-[11px] font-mono text-[#8C7A6B] pl-1">
        <span>{agent.target_kpi || 'Autonomous Audit'}</span>
        <span className="flex items-center gap-1 text-[#9A642C] font-bold group-hover:translate-x-0.5 transition-transform">
          Open Analysis <ChevronRight className="w-3.5 h-3.5" />
        </span>
      </div>
    </div>
  );
}
