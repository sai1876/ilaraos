export const ORDER_PROGRESS_STEPS = ['confirmed', 'preparing', 'ready', 'completed'] as const;

export function getOrderProgressIndex(status: string): number {
  if (status === 'completed' || status === 'delivered') return 3;
  if (status === 'ready') return 2;
  if (status === 'preparing' || status === 'accepted') return 1;
  return 0;
}

export function getReferralProgress(referralCount: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(100, Math.max(0, (referralCount / target) * 100));
}

export function getTableCheckoutHref(tableNumber: string, tableToken?: string): string {
  const tableParam = encodeURIComponent(tableNumber);
  const tokenParam = tableToken ? `&tableToken=${encodeURIComponent(tableToken)}` : '';
  return `/cart?table=${tableParam}${tokenParam}`;
}
