import { API_URL, apiFetch } from '@/utils/api';

const API_BASE_URL = API_URL;

// Lead Management API
export const leadService = {
  // Get all leads with filtering and pagination
  getLeads: async (filters = {}) => {
    try {
      const queryParams = new URLSearchParams();
      
      Object.keys(filters).forEach(key => {
        if (filters[key] !== undefined && filters[key] !== '') {
          queryParams.append(key, filters[key]);
        }
      });

      const response = await apiFetch(`${API_BASE_URL}/api/leads?${queryParams}`, {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch leads');
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching leads:', error);
      throw error;
    }
  },

  // Get specific lead by ID
  getLeadById: async (leadId) => {
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/leads/${leadId}`, {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch lead');
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching lead:', error);
      throw error;
    }
  },

  // Create new lead
  createLead: async (leadData) => {
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/leads`, {
        method: 'POST',
        body: JSON.stringify(leadData),
      });

      if (!response.ok) {
        throw new Error('Failed to create lead');
      }

      return await response.json();
    } catch (error) {
      console.error('Error creating lead:', error);
      throw error;
    }
  },

  // Update lead
  updateLead: async (leadId, leadData) => {
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/leads/${leadId}`, {
        method: 'PUT',
        body: JSON.stringify(leadData),
      });

      if (!response.ok) {
        throw new Error('Failed to update lead');
      }

      return await response.json();
    } catch (error) {
      console.error('Error updating lead:', error);
      throw error;
    }
  },

  // Update lead status
  updateLeadStatus: async (leadId, status, notes = '') => {
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/leads/${leadId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status, notes }),
      });

      if (!response.ok) {
        throw new Error('Failed to update lead status');
      }

      return await response.json();
    } catch (error) {
      console.error('Error updating lead status:', error);
      throw error;
    }
  },

  // Add note to lead
  addNote: async (leadId, note) => {
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/leads/${leadId}/notes`, {
        method: 'POST',
        body: JSON.stringify({ note }),
      });

      if (!response.ok) {
        throw new Error('Failed to add note');
      }

      return await response.json();
    } catch (error) {
      console.error('Error adding note:', error);
      throw error;
    }
  },

  // Get lead activities
  getLeadActivities: async (leadId, page = 1, limit = 50) => {
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/leads/${leadId}/activities?page=${page}&limit=${limit}`, {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch lead activities');
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching lead activities:', error);
      throw error;
    }
  },

  // Schedule follow-up
  scheduleFollowUp: async (leadId, followUpDate, notes = '') => {
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/leads/${leadId}/follow-up`, {
        method: 'POST',
        body: JSON.stringify({ followUpDate, notes }),
      });

      if (!response.ok) {
        throw new Error('Failed to schedule follow-up');
      }

      return await response.json();
    } catch (error) {
      console.error('Error scheduling follow-up:', error);
      throw error;
    }
  },

  // Delete lead
  deleteLead: async (leadId) => {
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/leads/${leadId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete lead');
      }

      return await response.json();
    } catch (error) {
      console.error('Error deleting lead:', error);
      throw error;
    }
  },

  // Get leads by region (existing functionality)
  getLeadsByRegion: async (region) => {
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/leads/region/${region}`, {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch leads by region');
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching leads by region:', error);
      throw error;
    }
  },

  // Get leads by ZIP code (existing functionality)
  getLeadsByZip: async (zip) => {
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/leads/zip/${zip}`, {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch leads by ZIP code');
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching leads by ZIP code:', error);
      throw error;
    }
  },
};

