'use server';

import { z } from 'zod';
import { requireSessionActor } from '@/server/auth/requireSessionActor';
import { rateLimitDurable } from '@/lib/rateLimit';
import { triggerLowStockAlert } from '@/server/notifications/triggerLowStockAlert';

const alertSchema = z.object({
  ingredient: z.string().trim().min(1).max(120),
  current: z.number().finite().min(0).max(1_000_000),
  threshold: z.number().finite().min(0).max(1_000_000),
  unit: z.string().trim().min(1).max(40),
}).strict();

export async function triggerCustomerLowStockAlert(data: {
  ingredient: string;
  current: number;
  threshold: number;
  unit: string;
}) {
  const actor = await requireSessionActor(['manager', 'admin', 'owner']);
  const parsed = alertSchema.safeParse(data);
  if (!parsed.success) return { success: false };

  const limit = await rateLimitDurable(`low-stock-alert:${actor.uid}`, 10, 60 * 1000);
  if (!limit.success) return { success: false };

  const sent = await triggerLowStockAlert(
    {
      name: parsed.data.ingredient,
      current: parsed.data.current,
      threshold: parsed.data.threshold,
      unit: parsed.data.unit,
    },
    actor.outletId || 'Global Supply',
  );

  return { success: sent };
}
