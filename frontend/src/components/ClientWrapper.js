'use client';

import { AuthProvider } from '@/contexts/AuthContext';
import ToasterProvider from '@/components/ToasterProvider';

export default function ClientWrapper({ children }) {
  return (
    <AuthProvider>
      <ToasterProvider />
      {children}
    </AuthProvider>
  );
} 