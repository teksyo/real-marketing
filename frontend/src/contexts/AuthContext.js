'use client';

import { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { setAuthErrorHandler } from '@/utils/api';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Check if user is authenticated on mount
  useEffect(() => {
    checkAuth();
  }, []);

  // Register auth error handler with API utility
  useEffect(() => {
    setAuthErrorHandler(handleAuthError);
  }, []);

  const checkAuth = () => {
    console.log('AuthContext: checkAuth called');
    try {
      const token = localStorage.getItem('token');
      const userData = localStorage.getItem('user');
      
      console.log('AuthContext: token=', !!token, 'userData=', !!userData);
      
      if (token && userData) {
        const parsedUser = JSON.parse(userData);
        console.log('AuthContext: Setting user=', parsedUser);
        setUser(parsedUser);
      } else {
        console.log('AuthContext: No token or userData, setting user to null');
        setUser(null);
      }
    } catch (error) {
      console.error('AuthContext: Error checking auth:', error);
      setUser(null);
    } finally {
      console.log('AuthContext: Setting loading to false');
      setLoading(false);
    }
  };

  const login = (token, userData) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    router.push('/signin');
  };

  const handleAuthError = () => {
    // Clear auth data and redirect to signin
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    router.push('/signin');
  };

  const isAuthenticated = () => {
    const token = !!localStorage.getItem('token');
    console.log('AuthContext: isAuthenticated called, returning=', token);
    return token;
  };

  const value = {
    user,
    loading,
    login,
    logout,
    handleAuthError,
    isAuthenticated,
    checkAuth
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}; 