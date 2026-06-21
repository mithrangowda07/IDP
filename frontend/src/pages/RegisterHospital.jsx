import React, { useState } from 'react';
import { authAPI } from '../services/api';
import { Building, Plus, Trash2 } from 'lucide-react';
import AuthLayout from '../components/AuthLayout';
import PasswordInput from '../components/PasswordInput';
import FormAlert from '../components/FormAlert';

export default function RegisterHospital({ navigate }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
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
    <AuthLayout
      onBack={() => navigate('login')}
      title="Hospital Registration"
      subtitle="Submit your details to the Traffic Admin for system verification"
      icon={Building}
      accent="blue"
      maxWidth="xl"
    >
      <FormAlert type="error" className="mb-4">{error}</FormAlert>
      <FormAlert type="success" className="mb-4">{success && `${success} Redirecting to login...`}</FormAlert>

      <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
        <div className="form-grid-2">
          <div>
            <label htmlFor="hospital-name" className="form-label">Hospital Name</label>
            <input id="hospital-name" type="text" required value={name} onChange={(e) => setName(e.target.value)} className="form-input" placeholder="Apollo Hospital" />
          </div>
          <div>
            <label htmlFor="hospital-email" className="form-label">Email Address</label>
            <input id="hospital-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="form-input" placeholder="contact@apollo.com" autoComplete="email" />
          </div>
        </div>

        <div className="form-grid-2">
          <PasswordInput id="hospital-password" label="Password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" inputClassName="py-2.5 sm:py-3" />
          <div>
            <label htmlFor="hospital-phone" className="form-label">Phone Number</label>
            <input id="hospital-phone" type="text" required value={phone} onChange={(e) => setPhone(e.target.value)} className="form-input" placeholder="+91 9876543210" />
          </div>
        </div>

        <div>
          <label htmlFor="hospital-address" className="form-label">Address</label>
          <textarea id="hospital-address" required value={address} onChange={(e) => setAddress(e.target.value)} className="form-input h-20 resize-none" placeholder="Bannerghatta Main Road, Bangalore" />
        </div>

        <div className="form-grid-2">
          <div>
            <label htmlFor="hospital-lat" className="form-label">Latitude</label>
            <input id="hospital-lat" type="number" step="any" required value={latitude} onChange={(e) => setLatitude(e.target.value)} className="form-input" />
          </div>
          <div>
            <label htmlFor="hospital-lng" className="form-label">Longitude</label>
            <div className="flex gap-2">
              <input id="hospital-lng" type="number" step="any" required value={longitude} onChange={(e) => setLongitude(e.target.value)} className="form-input flex-1 min-w-0" />
              <button type="button" onClick={handleRandomLocation} className="px-3 shrink-0 bg-white/5 hover:bg-white/10 rounded-xl text-xs text-gray-300 border border-white/10 hover:text-white">
                Random
              </button>
            </div>
          </div>
        </div>

        <div className="border-t border-white/5 pt-5">
          <div className="flex justify-between items-center mb-4 gap-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-300">Ambulance Fleet</h3>
            <button type="button" onClick={handleAddVehicle} className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 shrink-0">
              <Plus size={14} /> Add Ambulance
            </button>
          </div>

          <div className="space-y-3 max-h-40 overflow-y-auto pr-1">
            {vehicles.map((vehicle, idx) => (
              <div key={idx} className="flex flex-col sm:flex-row gap-3 sm:items-end bg-white/5 p-3 rounded-xl border border-white/5">
                <div className="flex-1 min-w-0">
                  <label className="block text-[10px] uppercase font-semibold text-gray-400 mb-1">Vehicle ID</label>
                  <input type="text" required value={vehicle.vehicleId} onChange={(e) => handleVehicleIdChange(idx, e.target.value)} className="w-full px-3 py-2 text-xs rounded-lg glass-input text-white" placeholder="AMB-01" />
                </div>
                <div className="sm:w-28 shrink-0">
                  <label className="block text-[10px] uppercase font-semibold text-gray-400 mb-1">Type</label>
                  <div className="px-3 py-2 text-xs rounded-lg bg-[#070b13] text-gray-400 border border-white/10">Ambulance</div>
                </div>
                {vehicles.length > 1 && (
                  <button type="button" onClick={() => handleRemoveVehicle(idx)} className="p-2 text-red-400 hover:text-red-300 bg-red-500/5 hover:bg-red-500/10 rounded-lg transition self-end sm:self-auto" aria-label="Remove vehicle">
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? 'Submitting registration...' : 'Submit Registration'}
        </button>
      </form>
    </AuthLayout>
  );
}
