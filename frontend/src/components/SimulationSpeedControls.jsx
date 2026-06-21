import React, { useState, useEffect } from 'react';
import { Minus, Plus } from 'lucide-react';
import { serviceAPI } from '../services/api';
import { socket } from '../services/socket';

export default function SimulationSpeedControls({ active = false }) {
  const [simulationSpeed, setSimulationSpeed] = useState(90);
  const [speedUpdating, setSpeedUpdating] = useState(false);

  useEffect(() => {
    serviceAPI.getSimulationSpeed()
      .then((response) => setSimulationSpeed(response.data.speedKmh))
      .catch((err) => console.error('Failed to load simulation speed', err));

    const handleSpeedUpdate = (data) => {
      setSimulationSpeed(data.speedKmh);
    };

    socket.on('simulation_speed_update', handleSpeedUpdate);
    return () => socket.off('simulation_speed_update', handleSpeedUpdate);
  }, []);

  const handleSpeedAdjust = async (delta) => {
    setSpeedUpdating(true);
    try {
      const response = await serviceAPI.adjustSimulationSpeed(delta);
      setSimulationSpeed(response.data.speedKmh);
    } catch (err) {
      console.error('Failed to adjust simulation speed', err);
    } finally {
      setSpeedUpdating(false);
    }
  };

  if (!active) return null;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
      <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400 block">
        Simulation Controls
      </span>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          disabled={speedUpdating || simulationSpeed <= 10}
          onClick={() => handleSpeedAdjust(-10)}
          className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-200 hover:bg-white/10 disabled:opacity-40"
        >
          <Minus size={12} /> -10 km/h
        </button>
        <span className="text-xs font-bold text-emerald-400 min-w-[130px] text-center">
          Current Speed: {Math.round(simulationSpeed)} km/h
        </span>
        <button
          type="button"
          disabled={speedUpdating || simulationSpeed >= 120}
          onClick={() => handleSpeedAdjust(10)}
          className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/20 bg-emerald-600/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300 hover:bg-emerald-600/20 disabled:opacity-40"
        >
          <Plus size={12} /> +10 km/h
        </button>
      </div>
    </div>
  );
}
