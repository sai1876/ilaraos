'use client';

import React from 'react';

interface DocumentTypeBadgeProps {
  category?: string;
  documentType: string;
  className?: string;
}

export default function DocumentTypeBadge({ category, documentType, className = '' }: DocumentTypeBadgeProps) {
  const getBadgeStyle = (type: string) => {
    switch (type) {
      case 'supplier_invoice':
      case 'purchase_invoice':
      case 'expense_invoice':
      case 'maintenance_invoice':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'expense_receipt':
      case 'payment_proof':
      case 'refund_payment_proof':
      case 'upi_settlement_proof':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'wastage_photo':
      case 'goods_received_photo':
      case 'refund_evidence':
      case 'complaint_evidence':
      case 'delivery_proof':
      case 'corrective_action_proof':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'cash_count_proof':
      case 'stock_adjustment_proof':
      case 'purchase_quotation':
      case 'delivery_challan':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      default:
        return 'bg-zinc-50 text-zinc-700 border-zinc-200';
    }
  };

  const formattedName = documentType.replace(/_/g, ' ');

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase tracking-wider border ${getBadgeStyle(documentType)} ${className}`}>
      {formattedName}
    </span>
  );
}
