import React, { useRef, useState, useEffect } from 'react';
import { adminAPI, incidentsAPI } from '../services/api';
import { connectSocket, disconnectSocket, socket } from '../services/socket';
import MapPanel from '../components/MapPanel';
import DashboardShell from '../components/DashboardShell';
import { Shield, List, Building, Check, X, ShieldAlert, RefreshCw, Car, Navigation, Settings, Phone } from 'lucide-react';

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
  const [medicalCoordinatorPhone, setMedicalCoordinatorPhone] = useState('');
  const [fireCoordinatorPhone, setFireCoordinatorPhone] = useState('');
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsSaving, setContactsSaving] = useState(false);

  // Location correction form states
  const [showCorrectionForm, setShowCorrectionForm] = useState(false);
  const [editLatitude, setEditLatitude] = useState('');
  const [editLongitude, setEditLongitude] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');
  const [correctingLocation, setCorrectingLocation] = useState(false);
  const [auditTrail, setAuditTrail] = useState([]);

  // Socket monitoring for tracking
  const [trackingVehicle, setTrackingVehicle] = useState(null);
  const [routePoints, setRoutePoints] = useState([]);
  const [corridorActive, setCorridorActive] = useState(false);
  const [signals, setSignals] = useState([]);
  const [activeDispatch, setActiveDispatch] = useState(null);
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
    loadEmergencyContacts();

    // Socket listeners
    socket.on('new_incident', (incident) => {
      console.log('Admin socket: new incident received:', incident);
      // Filter by role
      if (user.role === 'medical_admin' && !['accident', 'medical_emergency', 'other'].includes(incident.type)) return;
      if (user.role === 'fire_admin' && !['fire', 'gas_leak', 'building_collapse'].includes(incident.type)) return;
      
      setIncidents(prev => [incident, ...prev]);
    });

    socket.on('new_registration', (service) => {
      console.log('Admin socket: new registration received:', service);
      setPendingServices(prev => [...prev, service]);
    });

    socket.on('incident_status_change', (data) => {
      console.log('Admin socket: status update:', data);
      setIncidents(prev =>
        prev.map(inc => inc.id === data.incidentId ? { ...inc, status: data.status, latitude: data.latitude || inc.latitude, longitude: data.longitude || inc.longitude } : inc)
      );
      // Update selected incident if matches
      setSelectedIncident(prev => {
        if (prev && prev.id === data.incidentId) {
          return { ...prev, status: data.status, latitude: data.latitude || prev.latitude, longitude: data.longitude || prev.longitude };
        }
        return prev;
      });
    });

    // Tracking simulations listener
    socket.on('vehicle_tracking_update', (data) => {
      console.log('Admin socket: vehicle tracking:', data);
      setActiveDispatch(currDispatch => {
        if (!currDispatch || String(currDispatch.id) !== String(data.dispatchId)) {
          return currDispatch;
        }
        setTrackingVehicle({
          id: data.vehicleId,
          latitude: parseFloat(data.latitude),
          longitude: parseFloat(data.longitude),
          type: data.vehicleId.startsWith('AMB') ? 'ambulance' : 'fire_engine',
          status: data.status,
          progress: data.progress
        });
        return currDispatch;
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
      if (user.role === 'medical_admin' && !['accident', 'medical_emergency', 'other'].includes(data.incidentType)) return;
      if (user.role === 'fire_admin' && !['fire', 'gas_leak', 'building_collapse'].includes(data.incidentType)) return;

      setActiveDispatch(currDispatch => {
        if (!currDispatch || String(currDispatch.id) !== String(data.dispatchId)) {
          return currDispatch;
        }
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
        return currDispatch;
      });
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

  const loadEmergencyContacts = async () => {
    setContactsLoading(true);
    try {
      const response = await adminAPI.getEmergencyContacts();
      setMedicalCoordinatorPhone(response.data.medicalPhone || '');
      setFireCoordinatorPhone(response.data.firePhone || '');
    } catch (err) {
      console.error('Failed to load emergency coordinator contacts', err);
    } finally {
      setContactsLoading(false);
    }
  };

  const loadAuditTrail = async (incidentId) => {
    try {
      const res = await incidentsAPI.getAuditTrail(incidentId);
      setAuditTrail(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSelectIncident = async (incident) => {
    setSelectedIncident(incident);
    setEditLatitude(incident.latitude);
    setEditLongitude(incident.longitude);
    setCorrectionReason('');
    setShowCorrectionForm(false);
    setRouteInfo(null);
    setNearbyServices([]);
    
    // Check if tracking simulations are running
    setTrackingVehicle(null);
    setRoutePoints([]);
    setCorridorActive(false);
    setSignals([]);

    await loadNearbyServices(incident);
    await loadAuditTrail(incident.id);
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
          setActiveDispatch(dispatch);
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
          setActiveDispatch(null);
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
      loadIncidents();
      loadNearbyServices(selectedIncident);
      setTimeout(() => setFeedbackMsg(''), 4000);
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || 'Failed to alert service.');
    }
  };

  const handleLocationCorrect = async (e) => {
    e.preventDefault();
    if (!selectedIncident) return;
    setCorrectingLocation(true);
    try {
      await incidentsAPI.correctLocation(selectedIncident.id, {
        latitude: parseFloat(editLatitude),
        longitude: parseFloat(editLongitude),
        reason: correctionReason
      });
      setFeedbackMsg('Incident coordinates corrected successfully.');
      
      const updatedIncident = { 
        ...selectedIncident, 
        latitude: parseFloat(editLatitude), 
        longitude: parseFloat(editLongitude) 
      };
      setSelectedIncident(updatedIncident);
      loadIncidents();
      loadNearbyServices(updatedIncident);
      loadAuditTrail(selectedIncident.id);
      setShowCorrectionForm(false);
      setCorrectionReason('');
      setTimeout(() => setFeedbackMsg(''), 4000);
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || 'Failed to correct coordinates.');
    } finally {
      setCorrectingLocation(false);
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

  const handleSaveEmergencyContacts = async (e) => {
    e.preventDefault();
    setContactsSaving(true);
    try {
      await adminAPI.updateEmergencyContacts({
        medicalPhone: medicalCoordinatorPhone,
        firePhone: fireCoordinatorPhone
      });
      setFeedbackMsg('Emergency coordinator contact numbers updated.');
      setTimeout(() => setFeedbackMsg(''), 3000);
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || 'Failed to update emergency contact numbers.');
    } finally {
      setContactsSaving(false);
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

  const iconClassName = user.role === 'fire_admin'
    ? 'bg-red-600/10 text-red-400 border-red-500/20'
    : 'bg-blue-600/10 text-blue-400 border-blue-500/20';

  const dashboardTitle = `${user.role.replace('_', ' ').split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')} Console`;

  const tabs = [
    {
      id: 'incidents',
      label: 'Emergency Feeds',
      onClick: () => setActiveTab('incidents'),
    },
    {
      id: 'approvals',
      label: 'Service Verifications',
      badge: pendingServices.length,
      onClick: () => {
        setActiveTab('approvals');
        loadPendingRegistrations();
      },
    },
    {
      id: 'contacts',
      label: 'Emergency Contacts',
      icon: Settings,
      onClick: () => {
        setActiveTab('contacts');
        loadEmergencyContacts();
      },
    },
  ];

  return (
    <DashboardShell
      icon={Shield}
      iconClassName={iconClassName}
      title={dashboardTitle}
      subtitle="Integrated Emergency Response and Corridor System"
      tabs={tabs}
      activeTab={activeTab}
      onLogout={onLogout}
    >
      {feedbackMsg && (
        <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-semibold shadow-inner">
          {feedbackMsg}
        </div>
      )}

      {activeTab === 'incidents' ? (
        <div className="content-grid">
          {/* Widget 1: Live Incident Feed (3 cols) */}
          <div className="lg:col-span-3 sidebar-panel">
              <div className="flex justify-between items-center mb-4 pb-2 border-b border-white/5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-300 flex items-center gap-1.5">
                  <List size={16} className="text-blue-400" /> Live Incident Feed
                </h3>
                <button onClick={loadIncidents} className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1 font-bold transition">
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
                      className={`p-3.5 rounded-xl border transition-all duration-200 cursor-pointer text-left ${selectedIncident && selectedIncident.id === incident.id ? 'bg-blue-600/10 border-blue-500/40 shadow-inner' : 'bg-white/5 border-white/5 hover:border-white/10 hover:bg-white/[0.02]'}`}
                    >
                      <div className="flex justify-between items-start">
                        <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">ID: #{incident.id}</span>
                        <span className={`px-1.5 py-0.5 border rounded-full text-[8px] font-black uppercase leading-none tracking-wider ${getStatusColor(incident.status)}`}>
                          {incident.status.replace('_', ' ')}
                        </span>
                      </div>
                      <h4 className="text-xs font-bold text-white uppercase mt-1.5">{incident.type.replace('_', ' ')}</h4>
                      <span className="text-[9px] text-gray-500 block mt-2">{new Date(incident.created_at).toLocaleTimeString()}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

          {/* Widget 3: Live Map Panel (6 cols) */}
          <div className="lg:col-span-6 map-panel-wrap space-y-4">
            <div className="flex-1 min-h-0 rounded-xl overflow-hidden relative">
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
              <div className="panel p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 border-emerald-500/20 shadow-lg shrink-0">
                  <div className="text-center">
                    <span className="text-[9px] uppercase text-gray-400 block font-bold tracking-wider">Route Distance</span>
                    <strong className="text-base text-white font-black">{routeInfo.distance} km</strong>
                  </div>
                  <div className="text-center border-l border-white/5">
                    <span className="text-[9px] uppercase text-gray-400 block font-bold tracking-wider">Normal ETA</span>
                    <strong className="text-base text-amber-400 font-black">{routeInfo.normalEta} mins</strong>
                  </div>
                  <div className="text-center border-l border-white/5">
                    <span className="text-[9px] uppercase text-emerald-400 block font-bold tracking-wider flex items-center justify-center gap-1">
                      <Car size={12} className="animate-pulse" /> Optimized ETA
                    </span>
                    <strong className="text-base text-emerald-400 font-black">{routeInfo.optimizedEta} mins</strong>
                  </div>
                  <div className="text-center border-l border-white/5">
                    <span className="text-[9px] uppercase text-emerald-400 block font-bold tracking-wider">Time Saved</span>
                    <strong className="text-base text-emerald-400 font-black">+{routeInfo.timeSaved} mins</strong>
                  </div>
                </div>
              )}
            </div>

          {/* Right panels: Incident Details (Widget 2) & Nearby Services (Widget 4) (3 cols) */}
          <div className="lg:col-span-3 flex flex-col gap-4 min-h-0 lg:h-full overflow-hidden">
            {/* Widget 2: Incident Details */}
            <div className="sidebar-panel flex-1 overflow-y-auto min-h-[220px]">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-300 mb-3 flex items-center gap-1.5 pb-2 border-b border-white/5">
                  <ShieldAlert size={16} className="text-blue-400" /> Incident Details
                </h3>
                {selectedIncident ? (
                  <div className="text-xs text-gray-400 space-y-3 flex-1">
                    <div className="flex justify-between items-center text-[9px] uppercase font-bold tracking-wider">
                      <span>Source: <strong className="text-white">{selectedIncident.source}</strong></span>
                      <span>Reporter: <strong className="text-white">{selectedIncident.reporter_id ? 'Citizen' : 'IoT Sensor'}</strong></span>
                    </div>

                    <div className="bg-[#0b0e17] p-2.5 rounded-xl border border-white/5">
                      <span className="text-[9px] uppercase font-bold text-gray-500 tracking-wider">Description</span>
                      <p className="text-white text-xs mt-0.5">{selectedIncident.description || 'No description provided.'}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[10px] text-gray-500">
                      <div>
                        <span>Latitude:</span>
                        <strong className="text-white block mt-0.5 font-bold">{selectedIncident.latitude}</strong>
                      </div>
                      <div>
                        <span>Longitude:</span>
                        <strong className="text-white block mt-0.5 font-bold">{selectedIncident.longitude}</strong>
                      </div>
                    </div>

                    {/* Coordinate Correction Form */}
                    <div className="border-t border-white/5 pt-3">
                      {!showCorrectionForm ? (
                        <button
                          onClick={() => setShowCorrectionForm(true)}
                          className="w-full py-2 bg-white/5 hover:bg-white/10 rounded-xl text-[10px] font-bold text-blue-400 border border-blue-500/20 transition flex items-center justify-center gap-1.5"
                        >
                          <Navigation size={12} /> Correct Coordinates
                        </button>
                      ) : (
                        <form onSubmit={handleLocationCorrect} className="space-y-3 bg-[#0d1323]/50 p-3 rounded-xl border border-white/5">
                          <div className="flex justify-between items-center">
                            <span className="text-[9px] uppercase font-bold text-amber-400">CORRECT LOCATION</span>
                            <button
                              type="button"
                              onClick={() => setShowCorrectionForm(false)}
                              className="text-[9px] text-gray-500 hover:text-white"
                            >
                              Cancel
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[8px] text-gray-500 mb-1 uppercase font-bold">New Lat</label>
                              <input
                                type="number"
                                step="0.000001"
                                required
                                value={editLatitude}
                                onChange={(e) => setEditLatitude(e.target.value)}
                                className="w-full px-2 py-1 rounded-lg glass-input text-white text-[10px]"
                              />
                            </div>
                            <div>
                              <label className="block text-[8px] text-gray-500 mb-1 uppercase font-bold">New Lng</label>
                              <input
                                type="number"
                                step="0.000001"
                                required
                                value={editLongitude}
                                onChange={(e) => setEditLongitude(e.target.value)}
                                className="w-full px-2 py-1 rounded-lg glass-input text-white text-[10px]"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-[8px] text-gray-500 mb-1 uppercase font-bold">Reason for change</label>
                            <textarea
                              required
                              placeholder="e.g. GPS correction..."
                              value={correctionReason}
                              onChange={(e) => setCorrectionReason(e.target.value)}
                              className="w-full px-2 py-1 rounded-lg glass-input text-white text-[10px] h-10 resize-none"
                            />
                          </div>
                          <button
                            type="submit"
                            disabled={correctingLocation}
                            className="w-full py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-[10px] font-bold transition shadow"
                          >
                            {correctingLocation ? 'Saving...' : 'Save Correction'}
                          </button>
                        </form>
                      )}
                    </div>

                    {/* Coordinate correction audit trail logs */}
                    {auditTrail && auditTrail.length > 0 && (
                      <div className="border-t border-white/5 pt-3">
                        <span className="text-[9px] uppercase font-bold text-gray-500 block mb-2 tracking-wider">Location Audit Trail</span>
                        <div className="space-y-2 max-h-32 overflow-y-auto pr-1">
                          {auditTrail.map((log) => (
                            <div key={log.id} className="p-2 rounded bg-white/5 text-[9px] border border-white/5 space-y-0.5 text-left">
                              <div className="flex justify-between text-[8px] text-gray-500">
                                <span className="truncate max-w-[120px]">{log.editor_email}</span>
                                <span>{new Date(log.edited_time).toLocaleDateString()}</span>
                              </div>
                              <p className="text-gray-300">Moved: ({parseFloat(log.original_latitude).toFixed(4)}, {parseFloat(log.original_longitude).toFixed(4)}) → ({parseFloat(log.updated_latitude).toFixed(4)}, {parseFloat(log.updated_longitude).toFixed(4)})</p>
                              <p className="text-amber-400 italic">"Reason: {log.reason_for_change}"</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedIncident.images && selectedIncident.images.length > 0 && (
                      <div className="border-t border-white/5 pt-3">
                        <span className="text-[9px] uppercase font-bold text-gray-500 block mb-1.5 tracking-wider">Evidence Images</span>
                        <div className="grid grid-cols-3 gap-2">
                          {selectedIncident.images.map((url, i) => (
                            <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                              <img
                                src={url}
                                alt="incident evidence"
                                className="w-full h-12 object-cover rounded border border-white/10 bg-slate-900 shadow-md hover:border-blue-500/30 transition duration-200"
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
                  <p className="text-center text-xs text-gray-500 py-10 my-auto">Select an incident from the feed to view details and service recommendations.</p>
                )}
              </div>

            {/* Widget 4: Nearby Services Panel */}
            <div className="sidebar-panel shrink-0">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-300 mb-3 flex items-center gap-1.5 pb-2 border-b border-white/5">
                  <Building size={16} className="text-blue-400" /> Nearby Services Discovery
                </h3>

                <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
                  {!selectedIncident ? (
                    <p className="text-center text-xs text-gray-500 py-12 my-auto">No incident selected.</p>
                  ) : nearbyLoading ? (
                    <p className="text-center text-xs text-gray-500 py-12 animate-pulse">Running Haversine calculations...</p>
                  ) : nearbyServices.length === 0 ? (
                    <p className="text-center text-xs text-red-400 py-12">No active service centers available for this incident type.</p>
                  ) : (
                    nearbyServices.map((service) => (
                      <div
                        key={service.id}
                        className={`p-3 rounded-xl border flex justify-between items-center bg-white/5 transition duration-200 ${service.isRecommended ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-white/5 hover:border-white/10'}`}
                      >
                        <div className="text-left text-xs">
                          <h4 className="font-bold text-white flex items-center gap-1">
                            {service.name}
                            {service.isRecommended && (
                              <span className="text-[8px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-1 rounded font-bold uppercase tracking-wider">
                                Recommended
                              </span>
                            )}
                          </h4>
                          <p className="text-[10px] text-gray-400 mt-0.5">Dist: <strong>{service.distance} km</strong> | Avail: <strong className={service.availableVehicles > 0 ? 'text-emerald-400' : 'text-red-400'}>{service.availableVehicles}</strong></p>
                        </div>

                        {selectedIncident.status === 'reported' ? (
                          <button
                            onClick={() => handleAlertService(service.id)}
                            className={`px-3 py-1.5 text-xs font-bold rounded-lg text-white transition ${service.availableVehicles > 0 ? 'bg-blue-600 hover:bg-blue-500 active:scale-95 shadow-md shadow-blue-900/20' : 'bg-gray-700 cursor-not-allowed opacity-50'}`}
                            disabled={service.availableVehicles === 0}
                          >
                            Alert
                          </button>
                        ) : (
                          <span className="text-[10px] font-bold text-gray-500 bg-white/5 border border-white/5 px-2 py-1 rounded">Alerted</span>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>

          </div>
        ) : activeTab === 'approvals' ? (
          /* Verification approvals tab */
          <div className="panel p-6 flex-1 flex flex-col overflow-hidden min-h-0">
            <h3 className="text-lg font-bold text-white tracking-tight">Pending Service Registrations</h3>
            <p className="text-xs text-gray-400 mb-6 mt-1">Review hospital and fire station registrations and enable their logins.</p>

            {approvalsLoading ? (
              <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
                <div className="flex flex-col items-center gap-2">
                  <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                  <span>Loading registrations...</span>
                </div>
              </div>
            ) : pendingServices.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
                No pending service registrations requiring verification.
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto pr-1">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-4">
                  {pendingServices.map((service) => (
                    <div key={service.id} className="bg-white/5 border border-white/5 rounded-2xl p-5 hover:border-white/10 transition-all duration-300 hover:shadow-lg flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-start mb-3">
                          <span className="text-[9px] uppercase font-bold bg-blue-500/10 border border-blue-500/20 text-blue-400 px-2 py-0.5 rounded tracking-wider">
                            {service.type === 'hospital' ? 'Hospital' : 'Fire Station'}
                          </span>
                          <span className="text-xs text-amber-400 font-bold uppercase tracking-wider">Pending Verification</span>
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
                          className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 transition text-xs font-bold text-white flex items-center justify-center gap-1 shadow-md active:scale-95"
                        >
                          <Check size={14} /> Approve
                        </button>
                        <button
                          onClick={() => handleRejectService(service.id)}
                          className="flex-1 py-2 rounded-xl bg-red-600/10 border border-red-500/20 hover:bg-red-600 hover:text-white transition text-xs font-bold text-red-400 flex items-center justify-center gap-1 shadow-md active:scale-95"
                        >
                          <X size={14} /> Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="panel p-6 flex-1 flex flex-col overflow-hidden min-h-0">
            <div className="mb-6 pb-4 border-b border-white/5">
              <h3 className="text-lg font-bold text-white tracking-tight">Emergency Coordinator Contacts</h3>
              <p className="text-xs text-gray-400 mt-1">These numbers are used by the citizen emergency assistance call button.</p>
            </div>

            {contactsLoading ? (
              <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-2"></div>
                Loading contact settings...
              </div>
            ) : (
              <form onSubmit={handleSaveEmergencyContacts} className="max-w-2xl space-y-5">
                <div>
                  <label className="block text-[10px] uppercase font-bold tracking-wider text-gray-400 mb-1.5">Medical Emergency Coordinator</label>
                  <div className="relative">
                    <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-400" />
                    <input
                      type="tel"
                      value={medicalCoordinatorPhone}
                      onChange={(e) => setMedicalCoordinatorPhone(e.target.value)}
                      placeholder="+91XXXXXXXXXX"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl glass-input text-white text-sm focus:border-blue-500 shadow-inner"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold tracking-wider text-gray-400 mb-1.5">Fire Emergency Coordinator</label>
                  <div className="relative">
                    <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-red-400" />
                    <input
                      type="tel"
                      value={fireCoordinatorPhone}
                      onChange={(e) => setFireCoordinatorPhone(e.target.value)}
                      placeholder="+91XXXXXXXXXX"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl glass-input text-white text-sm focus:border-blue-500 shadow-inner"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={contactsSaving}
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition shadow-md active:scale-95 disabled:opacity-60"
                >
                  {contactsSaving ? 'Saving Contacts...' : 'Save Contact Numbers'}
                </button>
              </form>
            )}
          </div>
        )}
    </DashboardShell>
  );
}
