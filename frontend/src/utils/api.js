const getApiUrl = () => {
  // Check if we're in a production environment (Vercel)
  const isProduction = process.env.NEXT_PUBLIC_VERCEL_ENV === 'production';
  
  // Use the appropriate URL based on environment
  return isProduction 
    ? process.env.NEXT_PUBLIC_LIVE_BACKEND_URL 
    : process.env.NEXT_PUBLIC_DEV_BACKEND_URL;
};

export const API_URL = getApiUrl(); 