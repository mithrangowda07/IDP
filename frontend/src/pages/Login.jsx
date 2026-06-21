import React, { useState } from 'react';
import { authAPI } from '../services/api';
import { Mail, ShieldAlert, Building } from 'lucide-react';
import AuthLayout from '../components/AuthLayout';
import PasswordInput from '../components/PasswordInput';
import FormAlert from '../components/FormAlert';

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
    <AuthLayout
      title="Emergency Response System"
      subtitle="Green Corridor Management Console"
      icon={ShieldAlert}
      accent="blue"
    >
      <FormAlert type="error" className="mb-5">{error}</FormAlert>

      <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
        <div>
          <label htmlFor="login-email" className="form-label">Email Address</label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500 pointer-events-none">
              <Mail size={18} />
            </span>
            <input
              id="login-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="form-input pl-10"
              placeholder="admin@idp.com"
              autoComplete="email"
            />
          </div>
        </div>

        <PasswordInput
          id="login-password"
          label="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter your password"
          required
          autoComplete="current-password"
        />

        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? 'Logging in...' : 'Sign In'}
        </button>
      </form>

      <div className="mt-6 text-center text-sm text-gray-400 space-y-3">
        <p>
          Don&apos;t have an account?{' '}
          <button type="button" onClick={() => navigate('register-citizen')} className="text-blue-400 hover:underline font-medium">
            Register as Citizen
          </button>
        </p>
        <div className="flex flex-col sm:flex-row justify-center gap-2 sm:gap-4 text-xs border-t border-white/5 pt-4">
          <button type="button" onClick={() => navigate('register-hospital')} className="text-gray-400 hover:text-white flex items-center justify-center gap-1.5 py-2">
            <Building size={14} /> Hospital Registration
          </button>
          <span className="hidden sm:inline text-white/10 self-center">|</span>
          <button type="button" onClick={() => navigate('register-fire-station')} className="text-gray-400 hover:text-white flex items-center justify-center gap-1.5 py-2">
            <Building size={14} /> Fire Station Registration
          </button>
        </div>
      </div>

      <div className="mt-8 border-t border-white/5 pt-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3 text-center">Quick Access Preset Logins</p>
        <div className="grid grid-cols-1 xs:grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => handleQuickLogin('medical_admin@idp.com', 'admin123')}
            className="py-2.5 px-2 rounded-xl bg-blue-500/5 hover:bg-blue-500/10 border border-blue-500/10 text-[11px] font-medium text-blue-300 transition"
          >
            Medical Admin
          </button>
          <button
            type="button"
            onClick={() => handleQuickLogin('fire_admin@idp.com', 'admin123')}
            className="py-2.5 px-2 rounded-xl bg-red-500/5 hover:bg-red-500/10 border border-red-500/10 text-[11px] font-medium text-red-300 transition"
          >
            Fire Admin
          </button>
          <button
            type="button"
            onClick={() => handleQuickLogin('traffic_admin@idp.com', 'admin123')}
            className="py-2.5 px-2 rounded-xl bg-emerald-500/5 hover:bg-emerald-500/10 border border-emerald-500/10 text-[11px] font-medium text-emerald-300 transition"
          >
            Traffic Admin
          </button>
        </div>
      </div>
    </AuthLayout>
  );
}
