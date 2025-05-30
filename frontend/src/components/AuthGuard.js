'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export default function AuthGuard({ children }) {
  const { user, loading, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    console.log('AuthGuard: loading=', loading, 'isAuthenticated=', isAuthenticated(), 'user=', user);
    
    if (!loading && !isAuthenticated()) {
      console.log('AuthGuard: Redirecting to signin');
      router.push('/signin');
    }
  }, [loading, router, isAuthenticated, user]);

  // Show loading while checking authentication
  if (loading) {
    console.log('AuthGuard: Showing loading state');
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Don't render children if not authenticated
  if (!isAuthenticated()) {
    console.log('AuthGuard: Not authenticated, returning null');
    return null;
  }

  console.log('AuthGuard: Authenticated, rendering children');
  return children;
} 