// SMS Service
export const smsService = {
  // Get SMS conversations
  getConversations: async (filters = {}) => {
    try {
      const queryParams = new URLSearchParams();
      
      Object.keys(filters).forEach(key => {
        if (filters[key] !== undefined && filters[key] !== '') {
          queryParams.append(key, filters[key]);
        }
      });

      const response = await apiFetch(`${API_BASE_URL}/api/sms/conversations?${queryParams}`, {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch SMS conversations');
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching SMS conversations:', error);
      throw error;
    }
  },

  // Get specific conversation
  getConversation: async (conversationId) => {
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/sms/conversations/${conversationId}`, {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch conversation');
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching conversation:', error);
      throw error;
    }
  },

  // Create SMS conversation
  createConversation: async (leadId, phoneNumber) => {
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/sms/conversations`, {
        method: 'POST',
        body: JSON.stringify({ leadId, phoneNumber }),
      });

      if (!response.ok) {
        throw new Error('Failed to create conversation');
      }

      return await response.json();
    } catch (error) {
      console.error('Error creating conversation:', error);
      throw error;
    }
  },

  // Send SMS message
  sendMessage: async (conversationId, content, phoneNumber = null) => {
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/sms/send`, {
        method: 'POST',
        body: JSON.stringify({ conversationId, content, phoneNumber }),
      });

      if (!response.ok) {
        throw new Error('Failed to send SMS');
      }

      return await response.json();
    } catch (error) {
      console.error('Error sending SMS:', error);
      throw error;
    }
  },

  // Get messages for conversation
  getMessages: async (conversationId, page = 1, limit = 50) => {
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/sms/messages/${conversationId}?page=${page}&limit=${limit}`, {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch messages');
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching messages:', error);
      throw error;
    }
  },

  // Update conversation status
  updateConversationStatus: async (conversationId, isActive) => {
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/sms/conversations/${conversationId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ isActive }),
      });

      if (!response.ok) {
        throw new Error('Failed to update conversation status');
      }

      return await response.json();
    } catch (error) {
      console.error('Error updating conversation status:', error);
      throw error;
    }
  },

  // Get SMS statistics
  getStats: async () => {
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/sms/stats`, {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch SMS stats');
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching SMS stats:', error);
      // Return default stats if API fails
      return {
        totalMessages: 0,
        activeConversations: 0,
        responseRate: '0'
      };
    }
  },

  // Delete conversation
  deleteConversation: async (conversationId) => {
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/sms/conversations/${conversationId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete conversation');
      }

      return await response.json();
    } catch (error) {
      console.error('Error deleting conversation:', error);
      throw error;
    }
  },
};

// Constants for status options
export const LEAD_STATUSES = [
  { value: 'NEW', label: 'New', color: 'bg-blue-100 text-blue-800' },
  { value: 'CONTACTED', label: 'Contacted', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'INTERESTED', label: 'Interested', color: 'bg-green-100 text-green-800' },
  { value: 'NOT_INTERESTED', label: 'Not Interested', color: 'bg-red-100 text-red-800' },
  { value: 'QUALIFIED', label: 'Qualified', color: 'bg-purple-100 text-purple-800' },
  { value: 'UNQUALIFIED', label: 'Unqualified', color: 'bg-gray-100 text-gray-800' },
  { value: 'CONVERTED', label: 'Converted', color: 'bg-green-100 text-green-800' },
  { value: 'CLOSED_LOST', label: 'Closed Lost', color: 'bg-red-100 text-red-800' },
];

export const LEAD_PRIORITIES = [
  { value: 'LOW', label: 'Low', color: 'bg-gray-100 text-gray-800' },
  { value: 'MEDIUM', label: 'Medium', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'HIGH', label: 'High', color: 'bg-orange-100 text-orange-800' },
  { value: 'URGENT', label: 'Urgent', color: 'bg-red-100 text-red-800' },
];

export const LEAD_SOURCES = [
  { value: 'ZILLOW', label: 'Zillow' },
  { value: 'MANUAL', label: 'Manual Entry' },
  { value: 'REFERRAL', label: 'Referral' },
  { value: 'WEBSITE', label: 'Website' },
  { value: 'SOCIAL_MEDIA', label: 'Social Media' },
  { value: 'OTHER', label: 'Other' },
];

export const ACTIVITY_TYPES = {
  SMS_SENT: 'SMS Sent',
  SMS_RECEIVED: 'SMS Received',
  APPOINTMENT_SCHEDULED: 'Appointment Scheduled',
  APPOINTMENT_COMPLETED: 'Appointment Completed',
  STATUS_CHANGED: 'Status Changed',
  NOTE_ADDED: 'Note Added',
  CALL_MADE: 'Call Made',
  EMAIL_SENT: 'Email Sent',
  FOLLOW_UP_SCHEDULED: 'Follow-up Scheduled',
  LEAD_CREATED: 'Lead Created',
}; 