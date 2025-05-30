const getApiUrl = () => {
  // Check if we're in a production environment (Vercel)
  const isProduction = process.env.NEXT_PUBLIC_VERCEL_ENV === 'production';
  
  // Use the appropriate URL based on environment
  return isProduction 
    ? process.env.NEXT_PUBLIC_LIVE_BACKEND_URL 
    : process.env.NEXT_PUBLIC_DEV_BACKEND_URL;
};

export const API_URL = getApiUrl();

// Auth error handler - will be set by AuthContext
let authErrorHandler = null;

export const setAuthErrorHandler = (handler) => {
  authErrorHandler = handler;
};

// Helper function to get authorization headers
const getAuthHeaders = () => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` })
  };
};

// Enhanced fetch with auth interceptor
export const apiFetch = async (url, options = {}) => {
  const config = {
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...options.headers,
    },
  };

  try {
    const response = await fetch(url, config);
    
    // Handle 401 Unauthorized errors
    if (response.status === 401) {
      if (authErrorHandler) {
        authErrorHandler();
      }
      throw new Error('Unauthorized - redirecting to login');
    }
    
    return response;
  } catch (error) {
    // Network errors or other fetch errors
    throw error;
  }
};

// Convenience methods
export const apiGet = (url) => apiFetch(url, { method: 'GET' });

export const apiPost = (url, data) => apiFetch(url, {
  method: 'POST',
  body: JSON.stringify(data),
});

export const apiPut = (url, data) => apiFetch(url, {
  method: 'PUT',
  body: JSON.stringify(data),
});

export const apiDelete = (url) => apiFetch(url, { method: 'DELETE' }); 