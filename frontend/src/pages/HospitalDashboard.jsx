import React, { useRef, useState, useEffect } from 'react';
import { serviceAPI } from '../services/api';
import { connectSocket, disconnectSocket, socket } from '../services/socket';
import MapPanel from '../components/MapPanel';
import { ShieldAlert, Truck, Send, CheckCircle2, Play, MapPin, Clock, Navigation, Power } from 'lucide-react';

export default function HospitalDashboard({ user, onLogout }) {
  const [alerts, setAlerts] = useState([]);
  const [activeDispatch, setActiveDispatch] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState('');

  // Socket state for tracking vehicle
  const [trackingPos, setTrackingPos] = useState(null);
  const [corridorActive, setCorridorActive] = useState(false);
  const [signals, setSignals] = useState([]);
  const activeDispatchRef = useRef(null);

  useEffect(() => {
    activeDispatchRef.current = activeDispatch;
  }, [activeDispatch]);

  useEffect(() => {
    // Connect to Socket.IO room
    connectSocket('hospital_user');

    loadDashboardData();

    // Socket listeners
    socket.on('new_alert', (data) => {
      if (String(data.dispatch.service_id) !== String(user.serviceId)) return;
      console.log('Hospital socket: new emergency alert received:', data);
      setAlerts(prev => [data.dispatch, ...prev]);
    });

    socket.on('vehicle_tracking_update', (data) => {
      console.log('Hospital socket: vehicle tracking tick:', data);
      const currentDispatch = activeDispatchRef.current;
      if (currentDispatch && currentDispatch.vehicle_id === data.vehicleId) {
        setTrackingPos({
          latitude: parseFloat(data.latitude),
          longitude: parseFloat(data.longitude),
          progress: data.progress
        });
        setVehicles(prev => prev.map(v => v.id === data.vehicleId ? {
          ...v,
          latitude: data.latitude,
          longitude: data.longitude,
          status: data.status
        } : v));
      }
    });

    socket.on('vehicle_status_change', (data) => {
      console.log('Hospital socket: vehicle status change:', data);
      // Update vehicles list
      setVehicles(prev => prev.map(v => v.id === data.vehicleId ? { ...v, status: data.status, latitude: data.latitude || v.latitude, longitude: data.longitude || v.longitude } : v));
      
      // Update active dispatch status
      setActiveDispatch(prev => {
        if (prev && prev.vehicle_id === data.vehicleId) {
          // If returned to available, clear active dispatch
          if (data.status === 'available') {
            setTrackingPos(null);
            return null;
          }
          return { ...prev, status: data.status };
        }
        return prev;
      });

    });

    socket.on('green_corridor_update', (data) => {
      const currentDispatch = activeDispatchRef.current;
      if (!currentDispatch || currentDispatch.id !== data.dispatchId) return;

      const isActive = data.status === 'active';
      setCorridorActive(isActive);
      setSignals(isActive ? data.signals : []);
      if (isActive && Array.isArray(data.route) && data.route.length > 0) {
        setActiveDispatch(prev => prev ? { ...prev, route_geometry: data.route } : prev);
      }
    });

    return () => {
      socket.off('new_alert');
      socket.off('vehicle_tracking_update');
      socket.off('vehicle_status_change');
      socket.off('green_corridor_update');
      disconnectSocket();
    };
  }, []);

  const loadDashboardData = async () => {
    if (!user.serviceId) return;
    try {
      // Load pending alerts
      const alertsRes = await serviceAPI.getAlerts(user.serviceId);
      setAlerts(alertsRes.data);

      // Load active dispatch
      const activeRes = await serviceAPI.getActiveDispatch(user.serviceId);
      setActiveDispatch(activeRes.data);
      activeDispatchRef.current = activeRes.data;
      setCorridorActive(Boolean(activeRes.data?.corridor_active));
      setSignals(activeRes.data?.signals || []);

      // Load vehicle fleet
      const vehiclesRes = await serviceAPI.getVehicles(user.serviceId);
      setVehicles(vehiclesRes.data);
      
      // Auto-select first available vehicle
      const firstAvailable = vehiclesRes.data.find(v => v.status === 'available');
      if (firstAvailable) {
        setSelectedVehicleId(firstAvailable.id);
      }
    } catch (err) {
      console.error('Failed to load dashboard data', err);
    }
  };

  const handleDispatch = async (alertId) => {
    if (!selectedVehicleId) {
      alert('Please select an ambulance to dispatch.');
      return;
    }
    setLoading(true);
    try {
      const response = await serviceAPI.dispatchVehicle(user.serviceId, alertId, selectedVehicleId);
      setFeedback(`Ambulance ${selectedVehicleId} has been dispatched!`);
      // Clear alerts and reload dashboard
      setAlerts(prev => prev.filter(a => a.id !== alertId));
      loadDashboardData();
      setTimeout(() => setFeedback(''), 4000);
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || 'Failed to dispatch vehicle.');
    } finally {
      setLoading(false);
    }
  };

  const handleSetEnRoute = async () => {
    if (!activeDispatch) return;
    try {
      await serviceAPI.setEnRoute(user.serviceId, activeDispatch.id);
      setFeedback('Ambulance is now En Route. Priority Green Corridor has been activated.');
      loadDashboardData();
      setTimeout(() => setFeedback(''), 4000);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSetAtScene = async () => {
    if (!activeDispatch) return;
    try {
      await serviceAPI.setAtScene(user.serviceId, activeDispatch.id);
      setFeedback('Ambulance arrived At Scene.');
      loadDashboardData();
      setTimeout(() => setFeedback(''), 4000);
    } catch (err) {
      console.error(err);
    }
  };

  const handleResolve = async () => {
    if (!activeDispatch) return;
    try {
      await serviceAPI.resolveIncident(user.serviceId, activeDispatch.id);
      setFeedback('Emergency resolved! Ambulance is returning to station.');
      loadDashboardData();
      setTimeout(() => setFeedback(''), 4000);
    } catch (err) {
      console.error(err);
    }
  };

  const getVehicleBadgeColor = (status) => {
    switch (status) {
      case 'available': return 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400';
      case 'dispatched': return 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400';
      case 'en_route': return 'bg-sky-500/10 border-sky-500/20 text-sky-400 animate-pulse';
      case 'at_scene': return 'bg-purple-500/10 border-purple-500/20 text-purple-400';
      case 'returning': return 'bg-amber-500/10 border-amber-500/20 text-amber-400';
      case 'maintenance': return 'bg-red-500/10 border-red-500/20 text-red-400';
      default: return 'bg-gray-500/10 text-gray-400';
    }
  };

  const mapDispatch = activeDispatch || alerts[0] || null;
  const mapService = mapDispatch ? {
    id: mapDispatch.service_id || user.serviceId,
    name: mapDispatch.service_name || user.name,
    type: mapDispatch.service_type || 'hospital',
    latitude: mapDispatch.service_lat,
    longitude: mapDispatch.service_lng,
    distance: mapDispatch.distance,
    availableVehicles: vehicles.filter(v => v.status === 'available').length,
    isRecommended: true
  } : null;
  const serviceCenter = mapService && mapService.latitude && mapService.longitude
    ? [parseFloat(mapService.latitude), parseFloat(mapService.longitude)]
    : [12.9716, 77.5946];
  const incidentCenter = mapDispatch
    ? [parseFloat(mapDispatch.incident_lat), parseFloat(mapDispatch.incident_lng)]
    : null;
  const mapCenter = incidentCenter && serviceCenter.every(Number.isFinite) && incidentCenter.every(Number.isFinite)
    ? [
        (serviceCenter[0] + incidentCenter[0]) / 2,
        (serviceCenter[1] + incidentCenter[1]) / 2
      ]
    : serviceCenter;

  return (
    <div className="min-h-screen bg-[#070b13] flex flex-col">
      {/* Navbar */}
      <nav className="glass-panel border-b border-white/5 py-4 px-6 flex justify-between items-center shadow-lg relative z-20">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-600/10 text-blue-400 rounded-lg border border-blue-500/20">
            <Truck size={20} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white leading-tight">{user.name}</h1>
            <p className="text-xs text-gray-400">Hospital Emergency Dispatch Console</p>
          </div>
        </div>

        <button onClick={onLogout} className="p-2 text-gray-400 hover:text-red-400 transition" title="Sign Out">
          <Power size={18} />
        </button>
      </nav>

      {/* Main Panel */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-hidden items-stretch">
        
        {/* Left column: Alerts & Dispatch panels (5 cols) */}
        <div className="lg:col-span-5 flex flex-col space-y-6">
          
          {feedback && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-semibold">
              {feedback}
            </div>
          )}

          {/* Active Emergency Dispatch Operator */}
          <div className="glass-panel p-5 rounded-2xl flex-1 flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-gray-300 mb-4 pb-2 border-b border-white/5 flex items-center gap-1.5">
                <ShieldAlert size={16} className="text-amber-400 animate-pulse" /> Active Dispatch Panel
              </h3>

              {activeDispatch ? (
                <div className="space-y-4">
                  <div className="bg-slate-900/50 p-4 rounded-xl border border-white/5 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] uppercase font-bold text-blue-400">Incident Type</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border bg-white/5 text-white">
                        {activeDispatch.status.replace('_', ' ')}
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-white uppercase">{activeDispatch.incident_type.replace('_', ' ')}</h4>
                    <p className="text-xs text-gray-400">{activeDispatch.incident_description || 'No description provided.'}</p>
                    
                    <div className="grid grid-cols-2 gap-2 text-[10px] text-gray-500 pt-2 border-t border-white/5">
                      <div>
                        <span>Assigned Ambulance:</span>
                        <strong className="text-white block font-bold text-xs mt-0.5">{activeDispatch.vehicle_id}</strong>
                      </div>
                      <div>
                        <span>Destination Coordinates:</span>
                        <strong className="text-white block mt-0.5">{activeDispatch.incident_lat}, {activeDispatch.incident_lng}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Dispatch Controls */}
                  <div className="space-y-3 pt-3">
                    {activeDispatch.status === 'dispatched' && (
                      <button
                        onClick={handleSetEnRoute}
                        className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 transition text-xs font-bold text-white flex items-center justify-center gap-2 shadow-lg"
                      >
                        <Play size={14} /> Start Route (Go En Route & Activate Corridor)
                      </button>
                    )}

                    {activeDispatch.status === 'en_route' && (
                      <div className="space-y-3">
                        <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl text-center text-xs text-emerald-400 font-bold animate-pulse">
                          Priority Green Corridor Override Engaged. GPS Simulation active...
                        </div>
                        <button
                          onClick={handleSetAtScene}
                          className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 transition text-xs font-bold text-white flex items-center justify-center gap-1.5 shadow-lg"
                        >
                          <CheckCircle2 size={14} /> Arrived At Scene
                        </button>
                      </div>
                    )}

                    {activeDispatch.status === 'at_scene' && (
                      <button
                        onClick={handleResolve}
                        className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-500 hover:to-blue-500 transition text-xs font-bold text-white flex items-center justify-center gap-1.5 shadow-lg"
                      >
                        <CheckCircle2 size={14} /> Resolve Incident & Return
                      </button>
                    )}

                    {activeDispatch.status === 'returning' && (
                      <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl text-center text-xs text-amber-400 font-bold">
                        Ambulance is returning to station. Simulated route active...
                      </div>
                    )}
                  </div>
                </div>
              ) : alerts.length > 0 ? (
                /* Pending dispatch choice */
                <div className="space-y-4">
                  <div className="bg-amber-500/5 border border-amber-500/10 p-3.5 rounded-xl text-xs text-gray-300">
                    <p className="font-bold text-amber-400 flex items-center gap-1 mb-1">
                      <ShieldAlert size={14} /> Alert Awaiting Dispatch
                    </p>
                    <div className="space-y-1.5 mt-2 text-[11px] text-gray-400">
                      <p>Type: <strong className="text-white uppercase">{alerts[0].incident_type.replace('_', ' ')}</strong></p>
                      <p>Details: <strong className="text-white">{alerts[0].incident_description || 'None'}</strong></p>
                      <p>Distance: <strong className="text-white">{alerts[0].distance || '2.4'} km</strong></p>
                      <p>Est. Duration: <strong className="text-white">{alerts[0].normal_eta} minutes</strong></p>
                    </div>
                  </div>

                  {/* Dispatch Selector */}
                  <div className="space-y-3 pt-2">
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1.5">Select Ambulance</label>
                      <select
                        value={selectedVehicleId}
                        onChange={(e) => setSelectedVehicleId(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl glass-input text-white text-xs focus:border-blue-500"
                      >
                        <option value="">-- Choose available vehicle --</option>
                        {vehicles.filter(v => v.status === 'available').map(v => (
                          <option key={v.id} value={v.id}>{v.id} (Ambulance - Available)</option>
                        ))}
                      </select>
                    </div>

                    <button
                      onClick={() => handleDispatch(alerts[0].id)}
                      disabled={loading || !selectedVehicleId}
                      className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 transition text-xs font-bold text-white flex items-center justify-center gap-1.5 shadow-lg"
                    >
                      <Send size={14} /> Dispatch Ambulance
                    </button>
                  </div>
                </div>
              ) : (
                <div className="py-20 text-center text-gray-500 text-xs my-auto">
                  No active dispatches or emergency alerts.
                </div>
              )}
            </div>
          </div>

          {/* Vehicle Fleet list */}
          <div className="glass-panel p-5 rounded-2xl h-[220px] flex flex-col overflow-hidden">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gray-300 mb-3 pb-2 border-b border-white/5">
              Ambulance Vehicle Management
            </h3>
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {vehicles.map((v) => (
                <div key={v.id} className="p-2.5 rounded-lg bg-white/5 border border-white/5 flex justify-between items-center text-xs">
                  <div className="font-semibold text-white">{v.id}</div>
                  <span className={`px-2 py-0.5 border rounded-full text-[9px] font-bold uppercase ${getVehicleBadgeColor(v.status)}`}>
                    {v.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Right column: Leaflet map (7 cols) */}
        <div className="lg:col-span-7 glass-panel p-4 rounded-2xl flex flex-col h-[650px]">
          <div className="mb-2 flex justify-between items-center px-2">
            <span className="text-xs font-semibold text-gray-400">Dispatch Map Visualizer</span>
            {activeDispatch && (
              <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                <Clock size={10} /> Active Dispatch: {activeDispatch.vehicle_id} ({activeDispatch.status})
              </span>
            )}
          </div>
          <div className="flex-1 rounded-xl overflow-hidden">
            <MapPanel
              center={mapCenter}
              zoom={13}
              incidents={mapDispatch ? [{
                id: mapDispatch.incident_id,
                latitude: mapDispatch.incident_lat,
                longitude: mapDispatch.incident_lng,
                type: mapDispatch.incident_type,
                status: mapDispatch.status
              }] : []}
              activeIncident={null}
              nearbyServices={mapService ? [mapService] : []}
              routePoints={mapDispatch ? mapDispatch.route_geometry : []}
              corridorActive={corridorActive && activeDispatch?.status === 'en_route'}
              signals={signals}
              trackingVehicle={activeDispatch && trackingPos ? {
                id: activeDispatch.vehicle_id,
                latitude: trackingPos.latitude,
                longitude: trackingPos.longitude,
                type: 'ambulance',
                status: activeDispatch.status,
                progress: trackingPos.progress
              } : null}
            />
          </div>
        </div>

      </main>
    </div>
  );
}
