'use client';

import { useState } from 'react';
import axios from 'axios';
import DashboardLayout from '@/components/DashboardLayout';
import USAMap from '@/components/USAMap';
import LeadsList from '@/components/LeadsList';

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function Dashboard() {
  const [selectedRegion, setSelectedRegion] = useState(null);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleRegionSelect = async (region) => {
    setLoading(true);
    setSelectedRegion(region);
    
    try {
      const token = localStorage.getItem('token');
      
      // Fetch existing leads for this region
      const leadsResponse = await axios.get(`${API_URL}/api/leads/region/${region.name}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      
      // Set leads (will be empty array if none found)
      setLeads(leadsResponse.data);
      
    } catch (error) {
      console.error('Failed to fetch leads:', error);
      setLeads([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col space-y-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h1 className="text-2xl font-semibold text-gray-900 mb-4">
            Real Estate Leads Dashboard
          </h1>
          <p className="text-gray-600">
            Select a region on the map to view available leads.
          </p>
        </div>

        <div className="flex gap-6">
          {/* Map Section (75%) */}
          <div className="flex-[3] bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">
              United States Map
            </h2>
            <USAMap onRegionSelect={handleRegionSelect} />
          </div>

          {/* Leads Section (25%) */}
          <div className="flex-1 bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">
              {selectedRegion ? `Leads in ${selectedRegion.name}` : 'Select a Region'}
            </h2>
            <LeadsList leads={leads} loading={loading} />
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <div className="bg-blue-50 p-6 rounded-lg">
            <h3 className="text-lg font-medium text-blue-900">Active Listings</h3>
            <p className="mt-2 text-3xl font-semibold text-blue-600">{leads.length}</p>
          </div>
          
          <div className="bg-green-50 p-6 rounded-lg">
            <h3 className="text-lg font-medium text-green-900">Total Leads</h3>
            <p className="mt-2 text-3xl font-semibold text-green-600">{leads.length}</p>
          </div>
          
          <div className="bg-purple-50 p-6 rounded-lg">
            <h3 className="text-lg font-medium text-purple-900">Selected Region</h3>
            <p className="mt-2 text-xl font-semibold text-purple-600">
              {selectedRegion?.name || 'None'}
            </p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
} 