import React, { useRef, useState, useEffect } from 'react';
import { serviceAPI, incidentsAPI } from '../services/api';
import { connectSocket, disconnectSocket, socket } from '../services/socket';
import MapPanel from '../components/MapPanel';
import { 
  ShieldAlert, Truck, Send, CheckCircle2, Play, MapPin, Clock, 
  Navigation, Power, Settings, BarChart2, List, Search, Calendar, 
  User, Check, AlertCircle, HelpCircle, Activity, Shield
} from 'lucide-react';

export default function HospitalDashboard({ user, onLogout }) {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [alerts, setAlerts] = useState([]);
  
  // Multiple Active Dispatches States
  const [activeDispatches, setActiveDispatches] = useState([]);
  const [selectedDispatchId, setSelectedDispatchId] = useState('');
  
  // Tracking positions keyed by dispatchId
  const [trackingPositions, setTrackingPositions] = useState({});
  // Corridor states keyed by dispatchId: { corridorActive: boolean, signals: Array }
  const [corridorsState, setCorridorsState] = useState({});

  const [vehicles, setVehicles] = useState([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState('');

  // Stats
  const [stats, setStats] = useState({ totalIncidents: 0, activeVehicles: 0, availableVehicles: 0, avgResponseTime: 'N/A' });
  const [loadingStats, setLoadingStats] = useState(false);

  // History Tab States
  const [history, setHistory] = useState([]);
  const [historySearch, setHistorySearch] = useState('');
  const [historyFilter, setHistoryFilter] = useState('all');
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState(null);
  const [selectedHistoryTimeline, setSelectedHistoryTimeline] = useState([]);
  
  // Profile Settings States
  const [profileName, setProfileName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileAddress, setProfileAddress] = useState('');
  const [profileLat, setProfileLat] = useState('');
  const [profileLng, setProfileLng] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [profilePassword, setProfilePassword] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');
  const [profileError, setProfileError] = useState('');

  // Resolve Outcome States
  const [resolveOutcome, setResolveOutcome] = useState('');
  const [showResolveModal, setShowResolveModal] = useState(false);

  const activeDispatchesRef = useRef([]);

  useEffect(() => {
    activeDispatchesRef.current = activeDispatches;
  }, [activeDispatches]);

  useEffect(() => {
    // Connect to Socket.IO room
    connectSocket('hospital_user');

    loadDashboardData();
    loadStats();

    // Socket listeners
    socket.on('new_alert', (data) => {
      if (String(data.dispatch.service_id) !== String(user.serviceId)) return;
      console.log('Hospital socket: new emergency alert received:', data);
      setAlerts(prev => [data.dispatch, ...prev]);
    });

    socket.on('vehicle_tracking_update', (data) => {
      console.log('Hospital socket: vehicle tracking update:', data);
      
      // Update tracking position for this specific dispatch
      setTrackingPositions(prev => ({
        ...prev,
        [data.dispatchId]: {
          latitude: parseFloat(data.latitude),
          longitude: parseFloat(data.longitude),
          progress: data.progress
        }
      }));

      // Update vehicles list
      setVehicles(prev => prev.map(v => v.id === data.vehicleId ? {
        ...v,
        latitude: data.latitude,
        longitude: data.longitude,
        status: data.status
      } : v));
    });

    socket.on('vehicle_status_change', (data) => {
      console.log('Hospital socket: vehicle status change:', data);
      
      // Update vehicles list
      setVehicles(prev => prev.map(v => v.id === data.vehicleId ? { 
        ...v, 
        status: data.status, 
        latitude: data.latitude || v.latitude, 
        longitude: data.longitude || v.longitude 
      } : v));

      // Reload dispatches when a vehicle status changes
      loadActiveDispatches();
      loadStats();
    });

    socket.on('green_corridor_update', (data) => {
      console.log('Hospital socket: corridor update:', data);
      const isActive = data.status === 'active';
      setCorridorsState(prev => ({
        ...prev,
        [data.dispatchId]: {
          corridorActive: isActive,
          signals: isActive ? data.signals : []
        }
      }));

      if (isActive && Array.isArray(data.route) && data.route.length > 0) {
        setActiveDispatches(prev => prev.map(d => d.id === data.dispatchId ? { ...d, route_geometry: data.route } : d));
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

      // Load active dispatches
      await loadActiveDispatches();

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

  const loadActiveDispatches = async () => {
    try {
      const activeRes = await serviceAPI.getActiveDispatches(user.serviceId);
      const dispatches = activeRes.data;
      setActiveDispatches(dispatches);

      // Setup initial corridors and tracking pos
      const newCorridors = {};
      const newTracking = {};
      
      dispatches.forEach(d => {
        newCorridors[d.id] = {
          corridorActive: Boolean(d.corridor_active),
          signals: d.signals || []
        };
        if (d.v_lat && d.v_lng) {
          newTracking[d.id] = {
            latitude: parseFloat(d.v_lat),
            longitude: parseFloat(d.v_lng),
            progress: 0
          };
        }
      });

      setCorridorsState(newCorridors);
      setTrackingPositions(newTracking);

      // Auto select current active dispatch if not set or not in new list
      if (dispatches.length > 0) {
        if (!selectedDispatchId || !dispatches.some(d => String(d.id) === String(selectedDispatchId))) {
          setSelectedDispatchId(String(dispatches[0].id));
          socket.emit('join_dispatch', dispatches[0].id);
        }
      } else {
        setSelectedDispatchId('');
      }
    } catch (err) {
      console.error('Failed to load active dispatches', err);
    }
  };

  const loadStats = async () => {
    if (!user.serviceId) return;
    setLoadingStats(true);
    try {
      const res = await serviceAPI.getStats(user.serviceId);
      setStats(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingStats(false);
    }
  };

  const loadHistory = async () => {
    if (!user.serviceId) return;
    setLoadingHistory(true);
    try {
      const res = await serviceAPI.getHistory(user.serviceId, {
        filter: historyFilter,
        search: historySearch
      });
      setHistory(res.data);
      if (res.data.length > 0) {
        selectHistoryItem(res.data[0]);
      } else {
        setSelectedHistoryItem(null);
        setSelectedHistoryTimeline([]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const selectHistoryItem = async (item) => {
    setSelectedHistoryItem(item);
    setSelectedHistoryTimeline([]);
    try {
      const res = await incidentsAPI.getTimeline(item.incident_id);
      setSelectedHistoryTimeline(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const loadProfile = async () => {
    if (!user.serviceId) return;
    setProfileLoading(true);
    try {
      const res = await serviceAPI.getProfile(user.serviceId);
      setProfileName(res.data.name);
      setProfilePhone(res.data.phone);
      setProfileAddress(res.data.address);
      setProfileLat(res.data.latitude);
      setProfileLng(res.data.longitude);
      setProfileEmail(res.data.email);
    } catch (err) {
      console.error(err);
    } finally {
      setProfileLoading(false);
    }
  };

  const handleDispatch = async (alertId) => {
    if (!selectedVehicleId) {
      alert('Please select an ambulance to dispatch.');
      return;
    }
    setLoading(true);
    try {
      await serviceAPI.dispatchVehicle(user.serviceId, alertId, selectedVehicleId);
      setFeedback(`Ambulance ${selectedVehicleId} has been dispatched!`);
      setAlerts(prev => prev.filter(a => a.id !== alertId));
      await loadDashboardData();
      loadStats();
      setTimeout(() => setFeedback(''), 4000);
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || 'Failed to dispatch vehicle.');
    } finally {
      setLoading(false);
    }
  };

  const handleSetEnRoute = async (dispatchId) => {
    try {
      await serviceAPI.setEnRoute(user.serviceId, dispatchId);
      setFeedback('Ambulance is now En Route. Priority Green Corridor has been activated.');
      loadDashboardData();
      setTimeout(() => setFeedback(''), 4000);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSetAtScene = async (dispatchId) => {
    try {
      await serviceAPI.setAtScene(user.serviceId, dispatchId);
      setFeedback('Ambulance arrived At Scene.');
      loadDashboardData();
      setTimeout(() => setFeedback(''), 4000);
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenResolveModal = () => {
    setResolveOutcome('');
    setShowResolveModal(true);
  };

  const handleResolveSubmit = async (e) => {
    e.preventDefault();
    if (!selectedDispatchId) return;
    try {
      await serviceAPI.resolveIncident(user.serviceId, {
        dispatchId: parseInt(selectedDispatchId),
        outcome: resolveOutcome
      });
      setFeedback('Emergency resolved! Ambulance is returning to station.');
      setShowResolveModal(false);
      loadDashboardData();
      loadStats();
      setTimeout(() => setFeedback(''), 4000);
    } catch (err) {
      console.error(err);
      alert('Failed to resolve incident.');
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setProfileSaving(true);
    setProfileMessage('');
    setProfileError('');
    try {
      await serviceAPI.updateProfile(user.serviceId, {
        name: profileName,
        phone: profilePhone,
        address: profileAddress,
        latitude: parseFloat(profileLat),
        longitude: parseFloat(profileLng),
        email: profileEmail,
        password: profilePassword || undefined
      });
      setProfileMessage('Operator settings updated successfully!');
      setProfilePassword('');
      loadProfile();
    } catch (err) {
      setProfileError(err.response?.data?.error || 'Failed to save settings.');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleDispatchSelect = (id) => {
    setSelectedDispatchId(id);
    socket.emit('join_dispatch', id);
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

  // Find currently active dispatch details for selected active dispatch ID
  const activeDispatch = activeDispatches.find(d => String(d.id) === String(selectedDispatchId));
  const activeCorridor = selectedDispatchId ? corridorsState[selectedDispatchId]?.corridorActive : false;
  const activeSignals = selectedDispatchId ? corridorsState[selectedDispatchId]?.signals : [];
  const activeTracking = selectedDispatchId ? trackingPositions[selectedDispatchId] : null;

  // Map calculations
  const mapIncident = activeDispatch ? {
    id: activeDispatch.incident_id,
    latitude: activeDispatch.incident_lat,
    longitude: activeDispatch.incident_lng,
    type: activeDispatch.incident_type,
    status: activeDispatch.status
  } : null;

  const mapService = activeDispatch ? {
    id: activeDispatch.service_id,
    name: activeDispatch.service_name,
    type: activeDispatch.service_type,
    latitude: activeDispatch.service_lat,
    longitude: activeDispatch.service_lng,
    distance: activeDispatch.distance,
    availableVehicles: vehicles.filter(v => v.status === 'available').length,
    isRecommended: true
  } : null;

  const serviceCenter = mapService && mapService.latitude && mapService.longitude
    ? [parseFloat(mapService.latitude), parseFloat(mapService.longitude)]
    : [12.9716, 77.5946];
  const incidentCenter = mapIncident
    ? [parseFloat(mapIncident.latitude), parseFloat(mapIncident.longitude)]
    : null;
  const mapCenter = incidentCenter && serviceCenter.every(Number.isFinite) && incidentCenter.every(Number.isFinite)
    ? [
        (serviceCenter[0] + incidentCenter[0]) / 2,
        (serviceCenter[1] + incidentCenter[1]) / 2
      ]
    : serviceCenter;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0b0f19] via-[#070b13] to-[#0d1323] flex flex-col font-inter">
      {/* Top Navbar */}
      <nav className="glass-panel border-b border-white/5 py-4 px-6 flex flex-col md:flex-row justify-between items-center gap-4 shadow-xl relative z-20">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-600/10 text-blue-400 rounded-xl border border-blue-500/20 shadow-inner">
            <Truck size={20} className="animate-pulse" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight text-white leading-tight">{user.name}</h1>
            <p className="text-[11px] text-gray-400">Hospital Operator Dispatch Console</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center justify-between w-full md:w-auto gap-4">
          <div className="flex bg-white/5 p-1 rounded-xl border border-white/10 shadow-inner">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200 flex items-center gap-1.5 ${activeTab === 'dashboard' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
            >
              <Activity size={13} />
              Console
            </button>
            <button
              onClick={() => {
                setActiveTab('history');
                loadHistory();
              }}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200 flex items-center gap-1.5 ${activeTab === 'history' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
            >
              <List size={13} />
              Service History
            </button>
            <button
              onClick={() => {
                setActiveTab('profile');
                loadProfile();
              }}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200 flex items-center gap-1.5 ${activeTab === 'profile' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
            >
              <Settings size={13} />
              Profile
            </button>
          </div>

          <button onClick={onLogout} className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-red-400 hover:border-red-500/20 hover:bg-red-500/5 transition-all" title="Sign Out">
            <Power size={18} />
          </button>
        </div>
      </nav>

      {/* Stats Banner Row */}
      {activeTab !== 'profile' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-6 pt-6 shrink-0">
          <div className="glass-panel p-4 rounded-xl border border-white/5 bg-[#0b0e17] flex justify-between items-center shadow-inner">
            <div>
              <span className="text-[9px] text-gray-500 block uppercase font-bold tracking-wider">Total Dispatches</span>
              <strong className="text-xl text-white font-mono">{stats.totalIncidents}</strong>
            </div>
            <BarChart2 size={24} className="text-blue-500/40" />
          </div>

          <div className="glass-panel p-4 rounded-xl border border-white/5 bg-[#0b0e17] flex justify-between items-center shadow-inner">
            <div>
              <span className="text-[9px] text-gray-500 block uppercase font-bold tracking-wider">Active Dispatches</span>
              <strong className="text-xl text-amber-500 font-mono">{stats.activeVehicles}</strong>
            </div>
            <Activity size={24} className="text-amber-500/40" />
          </div>

          <div className="glass-panel p-4 rounded-xl border border-white/5 bg-[#0b0e17] flex justify-between items-center shadow-inner">
            <div>
              <span className="text-[9px] text-gray-500 block uppercase font-bold tracking-wider">Available Fleet</span>
              <strong className="text-xl text-emerald-400 font-mono">{stats.availableVehicles}</strong>
            </div>
            <Truck size={24} className="text-emerald-500/40" />
          </div>

          <div className="glass-panel p-4 rounded-xl border border-white/5 bg-[#0b0e17] flex justify-between items-center shadow-inner">
            <div>
              <span className="text-[9px] text-gray-500 block uppercase font-bold tracking-wider">Avg. Response Time</span>
              <strong className="text-sm text-white font-bold">{stats.avgResponseTime}</strong>
            </div>
            <Clock size={24} className="text-indigo-500/40" />
          </div>
        </div>
      )}

      {/* Main Panel */}
      <main className="flex-1 w-full max-w-none px-6 py-6 flex flex-col lg:h-[calc(100vh-140px)] lg:overflow-hidden">
        
        {activeTab === 'dashboard' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch flex-1 h-full lg:overflow-hidden">
            
            {/* Left column: Alerts & Dispatch panels (5 cols) */}
            <div className="lg:col-span-5 flex flex-col space-y-6 h-auto lg:h-full overflow-hidden">
              
              {feedback && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-semibold shadow-inner shrink-0">
                  {feedback}
                </div>
              )}

              {/* Selector for multiple active dispatches */}
              {activeDispatches.length > 1 && (
                <div className="glass-panel p-4 rounded-2xl border border-white/5 shrink-0 bg-[#0f1422] shadow-md">
                  <label className="block text-[10px] font-black uppercase tracking-wider text-amber-400 mb-1.5">
                    Select Active Dispatch to View/Manage
                  </label>
                  <select
                    value={selectedDispatchId}
                    onChange={(e) => handleDispatchSelect(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl glass-input text-white text-xs focus:border-amber-500 shadow-inner"
                  >
                    {activeDispatches.map(d => (
                      <option key={d.id} value={d.id}>
                        Dispatch #{d.id}: {d.incident_type.replace('_', ' ').toUpperCase()} (Vehicle: {d.vehicle_id})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Active Emergency Dispatch Operator */}
              <div className="glass-panel p-5 rounded-2xl flex-1 flex flex-col justify-between overflow-y-auto min-h-[300px]">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-300 mb-4 pb-2 border-b border-white/5 flex items-center gap-1.5">
                    <ShieldAlert size={16} className="text-amber-400 animate-pulse" /> Active Dispatch Panel
                  </h3>

                  {activeDispatch ? (
                    <div className="space-y-4">
                      <div className="bg-slate-900/50 p-4 rounded-xl border border-white/5 space-y-2 shadow-inner">
                        <div className="flex justify-between items-center">
                          <span className="text-[9px] uppercase font-bold text-blue-400 tracking-wider">Incident Type</span>
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase border bg-white/5 text-white tracking-wider">
                            {activeDispatch.status.replace('_', ' ')}
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-white uppercase tracking-tight">{activeDispatch.incident_type.replace('_', ' ')}</h4>
                        <p className="text-xs text-gray-400">{activeDispatch.incident_description || 'No description provided.'}</p>
                        
                        <div className="grid grid-cols-2 gap-2 text-[10px] text-gray-500 pt-2.5 border-t border-white/5">
                          <div>
                            <span>Assigned Ambulance:</span>
                            <strong className="text-white block font-bold text-xs mt-0.5">{activeDispatch.vehicle_id}</strong>
                          </div>
                          <div>
                            <span>Destination Coordinates:</span>
                            <strong className="text-white block font-bold text-xs mt-0.5">{activeDispatch.incident_lat}, {activeDispatch.incident_lng}</strong>
                          </div>
                        </div>
                      </div>

                      {/* Dispatch Controls */}
                      <div className="space-y-3 pt-3">
                        {activeDispatch.status === 'dispatched' && (
                          <button
                            onClick={() => handleSetEnRoute(activeDispatch.id)}
                            className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 transition text-xs font-bold text-white flex items-center justify-center gap-2 shadow-lg active:scale-[0.98]"
                          >
                            <Play size={14} /> Start Route (Go En Route & Activate Corridor)
                          </button>
                        )}

                        {activeDispatch.status === 'en_route' && (
                          <div className="space-y-3">
                            <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl text-center text-xs text-emerald-400 font-bold animate-pulse shadow-inner">
                              Priority Green Corridor Override Engaged. GPS Simulation active...
                            </div>
                            <button
                              onClick={() => handleSetAtScene(activeDispatch.id)}
                              className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 transition text-xs font-bold text-white flex items-center justify-center gap-1.5 shadow-lg active:scale-[0.98]"
                            >
                              <CheckCircle2 size={14} /> Arrived At Scene
                            </button>
                          </div>
                        )}

                        {activeDispatch.status === 'at_scene' && (
                          <button
                            onClick={handleOpenResolveModal}
                            className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-500 hover:to-blue-500 transition text-xs font-bold text-white flex items-center justify-center gap-1.5 shadow-lg active:scale-[0.98]"
                          >
                            <CheckCircle2 size={14} /> Resolve Incident & Return
                          </button>
                        )}

                        {activeDispatch.status === 'returning' && (
                          <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl text-center text-xs text-amber-400 font-bold shadow-inner">
                            Ambulance is returning to station...
                          </div>
                        )}
                      </div>
                    </div>
                  ) : alerts.length > 0 ? (
                    <div className="space-y-4">
                      <div className="bg-amber-500/5 border border-amber-500/10 p-3.5 rounded-xl text-xs text-gray-300 shadow-inner">
                        <p className="font-bold text-amber-400 flex items-center gap-1 mb-1 uppercase tracking-wider">
                          <ShieldAlert size={14} /> Alert Awaiting Dispatch
                        </p>
                        <div className="space-y-1.5 mt-2 text-[11px] text-gray-400">
                          <p>Type: <strong className="text-white uppercase">{alerts[0].incident_type.replace('_', ' ')}</strong></p>
                          <p>Details: <strong className="text-white">{alerts[0].incident_description || 'None'}</strong></p>
                          <p>Distance: <strong className="text-white">{alerts[0].distance || '2.4'} km</strong></p>
                          <p>Est. Duration: <strong className="text-white">{alerts[0].normal_eta} minutes</strong></p>
                        </div>
                      </div>

                      <div className="space-y-3 pt-2">
                        <div>
                          <label className="block text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Select Ambulance</label>
                          <select
                            value={selectedVehicleId}
                            onChange={(e) => setSelectedVehicleId(e.target.value)}
                            className="w-full px-4 py-2.5 rounded-xl glass-input text-white text-xs focus:border-blue-500 shadow-inner"
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
                          className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 transition text-xs font-bold text-white flex items-center justify-center gap-1.5 shadow-lg active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Send size={14} /> Dispatch Ambulance
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-center text-xs text-gray-500 py-20 my-auto">
                      No active dispatches or emergency alerts.
                    </p>
                  )}
                </div>
              </div>

              {/* Vehicle Fleet list */}
              <div className="glass-panel p-5 rounded-2xl h-[220px] flex flex-col overflow-hidden shrink-0">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-300 mb-3 pb-2 border-b border-white/5">
                  Ambulance Vehicle Management
                </h3>
                <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                  {vehicles.map((v) => (
                    <div key={v.id} className="p-2.5 rounded-xl bg-white/5 border border-white/5 flex justify-between items-center text-xs hover:border-white/10 transition animate-none">
                      <div className="font-semibold text-white">{v.id}</div>
                      <span className={`px-2 py-0.5 border rounded-full text-[8px] font-black uppercase tracking-wider ${getVehicleBadgeColor(v.status)}`}>
                        {v.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

            </div>

            {/* Right column: Leaflet map (7 cols) */}
            <div className="lg:col-span-7 glass-panel p-4 rounded-2xl flex flex-col h-[400px] lg:h-full overflow-hidden">
              <div className="mb-2 flex justify-between items-center px-2 pb-1.5">
                <span className="text-xs font-bold text-gray-300">Dispatch Map Visualizer</span>
                {activeDispatch && (
                  <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1.5 animate-pulse">
                    <Clock size={12} /> Active Dispatch: {activeDispatch.vehicle_id} ({activeDispatch.status})
                  </span>
                )}
              </div>
              <div className="flex-1 rounded-xl overflow-hidden shadow-inner border border-white/5 relative">
                <MapPanel
                  center={mapCenter}
                  zoom={13}
                  incidents={mapIncident ? [mapIncident] : []}
                  activeIncident={null}
                  nearbyServices={mapService ? [mapService] : []}
                  routePoints={activeDispatch ? activeDispatch.route_geometry : []}
                  corridorActive={activeCorridor && ['en_route', 'returning'].includes(activeDispatch?.status)}
                  signals={activeSignals}
                  trackingVehicle={activeDispatch && activeTracking ? {
                    id: activeDispatch.vehicle_id,
                    latitude: activeTracking.latitude,
                    longitude: activeTracking.longitude,
                    type: 'ambulance',
                    status: activeDispatch.status,
                    progress: activeTracking.progress
                  } : null}
                />
              </div>
            </div>

          </div>
        )}

        {activeTab === 'history' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch flex-1 h-full lg:overflow-hidden">
            {/* Left side: History List & Search (5 cols) */}
            <div className="lg:col-span-5 glass-panel p-5 rounded-2xl flex flex-col h-[400px] lg:h-full overflow-hidden">
              <div className="space-y-4 pb-4 border-b border-white/5 shrink-0">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Service History logs</h3>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search size={14} className="absolute left-3 top-3 text-gray-500" />
                    <input
                      type="text"
                      placeholder="Search Dispatch / Citizen ID..."
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                      className="w-full pl-9 pr-4 py-2.5 rounded-xl glass-input text-xs text-white focus:border-blue-500"
                    />
                  </div>
                  <button onClick={loadHistory} className="px-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition shadow">
                    Search
                  </button>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setHistoryFilter('all'); setTimeout(loadHistory, 0); }}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition ${historyFilter === 'all' ? 'bg-blue-600 text-white' : 'bg-white/5 text-gray-400 hover:text-white'}`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => { setHistoryFilter('today'); setTimeout(loadHistory, 0); }}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition ${historyFilter === 'today' ? 'bg-blue-600 text-white' : 'bg-white/5 text-gray-400 hover:text-white'}`}
                  >
                    Today
                  </button>
                  <button
                    onClick={() => { setHistoryFilter('7days'); setTimeout(loadHistory, 0); }}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition ${historyFilter === '7days' ? 'bg-blue-600 text-white' : 'bg-white/5 text-gray-400 hover:text-white'}`}
                  >
                    Last 7 Days
                  </button>
                  <button
                    onClick={() => { setHistoryFilter('30days'); setTimeout(loadHistory, 0); }}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition ${historyFilter === '30days' ? 'bg-blue-600 text-white' : 'bg-white/5 text-gray-400 hover:text-white'}`}
                  >
                    Last 30 Days
                  </button>
                </div>
              </div>

              {loadingHistory ? (
                <div className="flex-1 flex items-center justify-center text-gray-400 text-xs">
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-2"></div>
                  <span>Loading history logs...</span>
                </div>
              ) : history.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-gray-500 text-xs">
                  No historical dispatches matching your queries.
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto space-y-3 mt-4 pr-1">
                  {history.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => selectHistoryItem(item)}
                      className={`p-3.5 rounded-2xl border transition duration-200 cursor-pointer flex flex-col justify-between ${selectedHistoryItem && selectedHistoryItem.id === item.id ? 'bg-blue-600/10 border-blue-500/40 shadow' : 'bg-white/5 border-white/5 hover:border-white/10'}`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <span className="text-[9px] uppercase font-bold text-gray-500">Dispatch #{item.id}</span>
                          <h4 className="text-xs font-bold text-white uppercase tracking-tight mt-0.5">{item.incident_type.replace('_', ' ')}</h4>
                        </div>
                        <span className="text-[10px] px-2.5 py-0.5 rounded-full font-black uppercase tracking-wider bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                          {item.status}
                        </span>
                      </div>
                      
                      <div className="text-[10px] text-gray-400 space-y-1 mt-1 border-t border-white/5 pt-2">
                        <div className="flex justify-between">
                          <span>Citizen:</span>
                          <strong className="text-white">{item.citizen_name}</strong>
                        </div>
                        <div className="flex justify-between">
                          <span>Ambulance / Driver:</span>
                          <strong className="text-white">{item.ambulance_assigned} ({item.driver_name})</strong>
                        </div>
                        <div className="flex justify-between">
                          <span>Outcome:</span>
                          <strong className="text-blue-400">{item.outcome}</strong>
                        </div>
                        <div className="flex justify-between">
                          <span>Date Assigned:</span>
                          <strong className="text-gray-400 font-mono">{new Date(item.assigned_time).toLocaleDateString()}</strong>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right side: Selected Incident Details and Timeline (7 cols) */}
            <div className="lg:col-span-7 glass-panel p-5 rounded-2xl flex flex-col h-[400px] lg:h-full overflow-hidden">
              {selectedHistoryItem ? (
                <div className="flex-1 flex flex-col justify-between overflow-hidden">
                  <div className="pb-4 border-b border-white/5 shrink-0 flex justify-between items-start">
                    <div>
                      <span className="text-[9px] uppercase font-bold text-gray-500 block">Incident Outcome Details</span>
                      <h3 className="text-base font-bold text-white uppercase tracking-tight">{selectedHistoryItem.incident_type.replace('_', ' ')}</h3>
                    </div>
                    <div className="text-right">
                      <span className="text-[9px] uppercase font-bold text-gray-500 block">Response Performance</span>
                      <span className="text-xs font-bold text-emerald-400">{selectedHistoryItem.response_time} response</span>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-5 my-4 pr-1">
                    {/* Performance metrics grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div className="bg-slate-900/50 border border-white/5 p-3 rounded-xl">
                        <span className="text-[9px] uppercase font-bold text-gray-500 block">Reported Time</span>
                        <strong className="text-xs text-white block mt-0.5">{new Date(selectedHistoryItem.reported_time).toLocaleString()}</strong>
                      </div>
                      <div className="bg-slate-900/50 border border-white/5 p-3 rounded-xl">
                        <span className="text-[9px] uppercase font-bold text-gray-500 block">Assigned Time</span>
                        <strong className="text-xs text-white block mt-0.5">{new Date(selectedHistoryItem.assigned_time).toLocaleString()}</strong>
                      </div>
                      <div className="bg-slate-900/50 border border-white/5 p-3 rounded-xl col-span-2 sm:col-span-1">
                        <span className="text-[9px] uppercase font-bold text-gray-500 block">Resolution Time</span>
                        <strong className="text-xs text-white block mt-0.5">
                          {selectedHistoryItem.resolution_time ? new Date(selectedHistoryItem.resolution_time).toLocaleString() : 'N/A'}
                        </strong>
                      </div>
                    </div>

                    {/* Outcome section */}
                    <div className="bg-blue-500/5 border border-blue-500/10 p-4.5 rounded-xl space-y-1">
                      <span className="text-[10px] uppercase font-bold text-blue-400 block tracking-wider">Patient Outcome / Medical Summary</span>
                      <p className="text-xs text-gray-200 leading-relaxed font-semibold">
                        {selectedHistoryItem.outcome || 'No outcome summary logged.'}
                      </p>
                    </div>

                    {/* Detailed timeline */}
                    <div className="space-y-4">
                      <span className="text-[10px] uppercase font-bold text-gray-500 block tracking-wider">Audit Timeline</span>
                      <div className="space-y-4 pr-1 pl-1">
                        {selectedHistoryTimeline.map((ev, i) => (
                          <div key={i} className="flex gap-3 text-xs relative">
                            {i < selectedHistoryTimeline.length - 1 && (
                              <div className="absolute left-[7px] top-[14px] bottom-[-22px] w-[2px] bg-white/5"></div>
                            )}
                            <div className="w-4 h-4 rounded-full bg-slate-900 border-2 border-blue-500 flex items-center justify-center shrink-0 mt-0.5 z-10">
                              <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div>
                            </div>
                            <div className="flex-1">
                              <div className="flex justify-between items-center">
                                <strong className="text-gray-200 capitalize">{ev.event_type.replace('_', ' ')}</strong>
                                <span className="text-[9px] text-gray-500">{new Date(ev.event_time).toLocaleTimeString()}</span>
                              </div>
                              <p className="text-gray-400 text-[11px] mt-0.5">{ev.description}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-gray-500 space-y-2">
                  <Clock size={40} className="text-gray-600" />
                  <p className="text-xs italic">Select a history dispatch item from the list to view its complete audit lifecycle trail.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'profile' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full items-stretch flex-1 overflow-y-auto max-h-[85vh] lg:max-h-full">
            {/* Left side: Profile edit form */}
            <div className="lg:col-span-7 glass-panel p-6 rounded-2xl flex flex-col justify-between">
              <div>
                <div className="mb-4 pb-2 border-b border-white/5">
                  <h3 className="text-lg font-bold text-white tracking-tight">Operator Profile Configuration</h3>
                  <p className="text-xs text-gray-400 mt-1">Configure emergency responder address, phone lines, and credentials.</p>
                </div>

                {profileMessage && (
                  <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-1.5">
                    <Check size={16} className="text-emerald-400 shrink-0" />
                    <span>{profileMessage}</span>
                  </div>
                )}

                {profileError && (
                  <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs">
                    {profileError}
                  </div>
                )}

                {profileLoading ? (
                  <div className="flex justify-center items-center py-20 text-gray-400 text-xs">
                    <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-2"></div>
                    <span>Fetching operator profile...</span>
                  </div>
                ) : (
                  <form onSubmit={handleSaveProfile} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] uppercase font-bold tracking-wider text-gray-400 mb-1.5">Facility Name</label>
                        <input
                          type="text"
                          required
                          value={profileName}
                          onChange={(e) => setProfileName(e.target.value)}
                          className="w-full px-4 py-2.5 rounded-xl glass-input text-white text-xs focus:border-blue-500 shadow-inner"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] uppercase font-bold tracking-wider text-gray-400 mb-1.5">Emergency Email</label>
                        <input
                          type="email"
                          required
                          value={profileEmail}
                          onChange={(e) => setProfileEmail(e.target.value)}
                          className="w-full px-4 py-2.5 rounded-xl glass-input text-white text-xs focus:border-blue-500 shadow-inner"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] uppercase font-bold tracking-wider text-gray-400 mb-1.5">Hotline Contact Number</label>
                        <input
                          type="tel"
                          required
                          value={profilePhone}
                          onChange={(e) => setProfilePhone(e.target.value)}
                          className="w-full px-4 py-2.5 rounded-xl glass-input text-white text-xs focus:border-blue-500 shadow-inner"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] uppercase font-bold tracking-wider text-gray-400 mb-1.5">New Password (Leave blank to keep current)</label>
                        <input
                          type="password"
                          value={profilePassword}
                          onChange={(e) => setProfilePassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full px-4 py-2.5 rounded-xl glass-input text-white text-xs focus:border-blue-500 shadow-inner"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] uppercase font-bold tracking-wider text-gray-400 mb-1.5">Full Physical Address</label>
                      <textarea
                        required
                        value={profileAddress}
                        onChange={(e) => setProfileAddress(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl glass-input text-white text-xs focus:border-blue-500 h-16 resize-none shadow-inner"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-2">
                      <div>
                        <label className="block text-[10px] uppercase font-bold tracking-wider text-gray-400 mb-1.5">Facility Latitude</label>
                        <input
                          type="number"
                          step="0.00000001"
                          required
                          value={profileLat}
                          onChange={(e) => setProfileLat(e.target.value)}
                          className="w-full px-4 py-2.5 rounded-xl glass-input text-white text-xs focus:border-blue-500 shadow-inner"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] uppercase font-bold tracking-wider text-gray-400 mb-1.5">Facility Longitude</label>
                        <input
                          type="number"
                          step="0.00000001"
                          required
                          value={profileLng}
                          onChange={(e) => setProfileLng(e.target.value)}
                          className="w-full px-4 py-2.5 rounded-xl glass-input text-white text-xs focus:border-blue-500 shadow-inner"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={profileSaving}
                      className="w-full py-3 px-4 rounded-xl text-white font-bold bg-blue-600 hover:bg-blue-500 transition shadow-lg mt-4"
                    >
                      {profileSaving ? 'Saving changes...' : 'Save Configuration'}
                    </button>
                  </form>
                )}
              </div>
            </div>

            {/* Right side: Instructions card */}
            <div className="lg:col-span-5 glass-panel p-6 rounded-2xl flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Facility Coordination</h3>
                <p className="text-xs text-gray-400 mt-1">Coordinates are critical for routing engine and green corridors optimization.</p>
              </div>

              <div className="my-6 p-4 rounded-xl bg-slate-900/50 border border-white/5 space-y-3.5 text-xs text-gray-300 shadow-inner leading-relaxed">
                <div className="flex gap-2">
                  <div className="p-1 text-blue-400 shrink-0">
                    <Navigation size={16} />
                  </div>
                  <p><strong>Routing Engine:</strong> Route geometries are calculated from these coordinates using the OSRM road graph network.</p>
                </div>
                <div className="flex gap-2">
                  <div className="p-1 text-emerald-400 shrink-0">
                    <Shield size={16} />
                  </div>
                  <p><strong>Priority Overrides:</strong> Traffic signals are automatically requested for override when ambulances enter the 500m threshold along this route.</p>
                </div>
              </div>

              <div className="text-[10px] text-gray-500 border-t border-white/5 pt-4 text-center">
                Hospital operators have write permissions to alter details to align with physical changes.
              </div>
            </div>
          </div>
        )}

      </main>

      {/* Resolve Outcome Modal */}
      {showResolveModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-panel w-full max-w-md p-6 rounded-2xl border border-white/10 glow-blue animate-scale-in">
            <h3 className="text-base font-bold text-white uppercase tracking-tight mb-2">Resolve Emergency Incident</h3>
            <p className="text-xs text-gray-400 mb-4">Please log the clinical outcome or patient transfer details before closing this incident dispatch.</p>
            
            <form onSubmit={handleResolveSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] uppercase font-bold tracking-wider text-gray-400 mb-1.5">Clinical Outcome Summary</label>
                <textarea
                  required
                  rows="3"
                  placeholder="e.g. Patient stabilized at scene, Transferred to Emergency ICU, Minor first-aid treatment completed..."
                  value={resolveOutcome}
                  onChange={(e) => setResolveOutcome(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl glass-input text-white text-xs focus:border-blue-500 resize-none shadow-inner"
                />
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowResolveModal(false)}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-bold text-gray-300 border border-white/10 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 rounded-xl text-xs font-bold text-white transition shadow shadow-emerald-900/30"
                >
                  Confirm Resolution
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
