import React, { useState } from 'react';
import { authAPI } from '../services/api';
import { User, Mail, Phone, ShieldAlert } from 'lucide-react';
import AuthLayout from '../components/AuthLayout';
import PasswordInput from '../components/PasswordInput';
import FormAlert from '../components/FormAlert';

export default function RegisterCitizen({ navigate }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      await authAPI.registerCitizen({ name, email, password, phone, emergencyContact });
      setSuccess('Registration successful! Redirecting to login...');
      setName('');
      setEmail('');
      setPassword('');
      setPhone('');
      setEmergencyContact('');
      setTimeout(() => navigate('login'), 2500);
    } catch (err) {
      setError(err.response?.data?.error || 'Citizen registration failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      onBack={() => navigate('login')}
      title="Citizen Registration"
      subtitle="Join the system to report emergencies and track response status"
      icon={User}
      accent="blue"
    >
      <FormAlert type="error" className="mb-4">{error}</FormAlert>
      <FormAlert type="success" className="mb-4">{success}</FormAlert>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="citizen-name" className="form-label">Full Name</label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500 pointer-events-none">
              <User size={18} />
            </span>
            <input
              id="citizen-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="form-input pl-10"
              placeholder="John Doe"
            />
          </div>
        </div>

        <div>
          <label htmlFor="citizen-email" className="form-label">Email Address</label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500 pointer-events-none">
              <Mail size={18} />
            </span>
            <input
              id="citizen-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="form-input pl-10"
              placeholder="johndoe@example.com"
              autoComplete="email"
            />
          </div>
        </div>

        <div>
          <label htmlFor="citizen-phone" className="form-label">Phone Number</label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500 pointer-events-none">
              <Phone size={18} />
            </span>
            <input
              id="citizen-phone"
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="form-input pl-10"
              placeholder="+91 9876543210"
            />
          </div>
        </div>

        <div>
          <label htmlFor="citizen-emergency" className="form-label">Emergency Contact (Optional)</label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500 pointer-events-none">
              <ShieldAlert size={18} />
            </span>
            <input
              id="citizen-emergency"
              type="tel"
              value={emergencyContact}
              onChange={(e) => setEmergencyContact(e.target.value)}
              className="form-input pl-10"
              placeholder="+91 9876543211"
            />
          </div>
        </div>

        <PasswordInput
          id="citizen-password"
          label="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="new-password"
          hint="Use at least 6 characters"
        />

        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? 'Registering...' : 'Create Account'}
        </button>
      </form>
    </AuthLayout>
  );
}
