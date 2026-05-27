'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { NAV_ITEMS } from '@/lib/constants';

export default function Navbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/[0.06]"
         style={{ background: 'linear-gradient(to bottom, rgba(10,10,18,0.95) 60%, rgba(10,10,18,0.8))' , backdropFilter: 'blur(16px)' }}>
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 no-underline">
          <span className="text-xl font-black tracking-tight text-white" style={{ fontFamily: 'var(--font-titillium)' }}>
            F1 <span className="gradient-text">Data Lab</span>
          </span>
        </Link>

        {/* Desktop Nav */}
        <div className="hidden lg:flex items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative px-3 py-1.5 rounded text-xs font-semibold uppercase tracking-wide no-underline transition-all duration-200 ${
                  isActive
                    ? 'text-white'
                    : 'text-[#9a9ab0] hover:text-white'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="nav-active"
                    className="absolute inset-0 rounded"
                    style={{ background: 'var(--f1-red)', boxShadow: '0 0 16px rgba(225,6,0,0.35)' }}
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-1.5">
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </span>
              </Link>
            );
          })}
        </div>

        {/* Mobile Toggle */}
        <button
          className="lg:hidden flex flex-col gap-1 p-2"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          <span className={`block w-5 h-0.5 bg-white transition-transform ${mobileOpen ? 'rotate-45 translate-y-1.5' : ''}`} />
          <span className={`block w-5 h-0.5 bg-white transition-opacity ${mobileOpen ? 'opacity-0' : ''}`} />
          <span className={`block w-5 h-0.5 bg-white transition-transform ${mobileOpen ? '-rotate-45 -translate-y-1.5' : ''}`} />
        </button>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="lg:hidden overflow-hidden border-t border-white/[0.06]"
            style={{ background: 'rgba(10,10,18,0.98)' }}
          >
            <div className="p-4 flex flex-col gap-1">
              {NAV_ITEMS.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`px-4 py-3 rounded-lg text-sm font-semibold uppercase tracking-wide no-underline transition-all ${
                      isActive
                        ? 'text-white bg-[#e10600]'
                        : 'text-[#9a9ab0] hover:text-white hover:bg-white/[0.04]'
                    }`}
                  >
                    <span className="mr-2">{item.icon}</span>
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
