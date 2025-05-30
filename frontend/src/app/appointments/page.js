'use client';

import DashboardLayout from '@/components/DashboardLayout';
import AuthGuard from '@/components/AuthGuard';
import { AppointmentList } from '@/components/appointments/AppointmentList';

export default function AppointmentsPage() {
  return (
    <AuthGuard>
      <DashboardLayout>
        <AppointmentList />
      </DashboardLayout>
    </AuthGuard>
  );
} 