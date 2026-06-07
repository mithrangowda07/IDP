import React, { useState } from 'react';
import { authAPI } from '../services/api';
import { Mail, Lock, ShieldAlert, Award, Building, User } from 'lucide-react';

export default function Login({ onLoginSuccess, navigate }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please fill in all fields.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const response = await authAPI.login(email, password);
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
      onLoginSuccess(response.data.user);
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid credentials or login failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = (emailVal, passVal) => {
    setEmail(emailVal);
    setPassword(passVal);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#070b13] px-4 py-12 relative overflow-hidden">
      {/* Background gradients */}
      <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-blue-900/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-red-900/10 blur-[120px] pointer-events-none" />

      <div className="max-w-md w-full glass-panel p-8 rounded-2xl glow-blue relative z-10">
        <div className="text-center mb-8">
          <div className="inline-flex p-3 rounded-full bg-blue-500/10 text-blue-400 mb-3 border border-blue-500/20">
            <ShieldAlert size={32} />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Emergency Response System</h2>
          <p className="mt-2 text-sm text-gray-400">Green Corridor Management Console</p>
        </div>

        {error && (
          <div className="mb-5 p-3 rounded bg-red-500/10 border border-red-500/20 text-red-200 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Email Address</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500">
                <Mail size={18} />
              </span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-xl glass-input text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder="admin@idp.com"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Password</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500">
                <Lock size={18} />
              </span>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-xl glass-input text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl text-white font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 transition shadow-lg shadow-indigo-900/40 focus:outline-none"
          >
            {loading ? 'Logging in...' : 'Sign In'}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-gray-400 space-y-2">
          <div>
            Don't have an account?{' '}
            <button onClick={() => navigate('register-citizen')} className="text-blue-400 hover:underline font-medium">
              Register as Citizen
            </button>
          </div>
          <div className="flex justify-center space-x-4 text-xs mt-2 border-t border-white/5 pt-3">
            <button onClick={() => navigate('register-hospital')} className="text-gray-400 hover:text-white flex items-center gap-1">
              <Building size={14} /> Hospital
            </button>
            <span className="text-white/10">|</span>
            <button onClick={() => navigate('register-fire-station')} className="text-gray-400 hover:text-white flex items-center gap-1">
              <Building size={14} /> Fire Station
            </button>
          </div>
        </div>

        {/* Preset accounts helper */}
        <div className="mt-8 border-t border-white/5 pt-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3 text-center">Quick Access Preset Logins</p>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => handleQuickLogin('medical_admin@idp.com', 'admin123')}
              className="py-2 px-1 rounded bg-blue-500/5 hover:bg-blue-500/10 border border-blue-500/10 text-[10px] font-medium text-blue-300 transition"
            >
              Medical Admin
            </button>
            <button
              onClick={() => handleQuickLogin('fire_admin@idp.com', 'admin123')}
              className="py-2 px-1 rounded bg-red-500/5 hover:bg-red-500/10 border border-red-500/10 text-[10px] font-medium text-red-300 transition"
            >
              Fire Admin
            </button>
            <button
              onClick={() => handleQuickLogin('traffic_admin@idp.com', 'admin123')}
              className="py-2 px-1 rounded bg-emerald-500/5 hover:bg-emerald-500/10 border border-emerald-500/10 text-[10px] font-medium text-emerald-300 transition"
            >
              Traffic Admin
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
