'use client';

import { useState, useEffect } from 'react';
import { getAppointments, deleteAppointment, updateAppointment } from '@/services/appointments';
import { AppointmentForm } from './AppointmentForm';
import { PlusIcon, PencilIcon, TrashIcon, CalendarIcon, MapPinIcon, ClockIcon } from '@heroicons/react/24/outline';

const statusColors = {
  SCHEDULED: 'bg-blue-100 text-blue-800',
  COMPLETED: 'bg-green-100 text-green-800',
  CANCELED: 'bg-red-100 text-red-800',
  RESCHEDULED: 'bg-yellow-100 text-yellow-800',
  NO_SHOW: 'bg-gray-100 text-gray-800',
};

const formatStatus = (status) => {
  return status.charAt(0) + status.slice(1).toLowerCase().replace('_', ' ');
};

const formatDateTime = (datetime) => {
  if (typeof window === 'undefined') {
    // Return a consistent format for server-side rendering
    return new Date(datetime).toISOString().slice(0, 16).replace('T', ' ');
  }
  const date = new Date(datetime);
  return date.toLocaleString();
};

export const AppointmentList = () => {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState(null);
  const [formLoading, setFormLoading] = useState(false);

  const fetchAppointments = async () => {
    try {
      setLoading(true);
      const data = await getAppointments();
      setAppointments(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAppointments();
  }, []);

  const handleCreateAppointment = async (appointmentData) => {
    try {
      setFormLoading(true);
      const { createAppointment } = await import('@/services/appointments');
      await createAppointment(appointmentData);
      await fetchAppointments();
      setShowForm(false);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setFormLoading(false);
    }
  };

  const handleUpdateAppointment = async (appointmentData) => {
    try {
      setFormLoading(true);
      await updateAppointment(editingAppointment.id, appointmentData);
      await fetchAppointments();
      setEditingAppointment(null);
      setShowForm(false);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeleteAppointment = async (id) => {
    if (!confirm('Are you sure you want to delete this appointment?')) {
      return;
    }

    try {
      await deleteAppointment(id);
      await fetchAppointments();
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  };

  const openEditForm = (appointment) => {
    setEditingAppointment(appointment);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingAppointment(null);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Appointments</h1>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          <PlusIcon className="h-4 w-4 mr-2" />
          New Appointment
        </button>
      </div>

      {/* Error message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="mb-6">
          <AppointmentForm
            initialData={editingAppointment}
            onSubmit={editingAppointment ? handleUpdateAppointment : handleCreateAppointment}
            isLoading={formLoading}
            onCancel={closeForm}
          />
        </div>
      )}

      {/* Appointments List */}
      {appointments.length === 0 ? (
        <div className="text-center py-12">
          <CalendarIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No appointments yet</h3>
          <p className="text-gray-500 mb-4">Get started by creating your first appointment.</p>
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700"
          >
            <PlusIcon className="h-4 w-4 mr-2" />
            Create Appointment
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {appointments.map((appointment) => (
            <div
              key={appointment.id}
              className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-lg font-medium text-gray-900 truncate">
                  {appointment.title}
                </h3>
                <div className="flex space-x-2">
                  <button
                    onClick={() => openEditForm(appointment)}
                    className="text-gray-400 hover:text-blue-600 p-1"
                    title="Edit appointment"
                  >
                    <PencilIcon className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteAppointment(appointment.id)}
                    className="text-gray-400 hover:text-red-600 p-1"
                    title="Delete appointment"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {appointment.description && (
                <p className="text-gray-600 text-sm mb-3 line-clamp-2">
                  {appointment.description}
                </p>
              )}

              <div className="space-y-2 mb-4">
                <div className="flex items-center text-sm text-gray-600">
                  <ClockIcon className="h-4 w-4 mr-2 flex-shrink-0" />
                  {formatDateTime(appointment.datetime)}
                </div>

                {appointment.location && (
                  <div className="flex items-center text-sm text-gray-600">
                    <MapPinIcon className="h-4 w-4 mr-2 flex-shrink-0" />
                    <span className="truncate">{appointment.location}</span>
                  </div>
                )}

                {appointment.lead && (
                  <div className="text-sm text-gray-600">
                    <span className="font-medium">Lead:</span> {appointment.lead.address || 'N/A'} ({appointment.lead.zipCode})
                  </div>
                )}
              </div>

              <div className="flex justify-between items-center">
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    statusColors[appointment.status] || statusColors.SCHEDULED
                  }`}
                >
                  {formatStatus(appointment.status)}
                </span>

                {appointment.notes && (
                  <div className="text-xs text-gray-500" title={appointment.notes}>
                    📝 Notes
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}; 