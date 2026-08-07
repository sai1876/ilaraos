// [INTERNAL] - Morning HUD task checklist projection for operational dashboard.
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';

export async function GET() {
  try {
    let tasks: any[] = [];
    if (adminDb) {
      const snap = await adminDb.collection('ai_insights').limit(6).get();
      if (!snap.empty) {
        tasks = snap.docs.map(doc => {
          const d = doc.data();
          return {
            id: d.target_kpi || doc.id,
            title: (d.agent_name ? d.agent_name + ': ' : '') + (d.target_kpi || 'Insight'),
            description: d.current_finding || d.recommendation || 'Action required for morning setup.',
            severity: d.severity || 'info'
          };
        });
      }
    }

    if (tasks.length === 0) {
      tasks = [
        { id: 'CHECK-01', title: 'Espresso Calibration', description: 'Calibrate water pressure & grind size for morning rush.', severity: 'info' },
        { id: 'CHECK-02', title: 'Milk & Dairy Stock', description: 'Ensure 15L milk is chilled in primary dispenser.', severity: 'warning' },
        { id: 'CHECK-03', title: 'POS Terminal Audit', description: 'Verify POS terminal sync and UPI QR scanner connectivity.', severity: 'critical' },
        { id: 'CHECK-04', title: 'Hatch Hand-off Prep', description: 'Clean and sanitize OASIS and MAIN pickup hatches.', severity: 'info' }
      ];
    }

    return NextResponse.json({ tasks });
  } catch (error) {
    return NextResponse.json({
      tasks: [
        { id: 'CHECK-01', title: 'Espresso Calibration', description: 'Calibrate water pressure & grind size for morning rush.', severity: 'info' },
        { id: 'CHECK-02', title: 'Milk & Dairy Stock', description: 'Ensure 15L milk is chilled in primary dispenser.', severity: 'warning' },
        { id: 'CHECK-03', title: 'POS Terminal Audit', description: 'Verify POS terminal sync and UPI QR scanner connectivity.', severity: 'critical' }
      ]
    });
  }
}