import React, { useState } from 'react';
import { authAPI } from '../services/api';
import { User, Mail, Lock, ArrowLeft } from 'lucide-react';

export default function RegisterCitizen({ navigate }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      await authAPI.registerCitizen(name, email, password);
      setSuccess('Registration successful! Redirecting to login...');
      setName('');
      setEmail('');
      setPassword('');
      setTimeout(() => navigate('login'), 2500);
    } catch (err) {
      setError(err.response?.data?.error || 'Citizen registration failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#070b13] px-4 py-12 relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-blue-900/10 blur-[120px] pointer-events-none" />
      
      <div className="max-w-md w-full glass-panel p-8 rounded-2xl glow-blue relative z-10">
        <button onClick={() => navigate('login')} className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-white mb-6">
          <ArrowLeft size={16} /> Back to Login
        </button>

        <div className="text-center mb-8">
          <div className="inline-flex p-3 rounded-full bg-blue-500/10 text-blue-400 mb-3 border border-blue-500/20">
            <User size={32} />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-white font-outfit">Citizen Registration</h2>
          <p className="mt-1 text-sm text-gray-400">Join the system to report emergencies and track status</p>
        </div>

        {error && (
          <div className="mb-5 p-3 rounded bg-red-500/10 border border-red-500/20 text-red-200 text-sm">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-5 p-3 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-200 text-sm">
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Full Name</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500">
                <User size={18} />
              </span>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-xl glass-input text-white focus:border-blue-500"
                placeholder="John Doe"
              />
            </div>
          </div>

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
                className="w-full pl-10 pr-4 py-3 rounded-xl glass-input text-white focus:border-blue-500"
                placeholder="johndoe@example.com"
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
                className="w-full pl-10 pr-4 py-3 rounded-xl glass-input text-white focus:border-blue-500"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl text-white font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 transition shadow-lg focus:outline-none"
          >
            {loading ? 'Registering...' : 'Register'}
          </button>
        </form>
      </div>
    </div>
  );
}
