import React, { useRef, useState, useEffect } from 'react';
import { adminAPI, incidentsAPI } from '../services/api';
import { connectSocket, disconnectSocket, socket } from '../services/socket';
import MapPanel from '../components/MapPanel';
import { Shield, List, Building, Check, X, ShieldAlert, RefreshCw, Car } from 'lucide-react';

export default function AdminDashboard({ user, onLogout }) {
  const [activeTab, setActiveTab] = useState('incidents');
  
  // Incident monitoring states
  const [incidents, setIncidents] = useState([]);
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [nearbyServices, setNearbyServices] = useState([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [routeInfo, setRouteInfo] = useState(null);

  // Registration approvals states
  const [pendingServices, setPendingServices] = useState([]);
  const [approvalsLoading, setApprovalsLoading] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState('');

  // Socket monitoring for tracking
  const [trackingVehicle, setTrackingVehicle] = useState(null);
  const [routePoints, setRoutePoints] = useState([]);
  const [corridorActive, setCorridorActive] = useState(false);
  const [signals, setSignals] = useState([]);
  const selectedIncidentRef = useRef(null);

  useEffect(() => {
    selectedIncidentRef.current = selectedIncident;
  }, [selectedIncident]);

  useEffect(() => {
    // Connect to Socket.IO
    connectSocket(user.role);

    // Initial Loads
    loadIncidents();
    loadPendingRegistrations();

    // Socket listeners
    socket.on('new_incident', (incident) => {
      console.log('Admin socket: new incident received:', incident);
      // Filter by role
      if (user.role === 'medical_admin' && !['accident', 'medical_emergency'].includes(incident.type)) return;
      if (user.role === 'fire_admin' && !['fire', 'gas_leak'].includes(incident.type)) return;
      
      setIncidents(prev => [incident, ...prev]);
    });

    socket.on('new_registration', (service) => {
      console.log('Admin socket: new registration received:', service);
      setPendingServices(prev => [...prev, service]);
    });

    socket.on('incident_status_change', (data) => {
      console.log('Admin socket: status update:', data);
      setIncidents(prev =>
        prev.map(inc => inc.id === data.incidentId ? { ...inc, status: data.status } : inc)
      );
      // Update selected incident if matches
      setSelectedIncident(prev => {
        if (prev && prev.id === data.incidentId) {
          return { ...prev, status: data.status };
        }
        return prev;
      });
    });

    // Tracking simulations listener
    socket.on('vehicle_tracking_update', (data) => {
      console.log('Admin socket: vehicle tracking:', data);
      setTrackingVehicle({
        id: data.vehicleId,
        latitude: parseFloat(data.latitude),
        longitude: parseFloat(data.longitude),
        type: data.vehicleId.startsWith('AMB') ? 'ambulance' : 'fire_engine',
        status: data.status,
        progress: data.progress
      });
    });

    socket.on('vehicle_status_change', (data) => {
      console.log('Admin socket: vehicle status change:', data);
      setTrackingVehicle(prev => {
        if (prev && prev.id === data.vehicleId) {
          return { ...prev, status: data.status };
        }
        return prev;
      });
      // Refresh nearby services to show updated vehicle availability count
      if (selectedIncidentRef.current) {
        loadNearbyServices(selectedIncidentRef.current);
      }
    });

    socket.on('green_corridor_update', (data) => {
      console.log('Admin socket: corridor update:', data);
      if (user.role === 'medical_admin' && !['accident', 'medical_emergency'].includes(data.incidentType)) return;
      if (user.role === 'fire_admin' && !['fire', 'gas_leak'].includes(data.incidentType)) return;

      if (data.status === 'active') {
        setCorridorActive(true);
        setSignals(data.signals);
        setRoutePoints(data.route);
      } else {
        setCorridorActive(false);
        setSignals([]);
        setRoutePoints([]);
        setTrackingVehicle(null);
      }
    });

    return () => {
      socket.off('new_incident');
      socket.off('new_registration');
      socket.off('incident_status_change');
      socket.off('vehicle_tracking_update');
      socket.off('vehicle_status_change');
      socket.off('green_corridor_update');
      disconnectSocket();
    };
  }, [user.role]);

  const loadIncidents = async () => {
    try {
      const response = await incidentsAPI.getIncidents();
      setIncidents(response.data);
    } catch (err) {
      console.error('Failed to load incidents', err);
    }
  };

  const loadPendingRegistrations = async () => {
    setApprovalsLoading(true);
    try {
      const response = await adminAPI.getPendingServices();
      setPendingServices(response.data);
    } catch (err) {
      console.error('Failed to load pending registrations', err);
    } finally {
      setApprovalsLoading(false);
    }
  };

  const handleSelectIncident = async (incident) => {
    setSelectedIncident(incident);
    setRouteInfo(null);
    setNearbyServices([]);
    
    // Check if tracking simulations are running
    setTrackingVehicle(null);
    setRoutePoints([]);
    setCorridorActive(false);
    setSignals([]);

    await loadNearbyServices(incident);
  };

  const loadNearbyServices = async (incident) => {
    setNearbyLoading(true);
    try {
      const response = await incidentsAPI.getNearbyServices(incident.id);
      setNearbyServices(response.data);

      // Check route to the recommended service
      const recommended = response.data.find(s => s.isRecommended) || response.data[0];
      if (recommended) {
        const pathResponse = await incidentsAPI.getIncidentDetails(incident.id); // Fetch updated dispatch details if any
        if (pathResponse.data.dispatch) {
          // If already dispatched/alerted, display existing route
          const dispatch = pathResponse.data.dispatch;
          setRouteInfo({
            distance: dispatch.distance || 0,
            normalEta: dispatch.normal_eta,
            optimizedEta: dispatch.optimized_eta,
            timeSaved: dispatch.normal_eta - dispatch.optimized_eta
          });
          setRoutePoints(Array.isArray(dispatch.route_geometry) ? dispatch.route_geometry : []);
          setCorridorActive(Boolean(dispatch.corridor_active));
          setSignals(dispatch.signals || []);
        } else {
          // Calculate temporary route for visualization
          const routingCheck = await incidentsAPI.checkRoute({
            startLat: recommended.latitude,
            startLng: recommended.longitude,
            endLat: incident.latitude,
            endLng: incident.longitude
          });
          setRouteInfo({
            distance: routingCheck.data.distance,
            normalEta: routingCheck.data.normalEta,
            optimizedEta: routingCheck.data.optimizedEta,
            timeSaved: routingCheck.data.timeSaved
          });
          setRoutePoints(routingCheck.data.points);
        }
      }
    } catch (err) {
      console.error('Failed to get nearby services', err);
    } finally {
      setNearbyLoading(false);
    }
  };

  const handleAlertService = async (serviceId) => {
    if (!selectedIncident) return;
    try {
      await incidentsAPI.alertService(selectedIncident.id, serviceId);
      setFeedbackMsg('Emergency service has been successfully alerted!');
      setSelectedIncident(prev => ({ ...prev, status: 'service_alerted' }));
      // Reload incidents
      loadIncidents();
      // Reload nearby services
      loadNearbyServices(selectedIncident);
      setTimeout(() => setFeedbackMsg(''), 4000);
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || 'Failed to alert service.');
    }
  };

  const handleApproveService = async (serviceId) => {
    try {
      await adminAPI.approveService(serviceId);
      setPendingServices(prev => prev.filter(s => s.id !== serviceId));
      setFeedbackMsg('Registration approved successfully.');
      setTimeout(() => setFeedbackMsg(''), 3000);
    } catch (err) {
      console.error(err);
    }
  };

  const handleRejectService = async (serviceId) => {
    try {
      await adminAPI.rejectService(serviceId);
      setPendingServices(prev => prev.filter(s => s.id !== serviceId));
      setFeedbackMsg('Registration rejected.');
      setTimeout(() => setFeedbackMsg(''), 3000);
    } catch (err) {
      console.error(err);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'reported': return 'text-gray-400 bg-gray-500/10 border-gray-500/20';
      case 'verified': return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
      case 'service_alerted': return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
      case 'vehicle_dispatched': return 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20';
      case 'en_route': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20 animate-pulse';
      case 'at_scene': return 'text-purple-400 bg-purple-500/10 border-purple-500/20';
      case 'resolved': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
      default: return 'text-gray-400 bg-gray-500/10';
    }
  };

  return (
    <div className="min-h-screen bg-[#070b13] flex flex-col">
      {/* Navbar */}
      <nav className="glass-panel border-b border-white/5 py-4 px-6 flex justify-between items-center shadow-lg relative z-20">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg border ${user.role === 'fire_admin' ? 'bg-red-600/10 text-red-400 border-red-500/20' : 'bg-blue-600/10 text-blue-400 border-blue-500/20'}`}>
            <Shield size={20} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white capitalize leading-tight">{user.role.replace('_', ' ')} Console</h1>
            <p className="text-xs text-gray-400">Integrated Emergency Response and Corridor System</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex bg-white/5 p-1 rounded-xl border border-white/10">
            <button
              onClick={() => setActiveTab('incidents')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition ${activeTab === 'incidents' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400 hover:text-white'}`}
            >
              Emergency Feeds
            </button>
            <button
              onClick={() => {
                setActiveTab('approvals');
                loadPendingRegistrations();
              }}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition ${activeTab === 'approvals' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400 hover:text-white'}`}
            >
              Service Verifications ({pendingServices.length})
            </button>
          </div>

          <button onClick={onLogout} className="px-4 py-2 bg-red-600/10 border border-red-500/20 hover:bg-red-600 hover:text-white text-xs font-semibold rounded-xl text-red-400 transition">
            Sign Out
          </button>
        </div>
      </nav>

      {/* Main body */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto p-6 overflow-hidden flex flex-col">
        
        {feedbackMsg && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-semibold">
            {feedbackMsg}
          </div>
        )}

        {activeTab === 'incidents' ? (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch flex-1">
            
            {/* Widget 1: Live Incident Feed (3 cols) */}
            <div className="xl:col-span-3 glass-panel p-5 rounded-2xl flex flex-col h-[650px]">
              <div className="flex justify-between items-center mb-4 pb-2 border-b border-white/5">
                <h3 className="text-sm font-bold uppercase tracking-wider text-gray-300 flex items-center gap-1.5">
                  <List size={16} /> Live Incident Feed
                </h3>
                <button onClick={loadIncidents} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-bold">
                  <RefreshCw size={12} /> Sync
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {incidents.length === 0 ? (
                  <p className="text-center text-xs text-gray-500 py-20">No active incidents found.</p>
                ) : (
                  incidents.map((incident) => (
                    <div
                      key={incident.id}
                      onClick={() => handleSelectIncident(incident)}
                      className={`p-3.5 rounded-xl border transition cursor-pointer text-left ${selectedIncident && selectedIncident.id === incident.id ? 'bg-blue-600/10 border-blue-500/40 shadow-inner' : 'bg-white/5 border-white/5 hover:border-white/10'}`}
                    >
                      <div className="flex justify-between items-start">
                        <span className="text-[10px] text-gray-400 font-semibold uppercase">ID: #{incident.id}</span>
                        <span className={`px-1.5 py-0.5 border rounded-full text-[9px] font-bold uppercase leading-none ${getStatusColor(incident.status)}`}>
                          {incident.status.replace('_', ' ')}
                        </span>
                      </div>
                      <h4 className="text-xs font-bold text-white uppercase mt-1.5">{incident.type.replace('_', ' ')}</h4>
                      <span className="text-[10px] text-gray-500 block mt-2">{new Date(incident.created_at).toLocaleTimeString()}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Widget 3: Live Map Panel (5 cols) */}
            <div className="xl:col-span-6 flex flex-col h-[650px] space-y-4">
              <div className="flex-1">
                <MapPanel
                  incidents={incidents}
                  activeIncident={selectedIncident}
                  onSelectIncident={handleSelectIncident}
                  nearbyServices={nearbyServices}
                  routePoints={routePoints}
                  corridorActive={corridorActive}
                  signals={signals}
                  trackingVehicle={trackingVehicle}
                />
              </div>

              {/* Route calculations display overlay if route is available */}
              {routeInfo && (
                <div className="glass-panel p-4 rounded-2xl grid grid-cols-4 gap-4 border border-emerald-500/20 shadow-md">
                  <div className="text-center">
                    <span className="text-[10px] uppercase text-gray-400 block font-semibold">Route Distance</span>
                    <strong className="text-base text-white font-black">{routeInfo.distance} km</strong>
                  </div>
                  <div className="text-center border-l border-white/5">
                    <span className="text-[10px] uppercase text-gray-400 block font-semibold">Normal ETA</span>
                    <strong className="text-base text-amber-400 font-black">{routeInfo.normalEta} mins</strong>
                  </div>
                  <div className="text-center border-l border-white/5">
                    <span className="text-[10px] uppercase text-emerald-400 block font-semibold flex items-center justify-center gap-1">
                      <Car size={12} className="animate-pulse" /> Optimized ETA
                    </span>
                    <strong className="text-base text-emerald-400 font-black">{routeInfo.optimizedEta} mins</strong>
                  </div>
                  <div className="text-center border-l border-white/5">
                    <span className="text-[10px] uppercase text-emerald-400 block font-semibold">Time Saved</span>
                    <strong className="text-base text-emerald-400 font-black">+{routeInfo.timeSaved} mins</strong>
                  </div>
                </div>
              )}
            </div>

            {/* Right panels: Incident Details (Widget 2) & Nearby Services (Widget 4) (3 cols) */}
            <div className="xl:col-span-3 flex flex-col h-[650px] space-y-4">
              
              {/* Widget 2: Incident Details */}
              <div className="glass-panel p-4 rounded-2xl flex-1 flex flex-col overflow-hidden">
                <h3 className="text-sm font-bold uppercase tracking-wider text-gray-300 mb-3 flex items-center gap-1.5 pb-2 border-b border-white/5">
                  <ShieldAlert size={16} /> Incident Details
                </h3>
                {selectedIncident ? (
                  <div className="text-xs text-gray-400 space-y-3 flex-1 overflow-y-auto pr-1">
                    <div className="flex justify-between items-center text-[10px] uppercase">
                      <span>Source: <strong className="text-white">{selectedIncident.source}</strong></span>
                      <span>Reporter: <strong className="text-white">{selectedIncident.reporter_id ? 'Citizen' : 'IoT Sensor'}</strong></span>
                    </div>

                    <div className="bg-[#0b0e17] p-2 rounded-lg border border-white/5">
                      <span className="text-[9px] uppercase font-bold text-gray-500">Description</span>
                      <p className="text-white text-xs mt-0.5">{selectedIncident.description || 'No description provided.'}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[10px] text-gray-500">
                      <div>
                        <span>Latitude:</span>
                        <strong className="text-white block mt-0.5">{selectedIncident.latitude}</strong>
                      </div>
                      <div>
                        <span>Longitude:</span>
                        <strong className="text-white block mt-0.5">{selectedIncident.longitude}</strong>
                      </div>
                    </div>

                    {selectedIncident.images && selectedIncident.images.length > 0 && (
                      <div>
                        <span className="text-[10px] uppercase font-bold text-gray-500 block mb-1.5">Evidence Images</span>
                        <div className="grid grid-cols-3 gap-2">
                          {selectedIncident.images.map((url, i) => (
                            <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                              <img
                                src={url}
                                alt="incident evidence"
                                className="w-full h-14 object-cover rounded border border-white/10 bg-slate-900"
                                onError={(e) => {
                                  e.target.onerror = null;
                                  e.target.src = 'https://placehold.co/100?text=MinIO+Image';
                                }}
                              />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-center text-xs text-gray-500 py-10 my-auto">Select an incident from the feed to view details and discovery recommendations.</p>
                )}
              </div>

              {/* Widget 4: Nearby Services Panel */}
              <div className="glass-panel p-4 rounded-2xl h-[300px] flex flex-col overflow-hidden">
                <h3 className="text-sm font-bold uppercase tracking-wider text-gray-300 mb-3 flex items-center gap-1.5 pb-2 border-b border-white/5">
                  <Building size={16} /> Nearby Services Discovery
                </h3>

                <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
                  {!selectedIncident ? (
                    <p className="text-center text-xs text-gray-500 py-12 my-auto">No incident selected.</p>
                  ) : nearbyLoading ? (
                    <p className="text-center text-xs text-gray-500 py-12 animate-pulse">Running Haversine distance calculations...</p>
                  ) : nearbyServices.length === 0 ? (
                    <p className="text-center text-xs text-red-400 py-12">No active service centers available for this incident type.</p>
                  ) : (
                    nearbyServices.map((service) => (
                      <div
                        key={service.id}
                        className={`p-3 rounded-xl border flex justify-between items-center bg-white/5 ${service.isRecommended ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-white/5'}`}
                      >
                        <div className="text-left text-xs">
                          <h4 className="font-bold text-white flex items-center gap-1">
                            {service.name}
                            {service.isRecommended && (
                              <span className="text-[9px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-1 rounded font-bold uppercase">
                                Recommended
                              </span>
                            )}
                          </h4>
                          <p className="text-[10px] text-gray-400 mt-0.5">Distance: <strong>{service.distance} km</strong> | Avail. Vehicles: <strong className={service.availableVehicles > 0 ? 'text-emerald-400' : 'text-red-400'}>{service.availableVehicles}</strong></p>
                        </div>

                        {selectedIncident.status === 'reported' ? (
                          <button
                            onClick={() => handleAlertService(service.id)}
                            className={`px-3 py-1.5 text-xs font-bold rounded-lg text-white transition ${service.availableVehicles > 0 ? 'bg-blue-600 hover:bg-blue-500' : 'bg-gray-700 cursor-not-allowed opacity-50'}`}
                            disabled={service.availableVehicles === 0}
                          >
                            Alert
                          </button>
                        ) : (
                          <span className="text-[10px] font-bold text-gray-500">Alerted</span>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>

          </div>
        ) : (
          /* Verification approvals tab */
          <div className="glass-panel p-6 rounded-2xl min-h-[500px]">
            <h3 className="text-lg font-bold text-white mb-2">Pending Service registrations</h3>
            <p className="text-xs text-gray-400 mb-6">Review hospital and fire station registrations and enable their logins.</p>

            {approvalsLoading ? (
              <div className="py-20 text-center text-gray-400">Loading registrations...</div>
            ) : pendingServices.length === 0 ? (
              <div className="py-20 text-center text-gray-500 text-sm">
                No pending service registrations requiring verification.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {pendingServices.map((service) => (
                  <div key={service.id} className="bg-white/5 border border-white/5 rounded-2xl p-5 hover:border-white/10 transition flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start mb-3">
                        <span className="text-[10px] uppercase font-bold bg-blue-500/10 border border-blue-500/20 text-blue-400 px-2 py-0.5 rounded">
                          {service.type === 'hospital' ? 'Hospital' : 'Fire Station'}
                        </span>
                        <span className="text-xs text-amber-400 font-bold uppercase">Pending Verification</span>
                      </div>
                      <h4 className="text-base font-bold text-white mb-2">{service.name}</h4>
                      
                      <div className="text-xs text-gray-400 space-y-1.5 mb-4">
                        <p>Address: <strong className="text-white">{service.address}</strong></p>
                        <p>Contact Phone: <strong className="text-white">{service.phone}</strong></p>
                        <p>Coordinates: <strong className="text-white">Lat: {service.latitude}, Lng: {service.longitude}</strong></p>
                        <p>Registered Vehicles: <strong className="text-white">{service.vehicles?.map(v => v.id).join(', ') || 'None'}</strong></p>
                      </div>
                    </div>

                    <div className="flex gap-3 pt-3 border-t border-white/5">
                      <button
                        onClick={() => handleApproveService(service.id)}
                        className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 transition text-xs font-bold text-white flex items-center justify-center gap-1"
                      >
                        <Check size={14} /> Approve
                      </button>
                      <button
                        onClick={() => handleRejectService(service.id)}
                        className="flex-1 py-2 rounded-xl bg-red-600/10 border border-red-500/20 hover:bg-red-600 hover:text-white transition text-xs font-bold text-red-400 flex items-center justify-center gap-1"
                      >
                        <X size={14} /> Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
