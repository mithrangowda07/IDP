import React, { useState } from 'react';
import { authAPI } from '../services/api';
import { Building, Mail, Lock, Phone, MapPin, Plus, Trash2, ArrowLeft } from 'lucide-react';

export default function RegisterHospital({ navigate }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  
  // Default to a random coordinate around Bangalore
  const [latitude, setLatitude] = useState((12.92 + Math.random() * 0.08).toFixed(6));
  const [longitude, setLongitude] = useState((77.55 + Math.random() * 0.08).toFixed(6));

  const [vehicles, setVehicles] = useState([{ vehicleId: 'AMB-' + Math.floor(100 + Math.random() * 900) }]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAddVehicle = () => {
    setVehicles([...vehicles, { vehicleId: 'AMB-' + Math.floor(100 + Math.random() * 900) }]);
  };

  const handleRemoveVehicle = (index) => {
    setVehicles(vehicles.filter((_, idx) => idx !== index));
  };

  const handleVehicleIdChange = (index, value) => {
    const updated = [...vehicles];
    updated[index].vehicleId = value;
    setVehicles(updated);
  };

  const handleRandomLocation = () => {
    setLatitude((12.92 + Math.random() * 0.08).toFixed(6));
    setLongitude((77.55 + Math.random() * 0.08).toFixed(6));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (vehicles.length === 0) {
      setError('Please add at least one ambulance.');
      return;
    }

    setLoading(true);
    try {
      const response = await authAPI.registerHospital({
        name,
        email,
        password,
        phone,
        address,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        vehicles
      });
      setSuccess(response.data.message);
      // Reset form
      setName('');
      setEmail('');
      setPassword('');
      setPhone('');
      setAddress('');
      setTimeout(() => navigate('login'), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#070b13] px-4 py-12 relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-blue-900/10 blur-[120px] pointer-events-none" />
      <div className="max-w-xl w-full glass-panel p-8 rounded-2xl glow-blue relative z-10">
        
        <button onClick={() => navigate('login')} className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-white mb-6">
          <ArrowLeft size={16} /> Back to Login
        </button>

        <div className="mb-6">
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Building className="text-blue-400" /> Hospital Registration
          </h2>
          <p className="text-sm text-gray-400 mt-1">Submit your details to the Traffic Admin for system verification.</p>
        </div>

        {error && (
          <div className="mb-5 p-3 rounded bg-red-500/10 border border-red-500/20 text-red-200 text-sm">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-5 p-3 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-200 text-sm">
            {success} Redirecting to login...
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Hospital Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl glass-input text-white focus:border-blue-500"
                placeholder="Apollo Hospital"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl glass-input text-white focus:border-blue-500"
                placeholder="contact@apollo.com"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl glass-input text-white focus:border-blue-500"
                placeholder="••••••••"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Phone Number</label>
              <input
                type="text"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-4 py-3 rounded-xl glass-input text-white focus:border-blue-500"
                placeholder="+91 9876543210"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Address</label>
            <textarea
              required
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full px-4 py-3 rounded-xl glass-input text-white focus:border-blue-500 h-20"
              placeholder="Bannerghatta Main Road, Bangalore"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Latitude</label>
              <input
                type="number"
                step="any"
                required
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                className="w-full px-4 py-3 rounded-xl glass-input text-white focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Longitude</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="any"
                  required
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl glass-input text-white focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={handleRandomLocation}
                  className="px-3 bg-white/5 hover:bg-white/10 rounded-xl text-xs text-gray-300 border border-white/10 hover:text-white"
                  title="Generate location near Bangalore"
                >
                  Random
                </button>
              </div>
            </div>
          </div>

          {/* Vehicle management section */}
          <div className="border-t border-white/5 pt-5">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-300">Ambulance Fleet</h3>
              <button
                type="button"
                onClick={handleAddVehicle}
                className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
              >
                <Plus size={14} /> Add Ambulance
              </button>
            </div>

            <div className="space-y-3 max-h-36 overflow-y-auto pr-1">
              {vehicles.map((vehicle, idx) => (
                <div key={idx} className="flex gap-4 items-center bg-white/5 p-3 rounded-xl border border-white/5">
                  <div className="flex-1">
                    <label className="block text-[10px] uppercase font-semibold text-gray-400 mb-1">Vehicle ID</label>
                    <input
                      type="text"
                      required
                      value={vehicle.vehicleId}
                      onChange={(e) => handleVehicleIdChange(idx, e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg glass-input text-white"
                      placeholder="AMB-01"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-semibold text-gray-400 mb-1">Vehicle Type</label>
                    <div className="px-3 py-2 text-xs rounded-lg bg-[#070b13] text-gray-400 border border-white/10">
                      Ambulance
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-semibold text-gray-400 mb-1">Status</label>
                    <div className="px-3 py-2 text-xs rounded-lg bg-[#070b13] text-emerald-400 border border-white/10">
                      Available
                    </div>
                  </div>
                  {vehicles.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveVehicle(idx)}
                      className="mt-5 p-2 text-red-400 hover:text-red-300 bg-red-500/5 hover:bg-red-500/10 rounded-lg transition"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl text-white font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 transition shadow-lg focus:outline-none"
          >
            {loading ? 'Submitting registration...' : 'Submit Registration'}
          </button>
        </form>
      </div>
    </div>
  );
}
