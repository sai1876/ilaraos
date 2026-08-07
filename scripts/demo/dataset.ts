import { commonDemoFields } from './manifest';

export const demoDataset = {
  staff: [
    {
      id: 'demo-owner-1',
      employee_id: 'EMP-001',
      name: 'Ilara Owner',
      role: 'owner',
      email: 'owner@ilara.com',
      outlet_id: 'main',
      outlet: 'main',
      status: 'active',
      hatch: 'MAIN',
      assigned_hatch: 'MAIN',
      ...commonDemoFields
    },
    {
      id: 'demo-manager-1',
      employee_id: 'EMP-002',
      name: 'Ilara Manager',
      role: 'manager',
      email: 'manager@ilara.com',
      outlet_id: 'main',
      outlet: 'main',
      status: 'active',
      hatch: 'MAIN',
      assigned_hatch: 'MAIN',
      ...commonDemoFields
    },
    {
      id: 'demo-kitchen-1',
      employee_id: 'EMP-003',
      name: 'Chef One',
      role: 'chef',
      email: 'chef@ilara.com',
      outlet_id: 'main',
      outlet: 'main',
      status: 'active',
      hatch: 'OASIS',
      assigned_hatch: 'OASIS',
      ...commonDemoFields
    }
  ],
  orders: [
    {
      id: 'ord-001',
      order_id: 'ord-001',
      token_number: '047',
      order_type: 'dine-in',
      hatch: 'OASIS',
      status: 'preparing',
      created_at: 1723020000000,
      outlet_id: 'main',
      total_amount: 280,
      total_paise: 28000,
      items: [
        { item_id: 'item-1', menu_item_id: 'item-1', name: 'Classic Burger', quantity: 1, price: 250, station: 'FASTFOOD & BIRYANI', status: 'preparing' },
        { item_id: 'item-2', menu_item_id: 'item-2', name: 'Fries', quantity: 1, price: 100, station: 'FRYER', status: 'ready' }
      ],
      ...commonDemoFields
    },
    {
      id: 'ord-002',
      order_id: 'ord-002',
      token_number: '048',
      order_type: 'pickup',
      hatch: 'MAIN',
      status: 'ready',
      created_at: 1723020300000,
      outlet_id: 'main',
      total_amount: 350,
      total_paise: 35000,
      items: [
        { item_id: 'item-1', menu_item_id: 'item-1', name: 'Classic Burger', quantity: 1, price: 250, station: 'FASTFOOD & BIRYANI', status: 'ready' },
        { item_id: 'item-2', menu_item_id: 'item-2', name: 'Fries', quantity: 1, price: 100, station: 'FRYER', status: 'ready' }
      ],
      ...commonDemoFields
    }
  ],
  shifts: [
    {
      id: 'shift-001',
      staff_id: 'demo-manager-1',
      staff_name: 'Ilara Manager',
      role: 'manager',
      hatch: 'MAIN',
      outlet_id: 'main',
      date: '2026-08-07',
      start_time: '08:00',
      end_time: '16:00',
      status: 'active',
      ...commonDemoFields
    },
    {
      id: 'shift-002',
      staff_id: 'demo-kitchen-1',
      staff_name: 'Chef One',
      role: 'chef',
      hatch: 'OASIS',
      outlet_id: 'main',
      date: '2026-08-07',
      start_time: '10:00',
      end_time: '18:00',
      status: 'active',
      ...commonDemoFields
    }
  ],
  attendance: [
    {
      id: 'att-001',
      staff_id: 'demo-manager-1',
      staff_name: 'Ilara Manager',
      role: 'manager',
      outlet_id: 'main',
      date: '2026-08-07',
      clock_in: '2026-08-07T08:00:00Z',
      status: 'active',
      ...commonDemoFields
    },
    {
      id: 'att-002',
      staff_id: 'demo-kitchen-1',
      staff_name: 'Chef One',
      role: 'chef',
      outlet_id: 'main',
      date: '2026-08-07',
      clock_in: '2026-08-07T10:00:00Z',
      status: 'active',
      ...commonDemoFields
    }
  ],
  menu: [
    {
      item_id: 'item-1',
      name: 'Classic Burger',
      category: 'Mains',
      price: 250,
      is_available: true,
      description: 'A classic burger with cheese and lettuce.',
      ...commonDemoFields
    },
    {
      item_id: 'item-2',
      name: 'Fries',
      category: 'Sides',
      price: 100,
      is_available: true,
      description: 'Crispy golden fries.',
      ...commonDemoFields
    }
  ],
  inventory: [
    {
      id: 'inv-1',
      item_name: 'Burger Buns',
      quantity: 100,
      unit: 'pcs',
      reorder_level: 20,
      critical_level: 10,
      ...commonDemoFields
    },
    {
      id: 'inv-2',
      item_name: 'Potatoes',
      quantity: 50,
      unit: 'kg',
      reorder_level: 10,
      critical_level: 5,
      ...commonDemoFields
    }
  ],
  bi_daily_snapshots: [
    {
      id: '2026-08-07',
      date: "2026-08-07",
      outlet_id: "main",
      gross_revenue_paise: 9645000,
      net_revenue_paise: 8913000,
      order_count: 184,
      average_order_value_paise: 52400,
      discounts_paise: 500000,
      refunds_paise: 232000,
      cash_sales_paise: 3120000,
      upi_sales_paise: 4558000,
      card_sales_paise: 1347000,
      wallet_sales_paise: 310000,
      expected_cash_paise: 3120000,
      declared_cash_paise: 3000000,
      cash_variance_paise: -120000,
      operating_profit_paise: 2985000,
      operating_margin_percent: 33.5,
      critical_stock_count: 2,
      unresolved_complaints: 1,
      staff_present: 14,
      staff_scheduled: 16,
      ...commonDemoFields
    }
  ],
  bi_revenue_daily: [
    { id: '2026-08-01', date: '2026-08-01', outlet_id: 'main', gross_revenue_paise: 7840000, net_revenue_paise: 7240000, order_count: 150, average_order_value_paise: 52200, discounts_paise: 400000, refunds_paise: 200000, ...commonDemoFields },
    { id: '2026-08-02', date: '2026-08-02', outlet_id: 'main', gross_revenue_paise: 8125000, net_revenue_paise: 7525000, order_count: 155, average_order_value_paise: 52400, discounts_paise: 450000, refunds_paise: 150000, ...commonDemoFields },
    { id: '2026-08-03', date: '2026-08-03', outlet_id: 'main', gross_revenue_paise: 8390000, net_revenue_paise: 7790000, order_count: 160, average_order_value_paise: 52400, discounts_paise: 400000, refunds_paise: 200000, ...commonDemoFields },
    { id: '2026-08-04', date: '2026-08-04', outlet_id: 'main', gross_revenue_paise: 8060000, net_revenue_paise: 7460000, order_count: 154, average_order_value_paise: 52300, discounts_paise: 400000, refunds_paise: 200000, ...commonDemoFields },
    { id: '2026-08-05', date: '2026-08-05', outlet_id: 'main', gross_revenue_paise: 9120000, net_revenue_paise: 8420000, order_count: 174, average_order_value_paise: 52400, discounts_paise: 500000, refunds_paise: 200000, ...commonDemoFields },
    { id: '2026-08-06', date: '2026-08-06', outlet_id: 'main', gross_revenue_paise: 9410000, net_revenue_paise: 8710000, order_count: 180, average_order_value_paise: 52200, discounts_paise: 500000, refunds_paise: 200000, ...commonDemoFields },
    { id: '2026-08-07', date: '2026-08-07', outlet_id: 'main', gross_revenue_paise: 9645000, net_revenue_paise: 8913000, order_count: 184, average_order_value_paise: 52400, discounts_paise: 500000, refunds_paise: 232000, ...commonDemoFields }
  ],
  gst_snapshots: [
    {
      id: '2026-08', period: "2026-08", outlet_id: "main",
      taxable_sales_paise: 7240000, cgst_paise: 434400, sgst_paise: 434400, other_gst_paise: 115400,
      output_tax_paise: 984200, eligible_itc_paise: 612000, estimated_payable_paise: 372200,
      reconciliation_score: 92, unmatched_invoice_count: 3, risk_flag_count: 2,
      gstr1_status: "prepared", gstr3b_status: "in_review", gstr2b_score: 92, annual_readiness_percent: 78,
      ...commonDemoFields
    }
  ],
  gst_reconciliations: [
    { id: 'gst-rec-001', supplier_name: "Fresh Foods Ltd", invoice_number: "INV-2026-08-01", invoice_amount_paise: 4500000, gst_amount_paise: 225000, reconciliation_status: "matched", outlet_id: "main", ...commonDemoFields },
    { id: 'gst-rec-002', supplier_name: "Packaging Pro", invoice_number: "PKG-8892", invoice_amount_paise: 1250000, gst_amount_paise: 225000, reconciliation_status: "mismatch", outlet_id: "main", ...commonDemoFields },
    { id: 'gst-rec-003', supplier_name: "City Dairy", invoice_number: "CD-990", invoice_amount_paise: 850000, gst_amount_paise: 42500, reconciliation_status: "missing_in_2b", outlet_id: "main", ...commonDemoFields }
  ],
  resource_snapshots: [
    { id: '2026-08-07', outlet_id: 'main', staff_present: 14, staff_scheduled: 16, kitchen_utilization_percent: 82, peak_station_load_percent: 94, critical_stock_count: 2, equipment_availability_percent: 100, resource_risk: 'medium', ...commonDemoFields }
  ],
  resource_station_load: [
    { id: 'grill', station_name: 'Grill Station', utilization_percent: 89, average_prep_minutes: 14, status: 'bottleneck', outlet_id: 'main', ...commonDemoFields },
    { id: 'fryer', station_name: 'Fryer Station', utilization_percent: 65, average_prep_minutes: 6, status: 'optimal', outlet_id: 'main', ...commonDemoFields },
    { id: 'beverages', station_name: 'Beverages', utilization_percent: 45, average_prep_minutes: 3, status: 'optimal', outlet_id: 'main', ...commonDemoFields }
  ],
  resource_utility_usage: [
    { id: '2026-08-07', outlet_id: 'main', electricity_kwh: 124.5, lpg_kg: 18.2, water_litres: 850, internet_uptime_percent: 99.9, refrigeration_utilization_percent: 85, packaging_remaining: 450, ...commonDemoFields }
  ],
  finance_snapshots: [
    { id: '2026-08-07', outlet_id: 'main', gross_revenue_paise: 9645000, discounts_paise: 500000, refunds_paise: 232000, net_revenue_paise: 8913000, food_cost_paise: 2673900, gross_profit_paise: 6239100, staff_cost_paise: 1500000, delivery_cost_paise: 850000, utilities_paise: 450000, rent_allocation_paise: 250000, other_expenses_paise: 204100, operating_profit_paise: 2985000, operating_margin_percent: 33.5, opening_cash_paise: 500000, cash_in_paise: 3120000, cash_out_paise: 500000, expected_closing_cash_paise: 3120000, declared_closing_cash_paise: 3000000, variance_paise: -120000, ...commonDemoFields }
  ],
  finance_supplier_payments: [
    { id: 'payment-001', supplier_name: "Fresh Foods Ltd", amount_paise: 4500000, due_date: "2026-08-07", status: "due_today", outlet_id: 'main', ...commonDemoFields },
    { id: 'payment-002', supplier_name: "Packaging Pro", amount_paise: 1250000, due_date: "2026-08-10", status: "due", outlet_id: 'main', ...commonDemoFields }
  ],
  compliance_tasks: [
    { id: 'compliance-001', title: "Fire Extinguisher Inspection", category: "Safety", priority: "critical", status: "open", owner_role: "manager", due_date: "2026-08-08", outlet_id: "main", ...commonDemoFields },
    { id: 'compliance-002', title: "Kitchen Temperature Audit", category: "Health", priority: "medium", status: "open", owner_role: "chef", due_date: "2026-08-07", outlet_id: "main", ...commonDemoFields },
    { id: 'compliance-003', title: "Staff ID Verification", category: "HR", priority: "low", status: "in_progress", owner_role: "manager", due_date: "2026-08-15", outlet_id: "main", ...commonDemoFields },
    { id: 'compliance-004', title: "Pest Control Renewal", category: "Maintenance", priority: "low", status: "scheduled", owner_role: "owner", due_date: "2026-09-01", outlet_id: "main", ...commonDemoFields }
  ],
  ca_reviews: [
    { id: 'ca-review-001', issue_type: "gst_mismatch", related_entity_type: "gst_reconciliations", related_entity_id: "gst-rec-002", title: "GST 2B Mismatch", amount_paise: 1250000, variance_paise: 9000, status: "manager_action_required", system_finding: "Supplier filed different GST amount in GSTR-1.", ilaraos_recommendation: "Request corrected invoice from supplier or accept difference if trivial.", outlet_id: "main", created_at: "2026-08-07T08:00:00Z", ...commonDemoFields },
    { id: 'ca-review-002', issue_type: "missing_invoice", related_entity_type: "finance_supplier_payments", related_entity_id: "payment-001", title: "Missing Purchase Invoice", amount_paise: 1180000, variance_paise: 0, status: "document_requested", system_finding: "Payment made but no GST invoice recorded.", ilaraos_recommendation: "Upload invoice to claim ITC.", outlet_id: "main", created_at: "2026-08-07T08:05:00Z", ...commonDemoFields },
    { id: 'ca-review-003', issue_type: "cash_variance", related_entity_type: "finance_snapshots", related_entity_id: "2026-08-07", title: "Cash Variance", amount_paise: 120000, variance_paise: -120000, status: "awaiting_ca", system_finding: "Declared closing cash is ₹1,200 short.", ilaraos_recommendation: "Review cash out entries and petty cash slips.", outlet_id: "main", created_at: "2026-08-07T08:10:00Z", ...commonDemoFields }
  ],
  ai_insights: [
    { id: 'bi-sales-001', agent_name: 'Sales AI', target_kpi: 'Daily Revenue Target', severity: 'warning', status: 'active', current_finding: 'High likelihood of 20% revenue drop tomorrow due to heavy rain forecast.', evidence: ['Weather API: 85% chance of heavy rain tomorrow 11 AM - 3 PM.', 'Historical correlation: Rain reduces walk-ins by 40%.'], business_impact: 'Potential loss of ₹18,000 in walk-in sales during lunch peak.', recommended_actions: ['Increase delivery platform marketing budget by ₹500.', 'Push 15% discount on Zomato/Swiggy for tomorrow lunch.'], owner_actions: [{ label: 'Approve Delivery Promo', action_type: 'create_approval', variant: 'primary' }, { label: 'Acknowledge Risk', action_type: 'acknowledge', variant: 'secondary' }], limitations: 'Forecast uses last 21 days plus current weather trend.', generated_at: '2026-08-07T06:00:00Z', outlet_id: 'main', ...commonDemoFields },
    { id: 'bi-inventory-001', agent_name: 'Inventory AI', target_kpi: 'Stock Availability', severity: 'critical', status: 'active', current_finding: 'Coffee Beans running critically low across 2 outlets.', evidence: ['Current stock: 1.2 kg.', 'Daily consumption rate: 0.8 kg.'], business_impact: 'Projected stock depletion in 48 hours. Risk of halting beverage sales.', recommended_actions: ['Place emergency order with primary supplier.', 'Transfer stock from secondary outlet.'], owner_actions: [{ label: 'Create Restock Task', action_type: 'create_corrective_task', variant: 'primary' }, { label: 'Go to Inventory', action_type: 'navigate', variant: 'secondary' }], limitations: 'Prediction assumes normal weekend demand spike.', generated_at: '2026-08-07T06:15:00Z', outlet_id: 'main', ...commonDemoFields },
    { id: 'bi-staff-001', agent_name: 'Staff AI', target_kpi: 'Shift Coverage', severity: 'info', status: 'active', current_finding: 'Shift coverage optimal for weekend peak. 2 pending leave approvals.', evidence: ['Scheduled staff: 16.', 'Required for peak: 14.'], business_impact: 'Labor cost is optimized for expected weekend volume.', recommended_actions: ['Review pending leave requests before next schedule release.'], owner_actions: [{ label: 'Go to Staffing', action_type: 'navigate', variant: 'primary' }], limitations: 'Does not account for sudden sick leaves.', generated_at: '2026-08-07T07:00:00Z', outlet_id: 'main', ...commonDemoFields },
    { id: 'bi-pricing-001', agent_name: 'Pricing AI', target_kpi: 'Market Competitiveness', severity: 'info', status: 'active', current_finding: 'Competitor down the street reduced Latte prices by 5%.', evidence: ['Market scraping detected price drop at "Cafe Alpha".'], business_impact: 'Minimal short-term impact expected on our premium customer segment.', recommended_actions: ['Monitor beverage sales volume over next 7 days.', 'No immediate price matching required.'], owner_actions: [{ label: 'Acknowledge', action_type: 'acknowledge', variant: 'secondary' }], limitations: 'Competitor data refreshed weekly.', generated_at: '2026-08-07T07:10:00Z', outlet_id: 'main', ...commonDemoFields },
    { id: 'bi-crm-001', agent_name: 'CRM AI', target_kpi: 'Customer Retention', severity: 'success', status: 'active', current_finding: '12 high-value loyal customers haven\'t visited in 30 days.', evidence: ['CRM Segment: "Platinum".', 'Last visit > 30 days.'], business_impact: 'Opportunity to reactivate ₹15,000 monthly recurring revenue.', recommended_actions: ['Send personalized "We Miss You" SMS with 10% returning offer.'], owner_actions: [{ label: 'Approve SMS Campaign', action_type: 'create_approval', variant: 'primary' }], limitations: 'Requires active SMS gateway credits.', generated_at: '2026-08-07T07:20:00Z', outlet_id: 'main', ...commonDemoFields },
    { id: 'bi-kitchen-001', agent_name: 'Kitchen AI', target_kpi: 'Prep Time Efficiency', severity: 'warning', status: 'active', current_finding: 'Average prep time increased by 2 mins during 7 PM - 9 PM peak.', evidence: ['KDS logs show Grill Station bottleneck.', 'Average order fulfillment time: 18 mins (Target: 15 mins).'], business_impact: 'Risk of negative delivery platform ratings due to delays.', recommended_actions: ['Assign extra staff to Grill Station during evening peak.', 'Review Grill menu item complexity.'], owner_actions: [{ label: 'Create Station Review Task', action_type: 'create_corrective_task', variant: 'primary' }], limitations: 'Based on KDS bump times, may include false positives if staff forget to bump.', generated_at: '2026-08-07T07:30:00Z', outlet_id: 'main', ...commonDemoFields },
    { id: 'bi-quality-001', agent_name: 'Quality AI', target_kpi: 'Customer Satisfaction', severity: 'warning', status: 'active', current_finding: 'Recent 3-star reviews frequently mention "cold fries".', evidence: ['NLP sentiment analysis on 45 recent Zomato reviews.', 'Keywords: "cold", "soggy", "fries".'], business_impact: 'Impacting overall outlet rating, currently at 4.2 (Target 4.5).', recommended_actions: ['Investigate packaging thermal retention for deliveries.', 'Ensure fries are packed last.'], owner_actions: [{ label: 'Create Quality Audit Task', action_type: 'create_corrective_task', variant: 'primary' }], limitations: 'Analyzes English text only.', generated_at: '2026-08-07T07:40:00Z', outlet_id: 'main', ...commonDemoFields },
    { id: 'bi-finance-001', agent_name: 'Finance AI', target_kpi: 'Operating Margin', severity: 'success', status: 'active', current_finding: 'Net margins improved by 2% this week.', evidence: ['Food cost dropped to 28% from 30%.', 'Waste reduction initiatives successful.'], business_impact: 'Added ₹45,000 to weekly bottom line.', recommended_actions: ['Maintain current portion controls.', 'Reward kitchen staff for waste reduction.'], owner_actions: [{ label: 'Acknowledge', action_type: 'acknowledge', variant: 'secondary' }], limitations: 'Pending final month-end CA reconciliation.', generated_at: '2026-08-07T07:50:00Z', outlet_id: 'main', ...commonDemoFields },
    { id: 'bi-growth-001', agent_name: 'Growth AI', target_kpi: 'Market Expansion', severity: 'info', status: 'active', current_finding: 'New corporate park opening nearby.', evidence: ['Local business registry update: Tech Park Phase 2 opening next month.', 'Distance: 1.2 km.'], business_impact: 'Opportunity for bulk corporate lunch orders.', recommended_actions: ['Create a specialized corporate lunch-pack menu.', 'Send sales rep to Tech Park administration.'], owner_actions: [{ label: 'Create Menu Development Task', action_type: 'create_corrective_task', variant: 'primary' }], limitations: 'Assumes high office occupancy rate.', generated_at: '2026-08-07T08:00:00Z', outlet_id: 'main', ...commonDemoFields }
  ],
  documents: [
    {
      id: 'doc-001',
      document_id: 'doc-001',
      category: 'proofs',
      related_entity_type: 'wastage',
      related_entity_id: 'w-001',
      original_filename: 'burnt_buns_proof.jpg',
      mime_type: 'image/jpeg',
      size_bytes: 245000,
      access_level: 'staff',
      uploaded_by: 'demo-kitchen-1',
      uploaded_at: '2026-08-07T08:00:00Z',
      status: 'available',
      version: 1,
      ...commonDemoFields
    },
    {
      id: 'doc-002',
      document_id: 'doc-002',
      category: 'invoices',
      related_entity_type: 'gst_reconciliations',
      related_entity_id: 'gst-rec-001',
      original_filename: 'fresh_foods_invoice.pdf',
      mime_type: 'application/pdf',
      size_bytes: 1045000,
      access_level: 'manager',
      uploaded_by: 'demo-manager-1',
      uploaded_at: '2026-08-07T08:15:00Z',
      status: 'available',
      version: 1,
      ...commonDemoFields
    }
  ],
  wastage_events: [
    {
      id: 'w-001',
      event_id: 'w-001',
      source_type: 'kitchen_error',
      event_type: 'wastage',
      loss_basis: 'menu_item',
      item_id: 'item-1',
      item_name: 'Classic Burger',
      quantity: 3,
      unit: 'pcs',
      cost_amount: 350,
      reason_category: 'Overcooked during rush hour',
      status: 'reported',
      reported_by: 'Chef One',
      reported_at: '2026-08-07T08:30:00Z',
      created_at: '2026-08-07T08:30:00Z',
      items: [{ menu_item_id: 'item-1', item_name: 'Classic Burger', quantity: 3 }],
      manager_note: 'Overcooked patty during peak rush',
      outlet_id: 'main',
      ...commonDemoFields
    },
    {
      id: 'w-002',
      event_id: 'w-002',
      source_type: 'spoilage',
      event_type: 'wastage',
      loss_basis: 'raw_material',
      item_id: 'inv-1',
      item_name: 'Burger Buns',
      quantity: 12,
      unit: 'pcs',
      cost_amount: 120,
      reason_category: 'Expired package',
      status: 'approved',
      reported_by: 'Ilara Manager',
      reported_at: '2026-08-06T18:00:00Z',
      created_at: '2026-08-06T18:00:00Z',
      items: [{ stock_item_id: 'inv-1', item_name: 'Burger Buns', quantity: 12 }],
      manager_note: 'Expired lot discarded after audit',
      outlet_id: 'main',
      ...commonDemoFields
    }
  ],
  approvals: [
    {
      id: 'app-001',
      request_id: 'app-001',
      ai_insight_id: 'bi-inventory-001',
      action_type: 'stock_adjustment',
      title: 'Stock Adjustment: Restock Coffee Beans',
      request_type: 'stock_adjustment',
      payload: { item: 'Coffee Beans', qty: 5 },
      reason: 'Coffee beans critical low alert',
      status: 'pending',
      requested_by: 'STAFF_DEMO_1',
      timestamp: '2026-08-07T08:30:53Z',
      requested_at: '2026-08-07T08:30:53Z',
      outlet_id: 'main',
      ...commonDemoFields
    },
    {
      id: 'app-002',
      request_id: 'app-002',
      ai_insight_id: 'bi-pricing-001',
      action_type: 'menu_edit',
      title: 'Menu Edit: Price Update',
      request_type: 'menu_edit',
      payload: { item_id: 'menu_biryani_nizami', proposed_price: 190 },
      reason: 'Update Nizami Dum Biryani portion pricing from 180 to 190 due to rice market inflation.',
      status: 'pending',
      requested_by: 'STAFF_MANAGER_01',
      timestamp: '2026-08-06T00:45:51Z',
      requested_at: '2026-08-06T00:45:51Z',
      outlet_id: 'main',
      ...commonDemoFields
    }
  ],
  refund_requests: [
    {
      id: 'ref-001',
      request_id: 'ref-001',
      order_id: 'ST-208',
      reason: 'Order took more than 50 minutes to prepare due to power trip.',
      requested_amount: 300,
      customer_note: 'Order took more than 50 minutes to prepare due to power trip.',
      status: 'pending',
      refund_status: 'pending',
      payment_status: 'pending',
      created_at: '2026-08-06T11:00:51Z',
      outlet_id: 'main',
      ...commonDemoFields
    }
  ],
  outlets: [
    {
      id: 'main',
      outlet_id: 'main',
      name: 'Main Outlet',
      address: 'BITS Pilani Hyderabad Campus, Shameerpet',
      latitude: 28.363,
      longitude: 75.587,
      status: 'active',
      hatches: ['MAIN', 'OASIS', 'SMOKING'],
      ...commonDemoFields
    }
  ]
};
