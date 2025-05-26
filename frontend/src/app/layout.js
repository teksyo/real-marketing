import { Inter } from 'next/font/google';
import './globals.css';
import ToasterProvider from '@/components/ToasterProvider';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: "Real Marketing",
  description: "Real Estate Marketing Platform",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <ToasterProvider />
        {children}
      </body>
    </html>
  );
}
