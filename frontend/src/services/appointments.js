import { API_URL } from '@/utils/api';

const API_BASE_URL = API_URL;

// Get JWT token from localStorage
const getAuthToken = () => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('token');
  }
  return null;
};

// Create headers with authorization
const createHeaders = () => {
  const token = getAuthToken();
  return {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` }),
  };
};

// Get all appointments
export const getAppointments = async () => {
  const response = await fetch(`${API_BASE_URL}/api/appointments`, {
    headers: createHeaders(),
  });

  if (!response.ok) {
    throw new Error('Failed to fetch appointments');
  }

  return response.json();
};

// Get appointment by ID
export const getAppointment = async (id) => {
  const response = await fetch(`${API_BASE_URL}/api/appointments/${id}`, {
    headers: createHeaders(),
  });

  if (!response.ok) {
    throw new Error('Failed to fetch appointment');
  }

  return response.json();
};

// Create new appointment
export const createAppointment = async (appointmentData) => {
  const response = await fetch(`${API_BASE_URL}/api/appointments`, {
    method: 'POST',
    headers: createHeaders(),
    body: JSON.stringify(appointmentData),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to create appointment');
  }

  return response.json();
};

// Update appointment
export const updateAppointment = async (id, appointmentData) => {
  const response = await fetch(`${API_BASE_URL}/api/appointments/${id}`, {
    method: 'PUT',
    headers: createHeaders(),
    body: JSON.stringify(appointmentData),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to update appointment');
  }

  return response.json();
};

// Delete appointment
export const deleteAppointment = async (id) => {
  const response = await fetch(`${API_BASE_URL}/api/appointments/${id}`, {
    method: 'DELETE',
    headers: createHeaders(),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to delete appointment');
  }
};

// Get appointments by status
export const getAppointmentsByStatus = async (status) => {
  const response = await fetch(`${API_BASE_URL}/api/appointments/status/${status}`, {
    headers: createHeaders(),
  });

  if (!response.ok) {
    throw new Error('Failed to fetch appointments by status');
  }

  return response.json();
}; 