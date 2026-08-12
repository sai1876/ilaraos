'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  BarChart3, TrendingUp, Users, DollarSign, 
  BrainCircuit, RefreshCw, AlertTriangle
} from 'lucide-react';
import AgentInsightCard, { AgentInsightData } from './business-intelligence/AgentInsightCard';
import AgentInsightDrawer from './business-intelligence/AgentInsightDrawer';

import { operationsApiRequest } from '@/lib/apiClient';

const BI_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'gst', label: 'GST Intelligence' },
  { id: 'revenue', label: 'Revenue' },
  { id: 'resource', label: 'Resource' },
  { id: 'finance', label: 'Finance' },
  { id: 'compliance', label: 'Compliance' },
  { id: 'ca_workspace', label: 'CA Workspace' },
];

function formatRupees(paise?: number): string {
  if (typeof paise !== 'number') return '₹0';
  const rupees = paise / 100;
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(rupees);
}

export default function BusinessIntelligence() {
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedAgent, setSelectedAgent] = useState<AgentInsightData | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // API states per section
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [overviewData, setOverviewData] = useState<any>(null);
  const [gstData, setGstData] = useState<any>(null);
  const [revenueData, setRevenueData] = useState<any>(null);
  const [resourceData, setResourceData] = useState<any>(null);
  const [financeData, setFinanceData] = useState<any>(null);
  const [complianceData, setComplianceData] = useState<any>(null);
  const [caData, setCaData] = useState<any>(null);
  const [insights, setInsights] = useState<AgentInsightData[]>([]);

  // CA note input state
  const [caNoteText, setCaNoteText] = useState<Record<string, string>>({});



  const fetchTabData = useCallback(async (tab: string) => {
    setLoading(true);
    setError(null);

    try {
      if (tab === 'overview') {
        const data = await operationsApiRequest<{ snapshot: any; insights: AgentInsightData[] }>('/api/business-intelligence/overview', {
          cacheKey: 'bi:overview',
          staleTimeMs: 60 * 1000,
        });
        setOverviewData(data.snapshot);
        setInsights(data.insights || []);
      } else if (tab === 'gst') {
        const data = await operationsApiRequest<any>('/api/business-intelligence/gst', {
          cacheKey: 'bi:gst',
          staleTimeMs: 5 * 60 * 1000,
        });
        setGstData(data);
      } else if (tab === 'revenue') {
        const data = await operationsApiRequest<{ revenue: any }>('/api/business-intelligence/revenue', {
          cacheKey: 'bi:revenue',
          staleTimeMs: 2 * 60 * 1000,
        });
        setRevenueData(data.revenue);
      } else if (tab === 'resource') {
        const data = await operationsApiRequest<{ resource: any }>('/api/business-intelligence/resource', {
          cacheKey: 'bi:resource',
          staleTimeMs: 2 * 60 * 1000,
        });
        setResourceData(data.resource);
      } else if (tab === 'finance') {
        const data = await operationsApiRequest<{ finance: any }>('/api/business-intelligence/finance', {
          cacheKey: 'bi:finance',
          staleTimeMs: 2 * 60 * 1000,
        });
        setFinanceData(data.finance);
      } else if (tab === 'compliance') {
        const data = await operationsApiRequest<{ compliance: any }>('/api/business-intelligence/compliance', {
          cacheKey: 'bi:compliance',
          staleTimeMs: 5 * 60 * 1000,
        });
        setComplianceData(data.compliance);
      } else if (tab === 'ca_workspace') {
        const data = await operationsApiRequest<{ ca_workspace: any }>('/api/business-intelligence/ca-workspace', {
          cacheKey: 'bi:ca_workspace',
          staleTimeMs: 5 * 60 * 1000,
        });
        setCaData(data.ca_workspace);
      }
    } catch (err: any) {
      console.error(`Failed to fetch BI data for tab: ${tab}`, err);
      setError(err.message || `Failed to load ${tab} data`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTabData(activeTab);
  }, [activeTab, fetchTabData]);

  const handleTabChange = (tabId: string) => {
    setIsDrawerOpen(false);
    setSelectedAgent(null);
    setActiveTab(tabId);
  };

  const handleOpenAgentDrawer = (agent: AgentInsightData) => {
    setSelectedAgent(agent);
    setIsDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setIsDrawerOpen(false);
    setSelectedAgent(null);
  };

  // Actions
  const handleMarkGstCaReview = async (id: string) => {
    try {
      const data = await operationsApiRequest<any>(`/api/business-intelligence/gst/reconciliations/${id}/mark-ca-review`, {
        method: 'POST'
      });
      if (data) fetchTabData('gst');
    } catch (err) {
      console.error(err);
    }
  };

  const handleReviewCompliance = async (id: string) => {
    try {
      const data = await operationsApiRequest<any>(`/api/business-intelligence/compliance/${id}/review`, {
        method: 'POST'
      });
      if (data) fetchTabData('compliance');
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddCaNote = async (id: string) => {
    const note = caNoteText[id];
    if (!note) return;
    try {
      const data = await operationsApiRequest<any>(`/api/business-intelligence/ca/${id}/note`, {
        method: 'POST',
        body: JSON.stringify({ ca_note: note })
      });
      if (data) {
        setCaNoteText(prev => ({ ...prev, [id]: '' }));
        fetchTabData('ca_workspace');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCaAction = async (id: string, action: 'request-document' | 'mark-reviewed' | 'return-to-manager') => {
    try {
      const data = await operationsApiRequest<any>(`/api/business-intelligence/ca/${id}/${action}`, {
        method: 'POST'
      });
      if (data) fetchTabData('ca_workspace');
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="w-full flex flex-col gap-6 text-[#241A15]">
      {/* Header with Demo Badge */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="font-serif italic text-3xl font-black text-[#9A642C]">Business Intelligence</h2>
          <p className="text-xs font-mono text-[#66554A] uppercase tracking-widest mt-1">IlaraOS Command Centre & Insights</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-100/80 border border-amber-300 rounded-full text-[11px] font-mono font-bold text-amber-900 shadow-sm">
          <span className="w-2 h-2 rounded-full bg-amber-600 animate-pulse" />
          <span>DEMO DATA</span>
          <span className="text-[10px] opacity-75 font-normal">Deterministic Firestore Records</span>
        </div>
      </div>

      {/* Horizontal Sub-Nav */}
      <div className="flex gap-2 p-1 bg-[#F5F1EA] rounded-xl border border-[#E8DFD3] flex-wrap max-w-full overflow-x-auto">
        {BI_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
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

      {/* Content Box */}
      <div className="bg-[#FFFDFC] border border-[#E8DFD3] rounded-2xl p-6 relative min-h-[400px]">
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 text-center text-[#66554A]">
            <RefreshCw className="w-8 h-8 text-[#9A642C] animate-spin mb-3" />
            <p className="text-xs font-mono font-bold uppercase tracking-wider">Loading IlaraOS Telemetry...</p>
          </div>
        )}

        {error && !loading && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <AlertTriangle className="w-12 h-12 text-red-500 mb-3" />
            <h3 className="text-lg font-bold text-[#241A15]">IlaraOS Intelligence unavailable</h3>
            <p className="text-xs text-[#66554A] mt-1 mb-4 max-w-md">{error}</p>
            <button
              onClick={() => fetchTabData(activeTab)}
              className="px-4 py-2 bg-[#9A642C] text-white rounded-lg text-xs font-bold font-mono uppercase tracking-wider hover:bg-[#7D4F22] transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && (
          <>
            {/* 1. OVERVIEW TAB */}
            {activeTab === 'overview' && (
              <div className="flex flex-col gap-8">
                <h3 className="text-xl font-bold font-serif text-[#9A642C]">Executive Overview</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="p-4 bg-[#F5F1EA] rounded-xl border border-[#E8DFD3]">
                    <div className="flex items-center gap-2 mb-2">
                      <DollarSign className="w-4 h-4 text-[#9A642C]" />
                      <span className="text-xs font-bold uppercase tracking-wider text-[#66554A]">Today's Revenue</span>
                    </div>
                    <div className="text-2xl font-black font-mono">
                      {formatRupees(overviewData?.gross_revenue_paise)}
                    </div>
                    <div className="text-xs text-emerald-600 font-bold mt-1 flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" /> {overviewData?.order_count || 0} Orders Today
                    </div>
                  </div>

                  <div className="p-4 bg-[#F5F1EA] rounded-xl border border-[#E8DFD3]">
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="w-4 h-4 text-[#9A642C]" />
                      <span className="text-xs font-bold uppercase tracking-wider text-[#66554A]">Net Revenue</span>
                    </div>
                    <div className="text-2xl font-black font-mono">
                      {formatRupees(overviewData?.net_revenue_paise)}
                    </div>
                    <div className="text-xs text-amber-700 font-bold mt-1 flex items-center gap-1">
                      Operating Margin: {overviewData?.operating_margin_percent}%
                    </div>
                  </div>

                  <div className="p-4 bg-[#F5F1EA] rounded-xl border border-[#E8DFD3]">
                    <div className="flex items-center gap-2 mb-2">
                      <BarChart3 className="w-4 h-4 text-[#9A642C]" />
                      <span className="text-xs font-bold uppercase tracking-wider text-[#66554A]">Avg Order Value</span>
                    </div>
                    <div className="text-2xl font-black font-mono">
                      {formatRupees(overviewData?.average_order_value_paise)}
                    </div>
                    <div className="text-xs text-emerald-600 font-bold mt-1 flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" /> Target Met
                    </div>
                  </div>

                  <div className="p-4 bg-[#F5F1EA] rounded-xl border border-[#E8DFD3]">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                      <span className="text-xs font-bold uppercase tracking-wider text-[#66554A]">Cash Variance</span>
                    </div>
                    <div className="text-2xl font-black font-mono text-red-600">
                      {formatRupees(overviewData?.cash_variance_paise)}
                    </div>
                    <div className="text-xs text-red-500 font-bold mt-1">
                      Declared: {formatRupees(overviewData?.declared_cash_paise)}
                    </div>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-lg font-bold font-serif text-[#9A642C] flex items-center gap-2">
                      <BrainCircuit className="w-5 h-5" />
                      Precomputed IlaraOS Insights
                    </h4>
                    <span className="text-xs font-mono text-[#66554A]">Click card for interactive analysis drawer</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {insights.map(agent => (
                      <AgentInsightCard
                        key={agent.id}
                        agent={agent}
                        onClick={handleOpenAgentDrawer}
                        isSelected={selectedAgent?.id === agent.id}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* 2. GST INTELLIGENCE TAB */}
            {activeTab === 'gst' && gstData && (
              <div className="flex flex-col gap-6">
                <h3 className="text-xl font-bold font-serif text-[#9A642C]">GST Intelligence & Compliance</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 bg-[#F5F1EA] rounded-xl border border-[#E8DFD3]">
                    <span className="text-xs font-mono text-[#66554A] font-bold uppercase">Estimated GST Payable</span>
                    <div className="text-2xl font-mono font-black mt-1">{formatRupees(gstData.snapshot?.estimated_payable_paise)}</div>
                    <div className="text-xs text-[#66554A] mt-1">Period: {gstData.snapshot?.period}</div>
                  </div>
                  <div className="p-4 bg-[#F5F1EA] rounded-xl border border-[#E8DFD3]">
                    <span className="text-xs font-mono text-[#66554A] font-bold uppercase">Reconciliation Score</span>
                    <div className="text-2xl font-mono font-black mt-1 text-emerald-700">{gstData.snapshot?.reconciliation_score}%</div>
                    <div className="text-xs text-[#66554A] mt-1">GSTR-2B Score: {gstData.snapshot?.gstr2b_score}%</div>
                  </div>
                  <div className="p-4 bg-[#F5F1EA] rounded-xl border border-[#E8DFD3]">
                    <span className="text-xs font-mono text-[#66554A] font-bold uppercase">Eligible ITC</span>
                    <div className="text-2xl font-mono font-black mt-1">{formatRupees(gstData.snapshot?.eligible_itc_paise)}</div>
                    <div className="text-xs text-[#66554A] mt-1">Output Tax: {formatRupees(gstData.snapshot?.output_tax_paise)}</div>
                  </div>
                </div>

                <h4 className="text-base font-bold font-serif text-[#9A642C] mt-2">GST Reconciliations</h4>
                <div className="overflow-x-auto rounded-xl border border-[#E8DFD3]">
                  <table className="w-full text-left text-xs text-[#241A15]">
                    <thead className="bg-[#F5F1EA] font-mono text-[#66554A] uppercase border-b border-[#E8DFD3]">
                      <tr>
                        <th className="p-3">Supplier</th>
                        <th className="p-3">Invoice #</th>
                        <th className="p-3">Amount</th>
                        <th className="p-3">GST Amount</th>
                        <th className="p-3">Status</th>
                        <th className="p-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E8DFD3]">
                      {gstData.reconciliations?.map((row: any) => (
                        <tr key={row.id} className="hover:bg-[#F5F1EA]/50">
                          <td className="p-3 font-bold">{row.supplier_name}</td>
                          <td className="p-3 font-mono">{row.invoice_number}</td>
                          <td className="p-3 font-mono">{formatRupees(row.invoice_amount_paise)}</td>
                          <td className="p-3 font-mono">{formatRupees(row.gst_amount_paise)}</td>
                          <td className="p-3 font-mono uppercase font-bold">
                            <span className={`px-2 py-0.5 rounded ${
                              row.reconciliation_status === 'matched' ? 'bg-emerald-100 text-emerald-800' :
                              row.reconciliation_status === 'ca_review' ? 'bg-purple-100 text-purple-800' :
                              'bg-amber-100 text-amber-800'
                            }`}>
                              {row.reconciliation_status}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            {row.reconciliation_status !== 'ca_review' && (
                              <button
                                onClick={() => handleMarkGstCaReview(row.id)}
                                className="px-2.5 py-1 bg-[#9A642C] text-white rounded text-[10px] font-mono font-bold uppercase hover:bg-[#7D4F22]"
                              >
                                Mark for CA Review
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 3. REVENUE TAB */}
            {activeTab === 'revenue' && revenueData && (
              <div className="flex flex-col gap-6">
                <h3 className="text-xl font-bold font-serif text-[#9A642C]">Revenue Analytics & Trends</h3>
                <div className="overflow-x-auto rounded-xl border border-[#E8DFD3]">
                  <table className="w-full text-left text-xs text-[#241A15]">
                    <thead className="bg-[#F5F1EA] font-mono text-[#66554A] uppercase border-b border-[#E8DFD3]">
                      <tr>
                        <th className="p-3">Date</th>
                        <th className="p-3">Gross Revenue</th>
                        <th className="p-3">Net Revenue</th>
                        <th className="p-3">Orders</th>
                        <th className="p-3">AOV</th>
                        <th className="p-3">Discounts</th>
                        <th className="p-3">Refunds</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E8DFD3]">
                      {revenueData.map((row: any) => (
                        <tr key={row.id} className="hover:bg-[#F5F1EA]/50 font-mono">
                          <td className="p-3 font-bold">{row.date}</td>
                          <td className="p-3">{formatRupees(row.gross_revenue_paise)}</td>
                          <td className="p-3 font-bold text-emerald-700">{formatRupees(row.net_revenue_paise)}</td>
                          <td className="p-3">{row.order_count}</td>
                          <td className="p-3">{formatRupees(row.average_order_value_paise)}</td>
                          <td className="p-3 text-amber-700">{formatRupees(row.discounts_paise)}</td>
                          <td className="p-3 text-red-600">{formatRupees(row.refunds_paise)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 4. RESOURCE TAB */}
            {activeTab === 'resource' && resourceData && (
              <div className="flex flex-col gap-6">
                <h3 className="text-xl font-bold font-serif text-[#9A642C]">Resource & Capacity Telemetry</h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="p-4 bg-[#F5F1EA] rounded-xl border border-[#E8DFD3]">
                    <span className="text-xs font-mono text-[#66554A] font-bold uppercase">Staff Present</span>
                    <div className="text-2xl font-mono font-black mt-1">{resourceData.snapshot?.staff_present} / {resourceData.snapshot?.staff_scheduled}</div>
                  </div>
                  <div className="p-4 bg-[#F5F1EA] rounded-xl border border-[#E8DFD3]">
                    <span className="text-xs font-mono text-[#66554A] font-bold uppercase">Kitchen Utilization</span>
                    <div className="text-2xl font-mono font-black mt-1 text-amber-700">{resourceData.snapshot?.kitchen_utilization_percent}%</div>
                  </div>
                  <div className="p-4 bg-[#F5F1EA] rounded-xl border border-[#E8DFD3]">
                    <span className="text-xs font-mono text-[#66554A] font-bold uppercase">Peak Station Load</span>
                    <div className="text-2xl font-mono font-black mt-1 text-red-600">{resourceData.snapshot?.peak_station_load_percent}%</div>
                  </div>
                  <div className="p-4 bg-[#F5F1EA] rounded-xl border border-[#E8DFD3]">
                    <span className="text-xs font-mono text-[#66554A] font-bold uppercase">Critical Stock Count</span>
                    <div className="text-2xl font-mono font-black mt-1">{resourceData.snapshot?.critical_stock_count} Items</div>
                  </div>
                </div>

                <h4 className="text-base font-bold font-serif text-[#9A642C]">Station Load & Efficiency</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {resourceData.stations?.map((st: any) => (
                    <div key={st.id} className="p-4 bg-[#FFFDFC] border border-[#E8DFD3] rounded-xl">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-sm">{st.station_name}</span>
                        <span className={`px-2 py-0.5 text-[10px] font-mono font-bold uppercase rounded ${st.status === 'bottleneck' ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'}`}>
                          {st.status}
                        </span>
                      </div>
                      <div className="text-xs font-mono text-[#66554A]">Utilization: {st.utilization_percent}%</div>
                      <div className="text-xs font-mono text-[#66554A]">Avg Prep Time: {st.average_prep_minutes} mins</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 5. FINANCE TAB */}
            {activeTab === 'finance' && financeData && (
              <div className="flex flex-col gap-6">
                <h3 className="text-xl font-bold font-serif text-[#9A642C]">Financial Snapshot & Expenses</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 bg-[#F5F1EA] rounded-xl border border-[#E8DFD3]">
                    <span className="text-xs font-mono text-[#66554A] font-bold uppercase">Operating Profit</span>
                    <div className="text-2xl font-mono font-black text-emerald-700 mt-1">{formatRupees(financeData.snapshot?.operating_profit_paise)}</div>
                    <div className="text-xs text-[#66554A] mt-1">Margin: {financeData.snapshot?.operating_margin_percent}%</div>
                  </div>
                  <div className="p-4 bg-[#F5F1EA] rounded-xl border border-[#E8DFD3]">
                    <span className="text-xs font-mono text-[#66554A] font-bold uppercase">Food Cost</span>
                    <div className="text-2xl font-mono font-black mt-1">{formatRupees(financeData.snapshot?.food_cost_paise)}</div>
                  </div>
                  <div className="p-4 bg-[#F5F1EA] rounded-xl border border-[#E8DFD3]">
                    <span className="text-xs font-mono text-[#66554A] font-bold uppercase">Gross Profit</span>
                    <div className="text-2xl font-mono font-black mt-1">{formatRupees(financeData.snapshot?.gross_profit_paise)}</div>
                  </div>
                </div>

                <h4 className="text-base font-bold font-serif text-[#9A642C]">Supplier Payments Due</h4>
                <div className="overflow-x-auto rounded-xl border border-[#E8DFD3]">
                  <table className="w-full text-left text-xs text-[#241A15]">
                    <thead className="bg-[#F5F1EA] font-mono text-[#66554A] uppercase border-b border-[#E8DFD3]">
                      <tr>
                        <th className="p-3">Supplier</th>
                        <th className="p-3">Amount</th>
                        <th className="p-3">Due Date</th>
                        <th className="p-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E8DFD3] font-mono">
                      {financeData.payments?.map((p: any) => (
                        <tr key={p.id}>
                          <td className="p-3 font-bold">{p.supplier_name}</td>
                          <td className="p-3">{formatRupees(p.amount_paise)}</td>
                          <td className="p-3">{p.due_date}</td>
                          <td className="p-3 uppercase font-bold text-amber-700">{p.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 6. COMPLIANCE TAB */}
            {activeTab === 'compliance' && complianceData && (
              <div className="flex flex-col gap-6">
                <h3 className="text-xl font-bold font-serif text-[#9A642C]">Compliance & Operational Audits</h3>
                <div className="flex flex-col gap-3">
                  {complianceData.map((task: any) => (
                    <div key={task.id} className="p-4 bg-[#FFFDFC] border border-[#E8DFD3] rounded-xl flex items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-sm text-[#241A15]">{task.title}</span>
                          <span className={`px-2 py-0.5 text-[10px] font-mono uppercase font-bold rounded ${
                            task.priority === 'critical' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {task.priority}
                          </span>
                        </div>
                        <div className="text-xs font-mono text-[#66554A]">
                          Category: {task.category} • Role: {task.owner_role} • Due: {task.due_date}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono font-bold uppercase text-[#9A642C]">{task.status}</span>
                        {task.status !== 'reviewed' && (
                          <button
                            onClick={() => handleReviewCompliance(task.id)}
                            className="px-3 py-1.5 bg-[#9A642C] text-white rounded-lg text-xs font-mono font-bold uppercase hover:bg-[#7D4F22]"
                          >
                            Mark Reviewed
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 7. CA WORKSPACE TAB */}
            {activeTab === 'ca_workspace' && caData && (
              <div className="flex flex-col gap-6">
                <h3 className="text-xl font-bold font-serif text-[#9A642C]">Chartered Accountant Workspace</h3>
                <div className="flex flex-col gap-4">
                  {caData.map((rev: any) => (
                    <div key={rev.id} className="p-5 bg-[#FFFDFC] border border-[#E8DFD3] rounded-xl flex flex-col gap-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="text-xs font-mono font-bold uppercase text-[#9A642C]">{rev.title}</span>
                          <div className="text-sm font-bold text-[#241A15] mt-1">{rev.system_finding}</div>
                        </div>
                        <span className="px-2.5 py-1 bg-purple-100 text-purple-900 text-xs font-mono font-bold uppercase rounded-md">
                          {rev.status}
                        </span>
                      </div>

                      <div className="text-xs text-[#66554A] bg-[#F5F1EA] p-3 rounded-lg border border-[#E8DFD3]">
                        <span className="font-bold text-[#241A15]">IlaraOS Recommendation:</span> {rev.ilaraos_recommendation}
                      </div>

                      {rev.ca_note && (
                        <div className="text-xs text-blue-900 bg-blue-50 p-2.5 rounded border border-blue-200 font-mono">
                          CA Note: {rev.ca_note}
                        </div>
                      )}

                      <div className="flex items-center gap-2 pt-2 border-t border-[#E8DFD3] flex-wrap">
                        <input
                          type="text"
                          placeholder="Add CA review note..."
                          value={caNoteText[rev.id] || ''}
                          onChange={(e) => setCaNoteText({ ...caNoteText, [rev.id]: e.target.value })}
                          className="flex-1 px-3 py-1.5 text-xs border border-[#E8DFD3] rounded-lg bg-[#F5F1EA]/50 font-mono"
                        />
                        <button
                          onClick={() => handleAddCaNote(rev.id)}
                          className="px-3 py-1.5 bg-[#9A642C] text-white text-xs font-mono font-bold uppercase rounded-lg hover:bg-[#7D4F22]"
                        >
                          Add Note
                        </button>
                        <button
                          onClick={() => handleCaAction(rev.id, 'request-document')}
                          className="px-3 py-1.5 bg-[#E8DFD3] text-[#241A15] text-xs font-mono font-bold uppercase rounded-lg hover:bg-[#D8CBD3]"
                        >
                          Request Doc
                        </button>
                        <button
                          onClick={() => handleCaAction(rev.id, 'mark-reviewed')}
                          className="px-3 py-1.5 bg-emerald-700 text-white text-xs font-mono font-bold uppercase rounded-lg hover:bg-emerald-800"
                        >
                          Mark Reviewed
                        </button>
                        <button
                          onClick={() => handleCaAction(rev.id, 'return-to-manager')}
                          className="px-3 py-1.5 bg-amber-700 text-white text-xs font-mono font-bold uppercase rounded-lg hover:bg-amber-800"
                        >
                          Return to Manager
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* AI Insight Slide Drawer */}
      <AgentInsightDrawer
        isOpen={isDrawerOpen}
        agent={selectedAgent}
        onClose={handleCloseDrawer}
        onRefresh={() => fetchTabData('overview')}
      />
    </div>
  );
}
