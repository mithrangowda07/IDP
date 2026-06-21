import React, { useState } from 'react';
import { Plus, Trash2, Truck } from 'lucide-react';
import { serviceAPI } from '../services/api';

const STATUS_COLORS = {
  available: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  dispatched: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
  en_route: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
  at_scene: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  returning: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  maintenance: 'text-red-400 bg-red-500/10 border-red-500/20'
};

export default function FleetManager({
  serviceId,
  vehicles = [],
  vehicleLabel = 'Ambulance',
  idPrefix = 'AMB-',
  accent = 'blue',
  onFleetChange
}) {
  const [newVehicleId, setNewVehicleId] = useState('');
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const accentBtn = accent === 'red'
    ? 'bg-red-600 hover:bg-red-500 focus:ring-red-500/40'
    : 'bg-blue-600 hover:bg-blue-500 focus:ring-blue-500/40';

  const handleAdd = async () => {
    setError('');
    setSuccess('');

    if (!serviceId) {
      setError('Service account is not linked. Please log out and log in again.');
      return;
    }

    const trimmedId = newVehicleId.trim().toUpperCase();
    if (!trimmedId) {
      setError('Enter a vehicle ID.');
      return;
    }

    if (!trimmedId.startsWith(idPrefix)) {
      setError(`Vehicle ID must start with ${idPrefix}`);
      return;
    }

    setAdding(true);
    try {
      const res = await serviceAPI.addVehicle(serviceId, trimmedId);
      setNewVehicleId('');
      setSuccess(res.data.message || 'Vehicle added.');
      onFleetChange?.(res.data.vehicles);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      const message = err.response?.data?.error
        || (err.response?.status === 404 ? 'Fleet API not available. Restart the backend server.' : null)
        || err.message
        || 'Failed to add vehicle.';
      setError(message);
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (vehicleId) => {
    if (!window.confirm(`Remove ${vehicleLabel} ${vehicleId} from the fleet?`)) return;

    if (!serviceId) {
      setError('Service account is not linked. Please log out and log in again.');
      return;
    }

    setError('');
    setSuccess('');
    setRemovingId(vehicleId);
    try {
      const res = await serviceAPI.removeVehicle(serviceId, vehicleId);
      setSuccess(res.data.message || 'Vehicle removed.');
      onFleetChange?.(res.data.vehicles);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      const message = err.response?.data?.error
        || (err.response?.status === 404 ? 'Fleet API not available. Restart the backend server.' : null)
        || err.message
        || 'Failed to remove vehicle.';
      setError(message);
    } finally {
      setRemovingId('');
    }
  };

  const suggestId = () => {
    setNewVehicleId(`${idPrefix}${Math.floor(100 + Math.random() * 900)}`);
  };

  return (
    <div className="border-t border-white/5 pt-5 mt-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Truck size={16} className={accent === 'red' ? 'text-red-400' : 'text-blue-400'} />
          <h4 className="text-sm font-bold text-white uppercase tracking-wider">Emergency Fleet</h4>
        </div>
        <span className="text-[10px] text-gray-500 font-bold uppercase">{vehicles.length} registered</span>
      </div>

      {error && (
        <div className="mb-3 p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-200 text-xs">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-3 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-200 text-xs">
          {success}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <input
          type="text"
          value={newVehicleId}
          onChange={(e) => setNewVehicleId(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder={`${idPrefix}101`}
          className="flex-1 min-w-0 px-3 py-2.5 rounded-xl glass-input text-white text-xs uppercase tracking-wide"
        />
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={suggestId}
            className="px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs text-gray-300 hover:text-white transition"
          >
            Suggest
          </button>
          <button
            type="button"
            onClick={handleAdd}
            disabled={adding}
            className={`inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-white text-xs font-bold transition disabled:opacity-60 ${accentBtn}`}
          >
            <Plus size={14} />
            {adding ? 'Adding...' : 'Add'}
          </button>
        </div>
      </div>

      <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
        {vehicles.length === 0 ? (
          <p className="text-xs text-gray-500 text-center py-6 italic">No vehicles in fleet. Add at least one for emergency dispatch.</p>
        ) : (
          vehicles.map((vehicle) => {
            const canRemove = ['available', 'maintenance'].includes(vehicle.status);
            const statusClass = STATUS_COLORS[vehicle.status] || STATUS_COLORS.available;

            return (
              <div
                key={vehicle.id}
                className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/5"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-white truncate">{vehicle.id}</p>
                  <p className="text-[10px] text-gray-500 capitalize">{vehicleLabel}</p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase border shrink-0 ${statusClass}`}>
                  {vehicle.status.replace('_', ' ')}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemove(vehicle.id)}
                  disabled={!canRemove || removingId === vehicle.id}
                  title={canRemove ? 'Remove vehicle' : 'Cannot remove while on active dispatch'}
                  className="p-2 rounded-lg text-red-400 hover:bg-red-500/10 transition disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })
        )}
      </div>

      <p className="text-[10px] text-gray-500 mt-3 leading-relaxed">
        Only available or maintenance vehicles can be removed. Active dispatch vehicles must complete their run first.
      </p>
    </div>
  );
}
