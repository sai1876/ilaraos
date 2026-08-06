'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart3, PieChart, TrendingUp, TrendingDown, Users, DollarSign, BrainCircuit, Activity, FileText, CheckCircle2, AlertCircle } from 'lucide-react';

const BI_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'gst', label: 'GST Intelligence' },
  { id: 'revenue', label: 'Revenue' },
  { id: 'resource', label: 'Resource' },
  { id: 'finance', label: 'Finance' },
  { id: 'compliance', label: 'Compliance' },
  { id: 'ca_workspace', label: 'CA Workspace' },
];

const AI_AGENTS = [
  { id: 'sales_ai', name: 'Sales AI', insight: 'High likelihood of 20% revenue drop tomorrow due to rain. Recommended: Push 15% discount on delivery platforms.', type: 'warning' },
  { id: 'inventory_ai', name: 'Inventory AI', insight: 'Coffee Beans running low across 2 outlets. Projected depletion in 48 hours.', type: 'warning' },
  { id: 'staff_ai', name: 'Staff AI', insight: 'Shift coverage optimal for weekend peak. 2 pending leave approvals.', type: 'info' },
  { id: 'pricing_ai', name: 'Pricing AI', insight: 'Competitor down the street reduced Latte prices by 5%. No immediate action required.', type: 'info' },
  { id: 'crm_ai', name: 'CRM AI', insight: '12 loyal customers haven\'t visited in 30 days. Ready to send "We Miss You" SMS campaign.', type: 'success' },
  { id: 'kitchen_ai', name: 'Kitchen AI', insight: 'Average prep time increased by 2 mins during 7 PM - 9 PM. Review Grill Station efficiency.', type: 'warning' },
  { id: 'quality_ai', name: 'Quality AI', insight: 'Recent 3-star reviews mention cold fries. Investigating packaging thermal retention.', type: 'info' },
  { id: 'finance_ai', name: 'Finance AI', insight: 'Net margins improved by 2% this week. Cash flow stable.', type: 'success' },
  { id: 'growth_ai', name: 'Growth AI', insight: 'New corporate park opening nearby. Suggest creating a bulk-order lunch package.', type: 'info' }
];

export default function BusinessIntelligence() {
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <div className="w-full flex flex-col gap-6 text-[#241A15]">
      <div>
        <h2 className="font-serif italic text-3xl font-black text-[#9A642C]">Business Intelligence</h2>
        <p className="text-xs font-mono text-[#66554A] uppercase tracking-widest mt-1">IlaraOS Command Centre & Insights</p>
      </div>

      {/* Horizontal Sub-Nav */}
      <div className="flex gap-2 p-1 bg-[#F5F1EA] rounded-xl border border-[#E8DFD3] flex-wrap max-w-full overflow-x-auto">
        {BI_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-lg text-xs font-bold font-mono uppercase tracking-widest transition-all whitespace-nowrap ${
              activeTab === tab.id 
                ? 'bg-[#9A642C] text-[#FFFDFC] shadow-md' 
                : 'text-[#66554A] hover:bg-[#E8DFD3] hover:text-[#241A15]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="bg-[#FFFDFC] border border-[#E8DFD3] rounded-2xl p-6">
        {activeTab === 'overview' && (
          <div className="flex flex-col gap-8">
            <h3 className="text-xl font-bold font-serif text-[#9A642C]">Executive Overview</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="p-4 bg-[#F5F1EA] rounded-xl border border-[#E8DFD3]">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="w-4 h-4 text-[#9A642C]" />
                  <span className="text-xs font-bold uppercase tracking-wider text-[#66554A]">Today's Revenue</span>
                </div>
                <div className="text-2xl font-black font-mono">₹45,230</div>
                <div className="text-xs text-green-600 font-bold mt-1 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> +12% vs last week</div>
              </div>

              <div className="p-4 bg-[#F5F1EA] rounded-xl border border-[#E8DFD3]">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="w-4 h-4 text-[#9A642C]" />
                  <span className="text-xs font-bold uppercase tracking-wider text-[#66554A]">Total Customers</span>
                </div>
                <div className="text-2xl font-black font-mono">142</div>
                <div className="text-xs text-red-500 font-bold mt-1 flex items-center gap-1"><TrendingDown className="w-3 h-3" /> -3% vs last week</div>
              </div>

              <div className="p-4 bg-[#F5F1EA] rounded-xl border border-[#E8DFD3]">
                <div className="flex items-center gap-2 mb-2">
                  <BarChart3 className="w-4 h-4 text-[#9A642C]" />
                  <span className="text-xs font-bold uppercase tracking-wider text-[#66554A]">Avg Order Value</span>
                </div>
                <div className="text-2xl font-black font-mono">₹318</div>
                <div className="text-xs text-green-600 font-bold mt-1 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> +5% vs last week</div>
              </div>
            </div>

            <div className="mt-4">
              <h4 className="text-lg font-bold font-serif text-[#9A642C] mb-4 flex items-center gap-2">
                <BrainCircuit className="w-5 h-5" />
                Precomputed IlaraOS Insights
              </h4>
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                {AI_AGENTS.map(agent => (
                  <div key={agent.id} className="p-4 bg-[#FFFDFC] rounded-xl border border-[#E8DFD3] shadow-sm relative overflow-hidden">
                    <div className={`absolute left-0 top-0 bottom-0 w-1 ${
                      agent.type === 'warning' ? 'bg-[#f59e0b]' :
                      agent.type === 'success' ? 'bg-[#10b981]' : 'bg-[#3b82f6]'
                    }`} />
                    <div className="flex items-center gap-2 mb-2">
                      <Activity className={`w-4 h-4 ${
                        agent.type === 'warning' ? 'text-[#f59e0b]' :
                        agent.type === 'success' ? 'text-[#10b981]' : 'text-[#3b82f6]'
                      }`} />
                      <span className="text-sm font-bold text-[#241A15]">{agent.name}</span>
                    </div>
                    <p className="text-xs text-[#66554A] italic leading-relaxed">{agent.insight}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab !== 'overview' && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <PieChart className="w-12 h-12 text-[#9A642C] opacity-50 mb-4" />
            <h3 className="text-lg font-bold text-[#241A15]">Read-only View</h3>
            <p className="text-sm text-[#66554A] mt-2 max-w-md">
              {BI_TABS.find(t => t.id === activeTab)?.label} data is pre-computed and synced overnight. Contact administrator to modify historical records.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
