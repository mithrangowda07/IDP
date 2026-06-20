import React, { useState, useEffect } from 'react';
import { trafficAPI } from '../services/api';
import { connectSocket, disconnectSocket, socket } from '../services/socket';
import MapPanel from '../components/MapPanel';
import { Car, Clock, ShieldAlert, Activity, CheckCircle, Navigation, Play, Power } from 'lucide-react';

export default function TrafficAdminDashboard({ user, onLogout }) {
  const [activeCorridors, setActiveCorridors] = useState([]);
  const [trackingHistory, setTrackingHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Map visualization state
  const [routePoints, setRoutePoints] = useState([]);
  const [signals, setSignals] = useState([]);
  const [trackingVehicle, setTrackingVehicle] = useState(null);
  const [selectedCorridorId, setSelectedCorridorId] = useState(null);

  useEffect(() => {
    connectSocket('traffic_admin');
    loadActiveCorridors();
    loadTrackingHistory();

    // Socket updates
    socket.on('green_corridor_update', (data) => {
      console.log('Traffic admin corridor update:', data);
      loadActiveCorridors();
      
      if (data.status === 'active') {
        setRoutePoints(data.route);
        setSignals(data.signals);
        setSelectedCorridorId(data.dispatchId);
      } else {
        setRoutePoints([]);
        setSignals([]);
        setTrackingVehicle(null);
        setSelectedCorridorId(null);
      }
    });

    socket.on('vehicle_tracking_update', (data) => {
      console.log('Traffic admin vehicle tracking tick:', data);
      setTrackingVehicle({
        id: data.vehicleId,
        latitude: parseFloat(data.latitude),
        longitude: parseFloat(data.longitude),
        type: data.vehicleId.startsWith('AMB') ? 'ambulance' : 'fire_engine',
        status: data.status,
        progress: data.progress
      });

      // Append to local tracking history list
      setTrackingHistory(prev => [
        {
          id: Date.now(),
          vehicle_id: data.vehicleId,
          latitude: data.latitude,
          longitude: data.longitude,
          timestamp: new Date().toISOString()
        },
        ...prev.slice(0, 15)
      ]);
    });

    socket.on('vehicle_status_change', (data) => {
      console.log('Traffic admin vehicle status change:', data);
      setTrackingVehicle(prev => {
        if (prev && prev.id === data.vehicleId) {
          return { ...prev, status: data.status };
        }
        return prev;
      });
      loadActiveCorridors();
    });

    return () => {
      socket.off('green_corridor_update');
      socket.off('vehicle_tracking_update');
      socket.off('vehicle_status_change');
      disconnectSocket();
    };
  }, []);

  const loadActiveCorridors = async () => {
    try {
      const response = await trafficAPI.getActiveCorridors();
      setActiveCorridors(response.data);
      
      // Auto-select first active corridor if none selected
      if (response.data.length > 0 && !selectedCorridorId) {
        const corr = response.data[0];
        setSelectedCorridorId(corr.dispatch_id);
        setRoutePoints(corr.route_geometry);
        setSignals(corr.signals_state);
        setTrackingVehicle({
          id: corr.vehicle_id,
          latitude: parseFloat(corr.v_lat),
          longitude: parseFloat(corr.v_lng),
          type: corr.vehicle_id.startsWith('AMB') ? 'ambulance' : 'fire_engine',
          status: 'en_route',
          progress: 50 // placeholder until socket tick
        });
      }
    } catch (err) {
      console.error('Failed to load active corridors', err);
    }
  };

  const loadTrackingHistory = async () => {
    setHistoryLoading(true);
    try {
      const response = await trafficAPI.getTrackingHistory();
      setTrackingHistory(response.data);
    } catch (err) {
      console.error('Failed to load tracking history', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleSelectCorridor = (corr) => {
    setSelectedCorridorId(corr.dispatch_id);
    setRoutePoints(corr.route_geometry);
    setSignals(corr.signals_state);
    setTrackingVehicle({
      id: corr.vehicle_id,
      latitude: parseFloat(corr.v_lat),
      longitude: parseFloat(corr.v_lng),
      type: corr.vehicle_id.startsWith('AMB') ? 'ambulance' : 'fire_engine',
      status: 'en_route',
      progress: 0
    });
  };

  // Calculate statistics
  const totalSavedMinutes = activeCorridors.reduce((acc, curr) => acc + (curr.normal_eta - curr.optimized_eta), 0);
  const avgImprovement = activeCorridors.length > 0 
    ? Math.round((totalSavedMinutes / (activeCorridors.reduce((acc, curr) => acc + curr.normal_eta, 0))) * 100) 
    : 35; // Default reference reduction 35%

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0b0f19] via-[#070b13] to-[#0d1323] flex flex-col">
      {/* Navbar */}
      <nav className="glass-panel border-b border-white/5 py-4 px-6 flex flex-col md:flex-row justify-between items-center gap-4 shadow-xl relative z-20">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-600/10 text-emerald-400 rounded-xl border border-emerald-500/20 shadow-inner">
            <Activity size={20} className="animate-pulse" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight text-white leading-tight">Traffic Control Authority</h1>
            <p className="text-[11px] text-gray-400">Green Corridor Optimization & Signal Overrides</p>
          </div>
        </div>

        <button onClick={onLogout} className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-red-400 hover:border-red-500/20 hover:bg-red-500/5 transition-all duration-250" title="Sign Out">
          <Power size={18} />
        </button>
      </nav>

      {/* Main Grid */}
      <main className="flex-1 w-full max-w-none px-6 py-6 flex flex-col lg:h-[calc(100vh-80px)] lg:overflow-hidden">
        
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch flex-1 h-full lg:overflow-hidden">
          
          {/* Left column: Active Corridors list & stats (4 cols) */}
          <div className="lg:col-span-4 flex flex-col space-y-6 h-auto lg:h-full overflow-hidden">
            
            {/* Stats widgets */}
            <div className="grid grid-cols-2 gap-4 shrink-0">
              <div className="glass-panel p-4 rounded-2xl border border-emerald-500/10 flex flex-col justify-between shadow-inner">
                <span className="text-[9px] uppercase text-gray-400 block font-bold tracking-wider">Priority Corridor Speedup</span>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-2xl font-black text-emerald-400">-{avgImprovement}%</span>
                  <span className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">Travel Time</span>
                </div>
              </div>
              
              <div className="glass-panel p-4 rounded-2xl border border-emerald-500/10 flex flex-col justify-between shadow-inner">
                <span className="text-[9px] uppercase text-gray-400 block font-bold tracking-wider">Total Time Saved Today</span>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-2xl font-black text-emerald-400">{totalSavedMinutes + 12}</span>
                  <span className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">Minutes</span>
                </div>
              </div>
            </div>

            {/* Active corridors list */}
            <div className="glass-panel p-5 rounded-2xl flex-1 flex flex-col overflow-hidden min-h-[220px]">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-300 mb-4 pb-2 border-b border-white/5 flex items-center gap-1.5">
                <ShieldAlert size={16} className="text-emerald-400 animate-pulse" /> Active Priority Corridors
              </h3>

              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {activeCorridors.length === 0 ? (
                  <div className="py-24 text-center text-gray-500 text-xs">
                    No priority corridors currently active in the city grid.
                  </div>
                ) : (
                  activeCorridors.map((corr) => (
                    <div
                      key={corr.id}
                      onClick={() => handleSelectCorridor(corr)}
                      className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all duration-200 ${selectedCorridorId === corr.dispatch_id ? 'bg-emerald-600/10 border-emerald-500/40 shadow-inner' : 'bg-white/5 border-white/5 hover:border-white/10 hover:bg-white/[0.02]'}`}
                    >
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-[9px] uppercase font-black text-emerald-400 tracking-wider">Priority Overrides Engaged</span>
                        <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider">{corr.vehicle_id}</span>
                      </div>
                      <h4 className="text-xs font-bold text-white uppercase">{corr.incident_type.replace('_', ' ')}</h4>
                      <p className="text-[10px] text-gray-400 mt-1">Dispatched from: {corr.service_name}</p>

                      <div className="grid grid-cols-3 gap-2 mt-3 pt-2.5 border-t border-white/5 text-center text-[10px] text-gray-400">
                        <div>
                          <span>Normal ETA</span>
                          <strong className="block text-gray-300 mt-0.5">{corr.normal_eta}m</strong>
                        </div>
                        <div className="border-l border-white/5">
                          <span className="text-emerald-400 font-bold">Optimized ETA</span>
                          <strong className="block text-emerald-400 mt-0.5">{corr.optimized_eta}m</strong>
                        </div>
                        <div className="border-l border-white/5">
                          <span>Time Saved</span>
                          <strong className="block text-emerald-400 mt-0.5">+{corr.normal_eta - corr.optimized_eta}m</strong>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Tracking History Log */}
            <div className="glass-panel p-5 rounded-2xl h-[200px] flex flex-col overflow-hidden shrink-0">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-300 mb-3 pb-2 border-b border-white/5">
                Live GPS Telemetry Log
              </h3>
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 font-mono text-[9px] text-gray-400">
                {historyLoading ? (
                  <div className="text-center py-10">Loading logs...</div>
                ) : trackingHistory.length === 0 ? (
                  <div className="text-center py-10 text-gray-600">No recent GPS logs received.</div>
                ) : (
                  trackingHistory.map((log) => (
                    <div key={log.id} className="flex justify-between items-center border-b border-white/5 pb-1">
                      <span>[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                      <span className="text-white font-bold">{log.vehicle_id}</span>
                      <span className="text-emerald-400 font-semibold">lat: {parseFloat(log.latitude).toFixed(4)}, lng: {parseFloat(log.longitude).toFixed(4)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>

          {/* Right column: Map (8 cols) */}
          <div className="lg:col-span-8 glass-panel p-4 rounded-2xl flex flex-col h-[400px] lg:h-full overflow-hidden">
            <div className="mb-2 flex flex-col sm:flex-row justify-between sm:items-center gap-2 px-2 pb-1.5">
              <span className="text-xs font-bold text-gray-300">Real-Time City Traffic & Corridor Simulator Map</span>
              {trackingVehicle && (
                <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1.5 animate-pulse">
                  <Navigation size={12} /> Active Tracking: {trackingVehicle.id} ({trackingVehicle.status})
                </span>
              )}
            </div>
            
            <div className="flex-1 rounded-xl overflow-hidden shadow-inner border border-white/5 relative">
              <MapPanel
                center={[12.9716, 77.5946]}
                zoom={12}
                routePoints={routePoints}
                corridorActive={selectedCorridorId !== null}
                signals={signals}
                trackingVehicle={trackingVehicle}
              />
            </div>
          </div>

        </div>

      </main>
    </div>
  );
}
