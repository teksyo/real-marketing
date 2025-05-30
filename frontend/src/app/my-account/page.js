'use client';

import { useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import AuthGuard from '@/components/AuthGuard';
import { useAuth } from '@/contexts/AuthContext';

export default function MyAccount() {
  const { user } = useAuth();

  return (
    <AuthGuard>
      <DashboardLayout>
        <div className="bg-white rounded-lg shadow p-6">
          <h1 className="text-2xl font-semibold text-gray-900 mb-6">
            My Account
          </h1>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <p className="text-gray-900">{user?.email || 'Loading...'}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Account Status</label>
              <p className="text-gray-900">Active</p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    </AuthGuard>
  );
} 