'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { leadService, LEAD_STATUSES, LEAD_PRIORITIES, LEAD_SOURCES } from '@/services/leads';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';

export default function EditLeadPage() {
  const params = useParams();
  const router = useRouter();
  const leadId = parseInt(params.id);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [lead, setLead] = useState(null);
  
  const [formData, setFormData] = useState({
    address: '',
    price: '',
    beds: '',
    zipCode: '',
    phoneNumber: '',
    priority: 'MEDIUM',
    source: 'MANUAL',
    notes: '',
    nextFollowUpDate: '',
  });

  // Fetch lead data
  const fetchLead = async () => {
    try {
      setLoading(true);
      const leadData = await leadService.getLeadById(leadId);
      setLead(leadData);
      
      // Populate form with existing data
      setFormData({
        address: leadData.address || '',
        price: leadData.price || '',
        beds: leadData.beds || '',
        zipCode: leadData.zipCode || '',
        phoneNumber: leadData.contacts && leadData.contacts.length > 0 ? leadData.contacts[0].phoneNumber : '',
        priority: leadData.priority || 'MEDIUM',
        source: leadData.source || 'MANUAL',
        notes: leadData.notes || '',
        nextFollowUpDate: leadData.nextFollowUpDate ? new Date(leadData.nextFollowUpDate).toISOString().split('T')[0] : '',
      });
    } catch (err) {
      setError('Failed to fetch lead details');
      console.error('Error fetching lead:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.zipCode.trim()) {
      setError('ZIP code is required');
      return;
    }

    try {
      setSaving(true);
      setError('');
      
      const leadData = {
        ...formData,
        price: formData.price || null,
        beds: formData.beds || null,
        notes: formData.notes || null,
        nextFollowUpDate: formData.nextFollowUpDate || null,
      };

      await leadService.updateLead(leadId, leadData);
      router.push(`/leads/${leadId}`);
    } catch (err) {
      setError(err.message || 'Failed to update lead');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    
    // Clear error when user starts typing
    if (error) setError('');
  };

  useEffect(() => {
    fetchLead();
  }, [leadId]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="p-6 max-w-2xl mx-auto">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded mb-4"></div>
            <div className="h-96 bg-gray-200 rounded"></div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error && !lead) {
    return (
      <DashboardLayout>
        <div className="p-6 max-w-2xl mx-auto">
          <div className="text-center py-12">
            <div className="text-red-400 text-xl mb-4">Error</div>
            <p className="text-gray-600 mb-6">{error}</p>
            <Link
              href="/leads"
              className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700"
            >
              <ArrowLeftIcon className="h-5 w-5" />
              Back to Leads
            </Link>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-4 mb-4">
            <Link
              href={`/leads/${leadId}`}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-800"
            >
              <ArrowLeftIcon className="h-5 w-5" />
              Back to Lead
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Edit Lead</h1>
          <p className="text-gray-600">Update lead information</p>
        </div>

        {/* Form */}
        <div className="bg-white rounded-lg shadow p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}

            {/* Property Information */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Property Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Address */}
                <div className="md:col-span-2">
                  <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-1">
                    Property Address
                  </label>
                  <input
                    type="text"
                    id="address"
                    name="address"
                    value={formData.address}
                    onChange={handleChange}
                    placeholder="123 Main St, City, State"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* ZIP Code */}
                <div>
                  <label htmlFor="zipCode" className="block text-sm font-medium text-gray-700 mb-1">
                    ZIP Code <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="zipCode"
                    name="zipCode"
                    value={formData.zipCode}
                    onChange={handleChange}
                    placeholder="12345"
                    required
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Price */}
                <div>
                  <label htmlFor="price" className="block text-sm font-medium text-gray-700 mb-1">
                    Price
                  </label>
                  <input
                    type="text"
                    id="price"
                    name="price"
                    value={formData.price}
                    onChange={handleChange}
                    placeholder="500000"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Beds */}
                <div>
                  <label htmlFor="beds" className="block text-sm font-medium text-gray-700 mb-1">
                    Bedrooms
                  </label>
                  <input
                    type="text"
                    id="beds"
                    name="beds"
                    value={formData.beds}
                    onChange={handleChange}
                    placeholder="3"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Phone Number */}
                <div>
                  <label htmlFor="phoneNumber" className="block text-sm font-medium text-gray-700 mb-1">
                    Phone Number
                  </label>
                  <input
                    type="text"
                    id="phoneNumber"
                    name="phoneNumber"
                    value={formData.phoneNumber}
                    onChange={handleChange}
                    placeholder="123-456-7890"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Primary contact phone number for this lead
                  </p>
                </div>
              </div>
            </div>

            {/* Lead Classification */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Lead Classification</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Priority */}
                <div>
                  <label htmlFor="priority" className="block text-sm font-medium text-gray-700 mb-1">
                    Priority
                  </label>
                  <select
                    id="priority"
                    name="priority"
                    value={formData.priority}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {LEAD_PRIORITIES.map(priority => (
                      <option key={priority.value} value={priority.value}>
                        {priority.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Source */}
                <div>
                  <label htmlFor="source" className="block text-sm font-medium text-gray-700 mb-1">
                    Lead Source
                  </label>
                  <select
                    id="source"
                    name="source"
                    value={formData.source}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {LEAD_SOURCES.map(source => (
                      <option key={source.value} value={source.value}>
                        {source.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Follow-up and Notes */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Additional Information</h3>
              <div className="space-y-4">
                {/* Next Follow-up Date */}
                <div>
                  <label htmlFor="nextFollowUpDate" className="block text-sm font-medium text-gray-700 mb-1">
                    Next Follow-up Date
                  </label>
                  <input
                    type="date"
                    id="nextFollowUpDate"
                    name="nextFollowUpDate"
                    value={formData.nextFollowUpDate}
                    onChange={handleChange}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Notes */}
                <div>
                  <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
                    Notes
                  </label>
                  <textarea
                    id="notes"
                    name="notes"
                    value={formData.notes}
                    onChange={handleChange}
                    rows={6}
                    placeholder="Any additional information about this lead..."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Note: Adding notes here will replace existing notes. Use the "Add Note" feature on the lead detail page to append notes.
                  </p>
                </div>
              </div>
            </div>

            {/* Current Status Display */}
            {lead && (
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-900 mb-2">Current Lead Status</h4>
                <div className="flex items-center gap-4">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    lead.status === 'NEW' ? 'bg-blue-100 text-blue-800' :
                    lead.status === 'CONTACTED' ? 'bg-yellow-100 text-yellow-800' :
                    lead.status === 'INTERESTED' ? 'bg-green-100 text-green-800' :
                    lead.status === 'QUALIFIED' ? 'bg-purple-100 text-purple-800' :
                    lead.status === 'CONVERTED' ? 'bg-green-100 text-green-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {LEAD_STATUSES.find(s => s.value === lead.status)?.label || lead.status}
                  </span>
                  <span className="text-sm text-gray-600">
                    Last Contact: {lead.lastContactDate ? new Date(lead.lastContactDate).toLocaleDateString() : 'Never'}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  To update the lead status, use the "Update Status" button on the lead detail page.
                </p>
              </div>
            )}

            {/* Form Actions */}
            <div className="flex justify-end gap-4 pt-4 border-t border-gray-200">
              <Link
                href={`/leads/${leadId}`}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Lead Information Summary */}
        {lead && (
          <div className="mt-6 text-sm text-gray-600">
            <h4 className="font-medium mb-2">Lead Information:</h4>
            <ul className="list-disc list-inside space-y-1">
              <li>Created: {new Date(lead.createdAt).toLocaleDateString()}</li>
              <li>Last Updated: {new Date(lead.updatedAt).toLocaleDateString()}</li>
              <li>SMS Conversations: {lead.smsConversations?.length || 0}</li>
              <li>Appointments: {lead.appointments?.length || 0}</li>
              <li>Activities: {lead.leadActivities?.length || 0}</li>
            </ul>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
} 