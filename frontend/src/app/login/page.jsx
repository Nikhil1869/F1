'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import GlassCard from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';

export default function LoginPage() {
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const url = isRegister ? '/api/auth/register' : '/api/auth/login';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong');
      router.push('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-5">
      {/* Background glow */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(225,6,0,0.12) 0%, transparent 65%)', filter: 'blur(60px)' }} />

      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="w-full max-w-md">
        <GlassCard hover={false}>
          <div className="text-center mb-8">
            <h1 className="text-3xl font-black uppercase tracking-tight mb-1" style={{ fontFamily: 'var(--font-titillium)' }}>
              F1 <span className="gradient-text">Data Lab</span>
            </h1>
            <p className="text-sm text-[#9a9ab0]">{isRegister ? 'Create your account' : 'Sign in to continue'}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-[#9a9ab0] uppercase tracking-wide font-semibold mb-1.5">Username</label>
              <input value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3}
                className="w-full bg-[#12121e] border border-white/[0.08] rounded-md px-4 py-3 text-sm text-white outline-none focus:border-[#e10600] focus:shadow-[0_0_10px_rgba(225,6,0,0.35)] transition-all"
                placeholder="Enter username" />
            </div>
            <div>
              <label className="block text-xs text-[#9a9ab0] uppercase tracking-wide font-semibold mb-1.5">Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={4}
                className="w-full bg-[#12121e] border border-white/[0.08] rounded-md px-4 py-3 text-sm text-white outline-none focus:border-[#e10600] focus:shadow-[0_0_10px_rgba(225,6,0,0.35)] transition-all"
                placeholder="Enter password" />
            </div>

            {error && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="bg-[rgba(225,6,0,0.1)] border border-[rgba(225,6,0,0.3)] rounded-md px-4 py-2.5 text-sm text-[#e10600]">
                {error}
              </motion.div>
            )}

            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading ? '⏳ Please wait...' : isRegister ? '🚀 Create Account' : '🔐 Sign In'}
            </Button>
          </form>

          <div className="text-center mt-6">
            <button onClick={() => { setIsRegister(!isRegister); setError(''); }}
              className="text-sm text-[#9a9ab0] hover:text-[#e10600] transition-colors bg-transparent border-none cursor-pointer">
              {isRegister ? 'Already have an account? Sign in' : "Don't have an account? Register"}
            </button>
          </div>
        </GlassCard>
      </motion.div>
    </div>
  );
}
