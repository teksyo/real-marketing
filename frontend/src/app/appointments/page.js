'use client';

import DashboardLayout from '@/components/DashboardLayout';
import { AppointmentList } from '@/components/appointments/AppointmentList';

export default function AppointmentsPage() {
  return (
    <DashboardLayout>
      <AppointmentList />
    </DashboardLayout>
  );
} 