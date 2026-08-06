import type { Staff } from '@/lib/types';
import { apiRequest } from '@/lib/apiClient';

type OperationalRecord = Record<string, unknown> & { id: string };

export const fetchStaffList = async (outletId?: string): Promise<Staff[]> => {
  const queryString = outletId ? `?outlet_id=${encodeURIComponent(outletId)}` : '';
  const result = await apiRequest<{ staff: Staff[] }>(`/api/operations/staff-directory${queryString}`);
  return result.staff;
};

export const logAttendance = async (staffId: string, _status: string, outlet: string) => {
  await apiRequest('/api/operations/attendance', {
    method: 'POST',
    body: JSON.stringify({ action: 'clock_in', staff_id: staffId, outlet_id: outlet }),
  });
};

export const clockOutAttendance = async (id: string, staffId: string) => {
  await apiRequest('/api/operations/attendance', {
    method: 'POST',
    body: JSON.stringify({ action: 'clock_out', attendance_id: id, staff_id: staffId }),
  });
};

export const fetchAttendanceLogs = async (date?: string, outletId?: string): Promise<OperationalRecord[]> => {
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  if (outletId) params.set('outlet_id', outletId);
  const result = await apiRequest<{ attendance: OperationalRecord[] }>(
    `/api/operations/attendance?${params.toString()}`,
  );
  return result.attendance;
};

export const addShiftRecord = async (data: Record<string, unknown>) => {
  await apiRequest('/api/operations/shifts', {
    method: 'POST',
    body: JSON.stringify({
      staff_id: data.staff_id,
      outlet_id: data.outlet_id || data.outlet,
      start_time: data.start_time,
      end_time: data.end_time,
      role: data.role,
      hatch: data.hatch,
      date: data.date,
    }),
  });
};

export const fetchShiftsForDate = async (date: string, outletId?: string): Promise<OperationalRecord[]> => {
  const params = new URLSearchParams({ date });
  if (outletId) params.set('outlet_id', outletId);
  const result = await apiRequest<{ shifts: OperationalRecord[] }>(
    `/api/operations/shifts?${params.toString()}`,
  );
  return result.shifts;
};
