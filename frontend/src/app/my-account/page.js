'use client';

import { useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import DashboardLayout from '@/components/DashboardLayout';
import Input from '@/components/Input';
import Button from '@/components/Button';
import { API_URL } from '@/utils/api';

export default function MyAccount() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    currentPassword: '',
    newPassword: '',
    confirmNewPassword: '',
  });
  const [loading, setLoading] = useState(false);

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    if (formData.newPassword && formData.newPassword !== formData.confirmNewPassword) {
      toast.error('New passwords do not match');
      return;
    }

    setLoading(true);

    try {
      const response = await axios.put(`${API_URL}/api/auth/profile`, {
        name: formData.name,
        email: formData.email,
        currentPassword: formData.currentPassword,
        newPassword: formData.newPassword,
      });
      toast.success('Profile updated successfully!');
      // Reset password fields
      setFormData(prev => ({
        ...prev,
        currentPassword: '',
        newPassword: '',
        confirmNewPassword: '',
      }));
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-semibold text-gray-900 mb-6">
          My Account
        </h1>

        <form onSubmit={handleUpdateProfile} className="space-y-6 max-w-lg">
          <div className="space-y-4">
            <Input
              label="Full Name"
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
            
            <Input
              label="Email Address"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />

            <div className="border-t border-gray-200 pt-4">
              <h2 className="text-lg font-medium text-gray-900 mb-4">Change Password</h2>
              
              <Input
                label="Current Password"
                type="password"
                value={formData.currentPassword}
                onChange={(e) => setFormData({ ...formData, currentPassword: e.target.value })}
              />
              
              <Input
                label="New Password"
                type="password"
                value={formData.newPassword}
                onChange={(e) => setFormData({ ...formData, newPassword: e.target.value })}
              />
              
              <Input
                label="Confirm New Password"
                type="password"
                value={formData.confirmNewPassword}
                onChange={(e) => setFormData({ ...formData, confirmNewPassword: e.target.value })}
              />
            </div>
          </div>

          <div>
            <Button
              type="submit"
              disabled={loading}
            >
              {loading ? 'Saving changes...' : 'Save changes'}
            </Button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
} 