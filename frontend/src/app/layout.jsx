import { Outfit, Titillium_Web } from 'next/font/google';
import './globals.css';
import Navbar from '@/components/layout/Navbar';

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
  display: 'swap',
});

const titillium = Titillium_Web({
  subsets: ['latin'],
  weight: ['300', '400', '600', '700', '900'],
  variable: '--font-titillium',
  display: 'swap',
});

export const metadata = {
  title: 'F1 Data Lab | Race Analytics & ML Predictions',
  description:
    'Explore Formula 1 data through interactive visualizations, telemetry analysis, and machine learning predictions.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${outfit.variable} ${titillium.variable}`}>
      <body className="antialiased">
        <Navbar />
        <main className="pt-16">{children}</main>
      </body>
    </html>
  );
}
