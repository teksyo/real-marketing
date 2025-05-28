'use client';

import { useState } from 'react';

const statusOptions = [
  'SCHEDULED',
  'COMPLETED',
  'CANCELED',
  'RESCHEDULED',
  'NO_SHOW',
];

const formatStatus = (status) => {
  return status.charAt(0) + status.slice(1).toLowerCase().replace('_', ' ');
};

export const AppointmentForm = ({
  initialData,
  onSubmit,
  isLoading,
  onCancel,
}) => {
  const [formData, setFormData] = useState(() => {
    if (initialData?.datetime) {
      // Convert datetime string to local datetime-local format
      const date = new Date(initialData.datetime);
      // Check if we're on the client side to avoid hydration mismatches
      if (typeof window !== 'undefined') {
        return {
          ...initialData,
          datetime: date.toISOString().slice(0, 16) // Format: "YYYY-MM-DDThh:mm"
        };
      }
    }
    return initialData || {};
  });
  const [errors, setErrors] = useState({});

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.title?.trim()) {
      newErrors.title = 'Title is required';
    }
    if (!formData.datetime) {
      newErrors.datetime = 'Date and time is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validateForm()) {
      // Convert datetime-local value to ISO string
      const submitData = {
        ...formData,
        datetime: formData.datetime ? new Date(formData.datetime).toISOString() : '',
      };
      onSubmit(submitData);
    }
  };

  const handleChange = (e) => {
    const { name, value, type } = e.target;
    let processedValue = value;

    if (type === 'number') {
      processedValue = value ? parseInt(value, 10) : undefined;
    }

    setFormData(prev => ({
      ...prev,
      [name]: processedValue
    }));

    // Clear error when field is modified
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  return (
    <div className="bg-white shadow-sm rounded-lg border border-gray-200">
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-medium text-gray-900">
          {initialData ? 'Edit Appointment' : 'New Appointment'}
        </h3>
      </div>
      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
            Title *
          </label>
          <input
            type="text"
            id="title"
            name="title"
            value={formData.title || ''}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Enter appointment title"
          />
          {errors.title && (
            <p className="mt-1 text-sm text-red-600">{errors.title}</p>
          )}
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            value={formData.description || ''}
            onChange={handleChange}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Enter appointment description"
          />
        </div>

        <div>
          <label htmlFor="datetime" className="block text-sm font-medium text-gray-700 mb-1">
            Date and Time *
          </label>
          <input
            type="datetime-local"
            id="datetime"
            name="datetime"
            value={formData.datetime || ''}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          {errors.datetime && (
            <p className="mt-1 text-sm text-red-600">{errors.datetime}</p>
          )}
        </div>

        <div>
          <label htmlFor="location" className="block text-sm font-medium text-gray-700 mb-1">
            Location
          </label>
          <input
            type="text"
            id="location"
            name="location"
            value={formData.location || ''}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Enter appointment location"
          />
        </div>

        <div>
          <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">
            Status
          </label>
          <select
            id="status"
            name="status"
            value={formData.status || 'SCHEDULED'}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {formatStatus(status)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
            Notes
          </label>
          <textarea
            id="notes"
            name="notes"
            value={formData.notes || ''}
            onChange={handleChange}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Enter any additional notes"
          />
        </div>

        <div>
          <label htmlFor="leadId" className="block text-sm font-medium text-gray-700 mb-1">
            Lead ID (Optional)
          </label>
          <input
            type="number"
            id="leadId"
            name="leadId"
            value={formData.leadId || ''}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Link to a specific lead"
          />
        </div>

        <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Saving...' : 'Save Appointment'}
          </button>
        </div>
      </form>
    </div>
  );
}; 