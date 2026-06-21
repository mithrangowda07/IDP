import React, { useState, useEffect } from 'react';
import { citizenAPI, incidentsAPI } from '../services/api';
import { connectSocket, disconnectSocket, socket } from '../services/socket';
import MapPanel from '../components/MapPanel';
import DashboardShell from '../components/DashboardShell';
import PasswordInput from '../components/PasswordInput';
import { 
  MapPin, Navigation, Upload, CheckCircle2, AlertTriangle, Clock, 
  BarChart2, 
  HeartHandshake, Compass, Settings, Activity, Shield, Check, PhoneCall
} from 'lucide-react';

const INCIDENT_CATEGORIES = [
  { value: 'medical_emergency', label: 'Medical Emergency', description: 'Ambulance and urgent medical response.' },
  { value: 'accident', label: 'Road Accident', description: 'Traffic crash, injury, or roadside emergency.' },
  { value: 'fire', label: 'Fire Incident', description: 'Fire, smoke, or burn risk response.' },
  { value: 'gas_leak', label: 'Gas Leak', description: 'Gas smell, leak, or explosion risk.' },
  { value: 'building_collapse', label: 'Building Collapse', description: 'Structural collapse or trapped people.' },
  { value: 'other', label: 'Other', description: 'Emergency help when the category is unclear.' }
];

const FIRE_ASSISTANCE_TYPES = ['fire', 'gas_leak', 'building_collapse'];

export default function CitizenDashboard({ user, onLogout }) {
  const [activeTab, setActiveTab] = useState('report');
  const [incidents, setIncidents] = useState([]);
  const [loadingIncidents, setLoadingIncidents] = useState(false);

  // Form states (Report tab)
  const [type, setType] = useState('accident');
  const [description, setDescription] = useState('');
  const [images, setImages] = useState([]);
  const [latitude, setLatitude] = useState(12.9716);
  const [longitude, setLongitude] = useState(77.5946);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState('');
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [manualMarkerPos, setManualMarkerPos] = useState({ lat: 12.9716, lng: 77.5946 });

  // Profile Settings States
  const [profileName, setProfileName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileEmergencyContact, setProfileEmergencyContact] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [profilePassword, setProfilePassword] = useState('');
  const [profileStats, setProfileStats] = useState({ totalIncidents: 0, activeIncidents: 0, resolvedIncidents: 0 });
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');
  const [profileError, setProfileError] = useState('');

  // Emergency Assistance Call States
  const [assistanceType, setAssistanceType] = useState('medical_emergency');
  const [assistanceGps, setAssistanceGps] = useState(null);
  const [assistanceMarkerPos, setAssistanceMarkerPos] = useState({ lat: 12.9716, lng: 77.5946 });
  const [assistanceGpsLoading, setAssistanceGpsLoading] = useState(false);
  const [assistanceGpsError, setAssistanceGpsError] = useState('');
  const [assistanceSubmitting, setAssistanceSubmitting] = useState(false);
  const [assistanceSubmitError, setAssistanceSubmitError] = useState('');
  const [assistanceIncident, setAssistanceIncident] = useState(null);
  const [emergencyContacts, setEmergencyContacts] = useState({ medicalPhone: '', firePhone: '' });

  // Live Tracking States
  const [trackIncident, setTrackIncident] = useState(null);
  const [trackDispatch, setTrackDispatch] = useState(null);
  const [trackRoutePoints, setTrackRoutePoints] = useState([]);
  const [trackSignals, setTrackSignals] = useState([]);
  const [trackVehicle, setTrackVehicle] = useState(null);
  const [trackCorridorActive, setTrackCorridorActive] = useState(false);
  const [trackingTimeline, setTrackingTimeline] = useState([]);
  const [loadingTrack, setLoadingTrack] = useState(false);

  useEffect(() => {
    // Connect to Socket.IO
    connectSocket('citizen_user');

    // Load initial data
    loadMyIncidents();
    loadProfileAndStats();
    loadActiveTracking();
    loadEmergencyContacts();

    // Listen for real-time status updates
    socket.on('incident_status_change', (data) => {
      console.log('Real-time incident status change:', data);
      setIncidents(prev => 
        prev.map(inc => inc.id === data.incidentId ? { ...inc, status: data.status } : inc)
      );
      setTrackIncident(prev => {
        if (prev && prev.id === data.incidentId) {
          // If status changes to resolved or completed, refresh tracking state
          if (data.status === 'resolved' || data.status === 'completed') {
            setTimeout(loadActiveTracking, 1500);
          }
          return { ...prev, status: data.status };
        }
        return prev;
      });
      loadProfileAndStats();
    });

    socket.on('vehicle_tracking_update', (data) => {
      console.log('Real-time vehicle tracking update:', data);
      setTrackDispatch(currDispatch => {
        if (!currDispatch || String(currDispatch.id) !== String(data.dispatchId)) {
          return currDispatch;
        }
        setTrackVehicle(prev => {
          if (!prev) return null;
          return {
            ...prev,
            latitude: data.latitude,
            longitude: data.longitude,
            status: data.status,
            progress: data.progress
          };
        });
        return currDispatch;
      });
    });

    socket.on('green_corridor_update', (data) => {
      console.log('Real-time corridor update:', data);
      setTrackDispatch(currDispatch => {
        if (!currDispatch || String(currDispatch.id) !== String(data.dispatchId)) {
          return currDispatch;
        }
        setTrackSignals(data.signals || []);
        setTrackCorridorActive(data.status === 'active');
        if (data.route) {
          setTrackRoutePoints(data.route);
        }
        return currDispatch;
      });
    });

    socket.on('timeline_update', (data) => {
      console.log('Real-time timeline update:', data);
      setTrackingTimeline(prev => {
        // Prevent duplicates
        if (prev.some(t => t.id === data.id || (t.event_type === data.eventType && t.description === data.description))) {
          return prev;
        }
        return [...prev, {
          event_type: data.eventType,
          description: data.description,
          event_time: data.timestamp || new Date()
        }];
      });
    });

    return () => {
      socket.off('incident_status_change');
      socket.off('vehicle_tracking_update');
      socket.off('green_corridor_update');
      socket.off('timeline_update');
      disconnectSocket();
    };
  }, []);

  const loadMyIncidents = async () => {
    setLoadingIncidents(true);
    try {
      const response = await citizenAPI.getMyIncidents();
      setIncidents(response.data);
    } catch (err) {
      console.error('Failed to load incidents', err);
    } finally {
      setLoadingIncidents(false);
    }
  };

  const loadProfileAndStats = async () => {
    setProfileLoading(true);
    try {
      const pRes = await citizenAPI.getProfile();
      const sRes = await citizenAPI.getStats();
      setProfileName(pRes.data.name);
      setProfilePhone(pRes.data.phone);
      setProfileEmergencyContact(pRes.data.emergencyContact);
      setProfileEmail(pRes.data.email);
      setProfileStats(sRes.data);
    } catch (err) {
      console.error('Failed to load profile details', err);
    } finally {
      setProfileLoading(false);
    }
  };

  const loadEmergencyContacts = async () => {
    try {
      const response = await citizenAPI.getEmergencyContacts();
      setEmergencyContacts(response.data);
    } catch (err) {
      console.error('Failed to load emergency coordinator contacts', err);
    }
  };

  const loadActiveTracking = async () => {
    setLoadingTrack(true);
    try {
      const response = await citizenAPI.getActiveIncidentTrack();
      if (response.data) {
        const { incident, dispatch } = response.data;
        setTrackIncident(incident);
        setTrackDispatch(dispatch);
        if (dispatch) {
          setTrackRoutePoints(dispatch.route_geometry || []);
          setTrackSignals(dispatch.signals || []);
          setTrackCorridorActive(dispatch.corridor_active || false);
          if (dispatch.vehicle_id) {
            setTrackVehicle({
              id: dispatch.vehicle_id,
              latitude: dispatch.v_lat || dispatch.service_lat,
              longitude: dispatch.v_lng || dispatch.service_lng,
              status: dispatch.vehicle_status || 'dispatched',
              type: dispatch.service_type === 'hospital' ? 'ambulance' : 'fire_engine',
              progress: 0
            });
          } else {
            setTrackVehicle(null);
          }
          // Join Socket room for this specific dispatch
          socket.emit('join_dispatch', dispatch.id);
          // Load timeline
          const tRes = await incidentsAPI.getTimeline(incident.id);
          setTrackingTimeline(tRes.data);
        } else {
          setTrackRoutePoints([]);
          setTrackSignals([]);
          setTrackCorridorActive(false);
          setTrackVehicle(null);
          setTrackingTimeline([]);
        }
      } else {
        setTrackIncident(null);
        setTrackDispatch(null);
        setTrackRoutePoints([]);
        setTrackSignals([]);
        setTrackCorridorActive(false);
        setTrackVehicle(null);
        setTrackingTimeline([]);
      }
    } catch (err) {
      console.error('Failed to load active tracking details', err);
    } finally {
      setLoadingTrack(false);
    }
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setProfileSaving(true);
    setProfileMessage('');
    setProfileError('');
    try {
      await citizenAPI.updateProfile({
        name: profileName,
        phone: profilePhone,
        emergencyContact: profileEmergencyContact,
        email: profileEmail,
        password: profilePassword || undefined
      });
      setProfileMessage('Profile settings updated successfully!');
      setProfilePassword('');
      loadProfileAndStats();
    } catch (err) {
      setProfileError(err.response?.data?.error || 'Failed to update profile.');
    } finally {
      setProfileSaving(false);
    }
  };

  // Capture location for Assistance
  const captureAssistanceLocation = () => {
    if (!navigator.geolocation) {
      setAssistanceGpsError('Geolocation is not supported by your browser.');
      return;
    }
    setAssistanceGpsLoading(true);
    setAssistanceGpsError('');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const gps = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        };
        setAssistanceGps(gps);
        setAssistanceMarkerPos({ lat: gps.latitude, lng: gps.longitude });
        setAssistanceGpsLoading(false);
      },
      (error) => {
        setAssistanceGpsError('Unable to lock GPS location. Please check browser permissions.');
        setAssistanceGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleAssistanceMapClick = (latlng) => {
    const updatedGps = {
      latitude: latlng.lat,
      longitude: latlng.lng,
      accuracy: assistanceGps?.accuracy || 0
    };
    setAssistanceGps(updatedGps);
    setAssistanceMarkerPos({ lat: latlng.lat, lng: latlng.lng });
    setAssistanceIncident(null);
  };

  const getAssistanceCoordinatorType = (incidentType) => (
    FIRE_ASSISTANCE_TYPES.includes(incidentType) ? 'fire' : 'medical'
  );

  const getAssistanceContactNumber = (incidentType) => {
    const coordinatorType = getAssistanceCoordinatorType(incidentType);
    return coordinatorType === 'fire' ? emergencyContacts.firePhone : emergencyContacts.medicalPhone;
  };

  const getIncidentLabel = (incidentType) => (
    INCIDENT_CATEGORIES.find((category) => category.value === incidentType)?.label || incidentType.replaceAll('_', ' ')
  );

  const handleCallAdmin = async () => {
    if (!assistanceGps) {
      captureAssistanceLocation();
      setAssistanceGpsError('Acquiring location. Please try again in a few seconds once GPS is locked.');
      return;
    }

    const configuredCallNumber = getAssistanceContactNumber(assistanceType);
    if (!configuredCallNumber) {
      setAssistanceSubmitError(`${getAssistanceCoordinatorType(assistanceType) === 'fire' ? 'Fire' : 'Medical'} admin phone number is not configured yet.`);
      return;
    }

    setAssistanceSubmitting(true);
    setAssistanceSubmitError('');
    try {
      const response = await citizenAPI.requestEmergencyAssistance({
        type: assistanceType,
        latitude: assistanceGps.latitude,
        longitude: assistanceGps.longitude,
        accuracy: assistanceGps.accuracy
      });
      setAssistanceIncident(response.data.incident);
      loadMyIncidents();
      loadProfileAndStats();
      loadActiveTracking();

      const callNumber = response.data.callNumber || configuredCallNumber;
      window.location.href = `tel:${callNumber}`;
    } catch (err) {
      console.error(err);
      setAssistanceSubmitError(err.response?.data?.error || 'Failed to create emergency assistance incident.');
    } finally {
      setAssistanceSubmitting(false);
    }
  };

  const resetAssistanceFlow = () => {
    setAssistanceIncident(null);
    setAssistanceSubmitError('');
    captureAssistanceLocation();
  };

  const handleCaptureGPS = () => {
    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported by your browser.');
      return;
    }
    setGpsLoading(true);
    setGpsError('');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setLatitude(lat.toFixed(6));
        setLongitude(lng.toFixed(6));
        setManualMarkerPos({ lat, lng });
        setGpsLoading(false);
      },
      (error) => {
        setGpsError('Unable to retrieve location. Please click the map below to set coordinates manually.');
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleMapClick = (latlng) => {
    setLatitude(latlng.lat.toFixed(6));
    setLongitude(latlng.lng.toFixed(6));
    setManualMarkerPos({ lat: latlng.lat, lng: latlng.lng });
  };

  const handleFileChange = (e) => {
    if (e.target.files) {
      setImages(Array.from(e.target.files));
    }
  };

  const handleReportSubmit = async (e) => {
    e.preventDefault();
    setSubmitLoading(true);
    setSubmitError('');
    setSubmitSuccess(false);

    const formData = new FormData();
    formData.append('type', type);
    formData.append('description', description);
    formData.append('latitude', latitude);
    formData.append('longitude', longitude);
    
    images.forEach((file) => {
      formData.append('images', file);
    });

    try {
      await citizenAPI.reportIncident(formData);
      setSubmitSuccess(true);
      setDescription('');
      setImages([]);
      loadMyIncidents();
      loadProfileAndStats();
    } catch (err) {
      setSubmitError(err.response?.data?.error || 'Failed to submit incident.');
    } finally {
      setSubmitLoading(false);
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
      case 'returning': return 'text-sky-400 bg-sky-500/10 border-sky-500/20 animate-pulse';
      case 'completed': return 'text-gray-400 bg-gray-500/10 border-gray-500/20';
      default: return 'text-gray-400 bg-gray-500/10';
    }
  };

  const citizenTabs = [
    { id: 'report', label: 'Report', icon: AlertTriangle, onClick: () => setActiveTab('report') },
    { id: 'my-incidents', label: 'Incidents', icon: Activity, badge: incidents.length, onClick: () => { setActiveTab('my-incidents'); loadMyIncidents(); } },
    { id: 'tracking', label: 'Live Tracking', icon: Compass, badge: trackDispatch ? '●' : undefined, onClick: () => { setActiveTab('tracking'); loadActiveTracking(); } },
    { id: 'assistance', label: 'Need Help?', icon: HeartHandshake, onClick: () => { setActiveTab('assistance'); captureAssistanceLocation(); } },
    { id: 'profile', label: 'Settings', icon: Settings, onClick: () => { setActiveTab('profile'); loadProfileAndStats(); } }
  ];

  return (
    <DashboardShell
      icon={AlertTriangle}
      iconClassName="bg-blue-600/10 text-blue-400 border-blue-500/20"
      title="Emergency Portal"
      subtitle={`Welcome, ${user.name} (Citizen)`}
      tabs={citizenTabs}
      activeTab={activeTab}
      onLogout={onLogout}
    >
        {activeTab === 'report' && (
          <>
          <button
            type="button"
            onClick={() => {
              setActiveTab('assistance');
              captureAssistanceLocation();
            }}
            className="mb-4 w-full rounded-2xl border border-rose-500/25 bg-rose-500/10 hover:bg-rose-500/15 p-4 text-left transition shadow-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-rose-600 text-white shadow-lg">
                <HeartHandshake size={22} />
              </div>
              <div>
                <h2 className="text-base font-black text-white tracking-tight">Need Help Reporting?</h2>
                <p className="text-xs text-rose-100/70 mt-0.5">Use emergency assistance to share GPS first, then call a coordinator from your phone.</p>
              </div>
            </div>
            <span className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-white text-rose-700 text-xs font-black shadow">
              <PhoneCall size={14} />
              Emergency Assistance
            </span>
          </button>

          <div className="content-grid">
            {/* Left side: Report form */}
            <div className="lg:col-span-5 glass-panel p-6 rounded-2xl flex flex-col justify-between overflow-y-auto max-h-[90vh] lg:max-h-full">
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-bold text-white tracking-tight">Report Emergency Incident</h3>
                  <p className="text-xs text-gray-400 mt-1">Provide coordinates, type of emergency, and clear details below.</p>
                </div>

                {submitSuccess && (
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2 shadow-inner">
                    <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                    <span>Emergency reported successfully. Dispatchers are processing the request.</span>
                  </div>
                )}

                {submitError && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs shadow-inner">
                    {submitError}
                  </div>
                )}

                <form onSubmit={handleReportSubmit} className="space-y-4">
                  <div>
                    <label className="block text-[10px] uppercase font-bold tracking-wider text-gray-400 mb-1.5">Emergency Type</label>
                    <select
                      value={type}
                      onChange={(e) => setType(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl glass-input text-white text-sm focus:border-blue-500 shadow-inner"
                    >
                      {INCIDENT_CATEGORIES.map((category) => (
                        <option key={category.value} value={category.value}>{category.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="block text-[10px] uppercase font-bold tracking-wider text-gray-400">Incident Location</label>
                      <button
                        type="button"
                        onClick={handleCaptureGPS}
                        disabled={gpsLoading}
                        className="inline-flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 font-bold transition"
                      >
                        <Navigation size={12} className={gpsLoading ? 'animate-spin' : ''} />
                        {gpsLoading ? 'Locating...' : 'Get GPS Coordinates'}
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-2">
                      <div className="glass-panel px-3 py-2.5 rounded-xl border border-white/5 bg-[#0b0e17] shadow-inner">
                        <span className="text-[9px] text-gray-500 block uppercase font-bold tracking-wider">Latitude</span>
                        <span className="text-sm font-bold text-white">{latitude}</span>
                      </div>
                      <div className="glass-panel px-3 py-2.5 rounded-xl border border-white/5 bg-[#0b0e17] shadow-inner">
                        <span className="text-[9px] text-gray-500 block uppercase font-bold tracking-wider">Longitude</span>
                        <span className="text-sm font-bold text-white">{longitude}</span>
                      </div>
                    </div>

                    {gpsError && (
                      <p className="text-[10px] text-amber-400">{gpsError}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-bold tracking-wider text-gray-400 mb-1.5">Incident Description</label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      required
                      placeholder="Describe the emergency details (e.g. fire intensity, vehicle types, injured counts...)"
                      className="w-full px-4 py-2.5 rounded-xl glass-input text-white text-sm focus:border-blue-500 h-24 resize-none shadow-inner"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-bold tracking-wider text-gray-400 mb-1.5">Upload Evidence Images (Multiple)</label>
                    <div className="relative border border-dashed border-white/10 hover:border-blue-500/50 rounded-xl p-5 text-center transition duration-200 cursor-pointer bg-white/[0.01]">
                      <input
                        type="file"
                        multiple
                        accept="image/*"
                        onChange={handleFileChange}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <Upload size={22} className="mx-auto text-gray-500 mb-1.5" />
                      <span className="text-xs text-gray-400 block font-medium">Click or drag images to upload</span>
                      <span className="text-[9px] text-gray-500 block mt-1 uppercase tracking-wider">MinIO storage system active</span>
                    </div>
                    {images.length > 0 && (
                      <div className="mt-2 text-xs text-blue-400 font-semibold bg-blue-500/5 p-2.5 rounded-lg border border-blue-500/10">
                        {images.length} files selected: {images.map(f => f.name).join(', ')}
                      </div>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={submitLoading}
                    className="w-full py-3 px-4 rounded-xl text-white font-bold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 transition shadow-lg active:scale-[0.98]"
                  >
                    {submitLoading ? 'Reporting Incident...' : 'Report Incident'}
                  </button>
                </form>
              </div>
            </div>

            {/* Right side: Map picker */}
            <div className="lg:col-span-7 map-panel-wrap">
              <div className="mb-2 flex flex-col sm:flex-row justify-between sm:items-center gap-1 px-2 pb-1.5">
                <span className="text-xs font-bold text-gray-300">Map Location Picker</span>
                <span className="text-[10px] text-gray-500 uppercase tracking-wider">Click anywhere on the map to set manual location</span>
              </div>
              <div className="flex-1 rounded-xl overflow-hidden shadow-inner border border-white/5 relative">
                <MapPanel
                  center={[12.9716, 77.5946]}
                  interactive={true}
                  onLocationSelect={handleMapClick}
                  markerPosition={manualMarkerPos}
                />
              </div>
            </div>
          </div>
          </>
        )}

        {activeTab === 'my-incidents' && (
          <div className="glass-panel p-6 rounded-2xl flex-1 flex flex-col overflow-hidden max-h-[85vh] lg:max-h-full">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6 pb-4 border-b border-white/5">
              <div>
                <h3 className="text-lg font-bold text-white tracking-tight">My Reported Incidents</h3>
                <p className="text-xs text-gray-400 mt-1">Check current dispatch status and location updates in real time.</p>
              </div>
              <button onClick={loadMyIncidents} className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 text-xs font-bold transition shadow-md active:scale-95">
                Refresh List
              </button>
            </div>

            {loadingIncidents ? (
              <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
                <div className="flex flex-col items-center gap-2">
                  <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                  <span>Loading incidents...</span>
                </div>
              </div>
            ) : incidents.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
                You haven't reported any emergency incidents yet.
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto pr-1">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 pb-4">
                  {incidents.map((incident) => (
                    <div key={incident.id} className="bg-white/5 border border-white/5 rounded-2xl p-5 hover:border-white/10 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg flex flex-col justify-between group">
                      <div>
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <span className="text-[10px] uppercase font-bold text-gray-500">ID: #{incident.id}</span>
                            <h4 className="text-sm font-bold text-white uppercase mt-0.5 tracking-tight">{incident.type.replace('_', ' ')}</h4>
                          </div>
                          <span className={`px-2.5 py-0.5 border rounded-full text-[9px] font-black uppercase tracking-wider ${getStatusColor(incident.status)}`}>
                            {incident.status.replace('_', ' ')}
                          </span>
                        </div>

                        <div className="text-xs text-gray-400 space-y-2 mb-4">
                          <p className="line-clamp-3 group-hover:text-gray-300 transition duration-200">{incident.description || 'No description provided.'}</p>
                          <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                            <Clock size={12} />
                            <span>{new Date(incident.created_at).toLocaleString()}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                            <MapPin size={12} />
                            <span>Lat: {incident.latitude}, Lng: {incident.longitude}</span>
                          </div>
                        </div>
                      </div>

                      {/* Image thumbnails */}
                      {incident.images && incident.images.length > 0 && (
                        <div className="mt-2 border-t border-white/5 pt-3">
                          <span className="text-[9px] uppercase font-bold text-gray-500 block mb-1.5 tracking-wider">Evidence Images</span>
                          <div className="flex gap-2 overflow-x-auto pb-1">
                            {incident.images.map((url, i) => (
                              <img
                                key={i}
                                src={url}
                                alt="evidence"
                                className="w-14 h-14 object-cover rounded-lg border border-white/10 bg-slate-900 shadow-md shrink-0 hover:border-blue-500/40 transition duration-250"
                                onError={(e) => {
                                  e.target.onerror = null;
                                  e.target.src = 'https://placehold.co/100?text=MinIO+Image';
                                }}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'tracking' && (
          <div className="content-grid">
            {/* Left side: Track Status & Details */}
            <div className="lg:col-span-4 glass-panel p-5 rounded-2xl flex flex-col justify-between overflow-y-auto max-h-[85vh] lg:max-h-full">
              {loadingTrack ? (
                <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
                  <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-2"></div>
                  <span>Retrieving tracking data...</span>
                </div>
              ) : !trackIncident ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-gray-500 space-y-3">
                  <Compass size={48} className="text-gray-600" />
                  <p className="text-sm font-semibold">No Active Dispatches Tracked</p>
                  <p className="text-xs max-w-[200px]">Once you report an emergency and a vehicle is dispatched, real-time tracking will appear here.</p>
                </div>
              ) : (
                <div className="space-y-5 flex-1 flex flex-col">
                  {/* Status Banner */}
                  <div className="flex justify-between items-start border-b border-white/5 pb-3">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-gray-500 block">Active Dispatch Tracking</span>
                      <h4 className="text-base font-bold text-white uppercase tracking-tight">{trackIncident.type.replace('_', ' ')}</h4>
                    </div>
                    <span className={`px-2.5 py-0.5 border rounded-full text-[9px] font-black uppercase tracking-wider ${getStatusColor(trackIncident.status)}`}>
                      {trackIncident.status.replace('_', ' ')}
                    </span>
                  </div>

                  {/* Dispatch Metrics */}
                  {trackDispatch ? (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="glass-panel p-3 rounded-xl border border-white/5 bg-[#0b0e17]">
                        <span className="text-[9px] text-gray-500 block uppercase font-bold tracking-wider">Driver Name</span>
                        <span className="text-xs font-bold text-white">{trackDispatch.driver_name || 'Officer John Doe'}</span>
                      </div>
                      <div className="glass-panel p-3 rounded-xl border border-white/5 bg-[#0b0e17]">
                        <span className="text-[9px] text-gray-500 block uppercase font-bold tracking-wider">Vehicle ID</span>
                        <span className="text-xs font-bold text-blue-400">{trackDispatch.vehicle_id || 'N/A'}</span>
                      </div>
                      <div className="glass-panel p-3 rounded-xl border border-white/5 bg-[#0b0e17]">
                        <span className="text-[9px] text-gray-500 block uppercase font-bold tracking-wider">ETA</span>
                        <span className="text-xs font-bold text-white">{trackDispatch.optimized_eta ? `${Math.ceil(trackDispatch.optimized_eta / 60)} mins (Optimized)` : 'Calculating...'}</span>
                      </div>
                      <div className="glass-panel p-3 rounded-xl border border-white/5 bg-[#0b0e17] flex items-center justify-between">
                        <div>
                          <span className="text-[9px] text-gray-500 block uppercase font-bold tracking-wider">Green Corridor</span>
                          <span className={`text-xs font-bold ${trackCorridorActive ? 'text-emerald-400 animate-pulse' : 'text-gray-400'}`}>
                            {trackCorridorActive ? 'ACTIVE OVERRIDE' : 'INACTIVE'}
                          </span>
                        </div>
                        {trackCorridorActive && <Shield size={16} className="text-emerald-400" />}
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/10 text-xs text-blue-300">
                      Waiting for emergency dispatch center to verify and assign a responder service...
                    </div>
                  )}

                  {/* Real-time progress bar */}
                  {trackVehicle && trackVehicle.progress !== undefined && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] font-bold text-gray-400">
                        <span>ROUTE PROGRESS</span>
                        <span>{Math.round(trackVehicle.progress)}%</span>
                      </div>
                      <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden border border-white/5 p-[1px]">
                        <div className="bg-gradient-to-r from-emerald-500 to-green-500 h-full rounded-full transition-all duration-1000" style={{ width: `${trackVehicle.progress}%` }}></div>
                      </div>
                    </div>
                  )}

                  {/* Incident Timeline view */}
                  <div className="flex-1 flex flex-col min-h-[180px]">
                    <span className="text-[10px] uppercase font-bold text-gray-500 block mb-3.5 tracking-wider">Lifecycle Timeline</span>
                    <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                      {trackingTimeline.length === 0 ? (
                        <p className="text-xs text-gray-500 italic">No events logged yet.</p>
                      ) : (
                        trackingTimeline.map((ev, i) => (
                          <div key={i} className="flex gap-3 text-xs relative">
                            {i < trackingTimeline.length - 1 && (
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
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right side: Realtime Leaflet Map */}
            <div className="lg:col-span-8 map-panel-wrap">
              <div className="mb-2 flex flex-col sm:flex-row justify-between sm:items-center gap-1 px-2 pb-1.5">
                <span className="text-xs font-bold text-gray-300">Live Navigation Map</span>
                <span className="text-[10px] text-gray-500 uppercase tracking-wider">
                  {trackCorridorActive ? 'Priority green signals are marked green.' : 'Normal traffic control operating.'}
                </span>
              </div>
              <div className="flex-1 rounded-xl overflow-hidden shadow-inner border border-white/5 relative">
                <MapPanel
                  center={trackIncident ? [parseFloat(trackIncident.latitude), parseFloat(trackIncident.longitude)] : [12.9716, 77.5946]}
                  zoom={14}
                  interactive={false}
                  activeIncident={trackIncident}
                  routePoints={trackRoutePoints}
                  corridorActive={trackCorridorActive}
                  signals={trackSignals}
                  trackingVehicle={trackVehicle}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'assistance' && (
          <div className="content-grid">
            <div className="lg:col-span-5 glass-panel p-6 rounded-2xl flex flex-col overflow-y-auto">
              <div className="mb-5">
                <span className="text-[10px] uppercase font-bold tracking-wider text-rose-400">Emergency Assistance</span>
                <h3 className="text-xl font-bold text-white tracking-tight mt-1">Need Help Reporting?</h3>
                <p className="text-xs text-gray-400 mt-1">Select the emergency type, confirm the GPS location, then call the admin to submit the incident.</p>
              </div>

              <div className="space-y-5">
                <div>
                  <label className="block text-[10px] uppercase font-bold tracking-wider text-gray-400 mb-2">Incident Type</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {INCIDENT_CATEGORIES.map((category) => {
                      const selected = assistanceType === category.value;
                      return (
                        <button
                          key={category.value}
                          type="button"
                          onClick={() => {
                            setAssistanceType(category.value);
                            setAssistanceIncident(null);
                          }}
                          className={`p-3.5 rounded-xl border text-left transition h-28 ${selected ? 'bg-rose-500/10 border-rose-500/40 shadow-inner' : 'bg-white/5 border-white/5 hover:border-white/15'}`}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <div className={`p-1.5 rounded-lg ${FIRE_ASSISTANCE_TYPES.includes(category.value) ? 'bg-red-500/10 text-red-400' : 'bg-blue-500/10 text-blue-400'}`}>
                              {FIRE_ASSISTANCE_TYPES.includes(category.value) ? <AlertTriangle size={15} /> : <Activity size={15} />}
                            </div>
                            <h4 className="text-xs font-bold text-white">{category.label}</h4>
                          </div>
                          <p className="text-[10px] text-gray-400 leading-relaxed">{category.description}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-xl border border-white/5 bg-white/[0.01] p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${assistanceGps ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'} border`}>
                        <MapPin size={18} />
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-gray-500 block">GPS Location</span>
                        <strong className="text-xs text-white">
                          {assistanceGpsLoading ? 'Acquiring GPS signal...' : assistanceGps ? 'Location ready for confirmation' : 'Location required'}
                        </strong>
                        {assistanceGps && (
                          <p className="text-[10px] text-gray-500 mt-0.5">Lat {assistanceGps.latitude.toFixed(5)}, Lng {assistanceGps.longitude.toFixed(5)} (±{Number(assistanceGps.accuracy || 0).toFixed(1)}m)</p>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={captureAssistanceLocation}
                      disabled={assistanceGpsLoading}
                      className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition shadow disabled:opacity-60"
                    >
                      {assistanceGpsLoading ? 'Locating...' : 'Refresh GPS'}
                    </button>
                  </div>
                </div>

                {assistanceGpsError && (
                  <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-200 text-xs">
                    {assistanceGpsError}
                  </div>
                )}

                {assistanceSubmitError && (
                  <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-200 text-xs">
                    {assistanceSubmitError}
                  </div>
                )}

                {assistanceIncident ? (
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 space-y-4">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 size={18} className="text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-sm font-bold text-white">Incident #{assistanceIncident.id} created</h4>
                        <p className="text-xs text-emerald-100/70 mt-1">Your phone dialer should open with the admin number. The incident is already in the normal dispatch workflow.</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          loadActiveTracking();
                          setActiveTab('tracking');
                        }}
                        className="py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-white text-xs font-bold border border-white/10 transition"
                      >
                        View Live Tracking
                      </button>
                      <button
                        type="button"
                        onClick={resetAssistanceFlow}
                        className="py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-bold border border-white/10 transition"
                      >
                        Start Another Report
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleCallAdmin}
                    disabled={assistanceSubmitting}
                    className="w-full py-3 px-4 rounded-xl text-white font-bold bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 transition shadow-lg active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <span className="inline-flex items-center justify-center gap-2">
                      <PhoneCall size={18} />
                      {assistanceSubmitting ? 'Submitting Incident...' : `Call Admin for ${getIncidentLabel(assistanceType)}`}
                    </span>
                  </button>
                )}
              </div>
            </div>

            <div className="lg:col-span-7 map-panel-wrap">
              <div className="mb-2 flex flex-col sm:flex-row justify-between sm:items-center gap-1 px-2 pb-1.5">
                <span className="text-xs font-bold text-gray-300">Confirm Location</span>
                <span className="text-[10px] text-gray-500 uppercase tracking-wider">Tap the map to adjust coordinates before calling admin</span>
              </div>
              <div className="flex-1 rounded-xl overflow-hidden shadow-inner border border-white/5 relative">
                <MapPanel
                  center={assistanceGps ? [assistanceGps.latitude, assistanceGps.longitude] : [12.9716, 77.5946]}
                  zoom={15}
                  interactive={!assistanceIncident}
                  onLocationSelect={handleAssistanceMapClick}
                  markerPosition={assistanceMarkerPos}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'profile' && (
          <div className="content-grid">
            {/* Left side: Profile Edit form */}
            <div className="lg:col-span-7 glass-panel p-6 rounded-2xl flex flex-col">
              <div className="mb-4">
                <h3 className="text-lg font-bold text-white tracking-tight">Profile Settings</h3>
                <p className="text-xs text-gray-400 mt-1">Review contact numbers, update email credentials, or change password.</p>
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
                <div className="flex-1 flex items-center justify-center text-gray-400 text-xs">
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-2"></div>
                  <span>Fetching Profile...</span>
                </div>
              ) : (
                <form onSubmit={handleUpdateProfile} className="space-y-4 flex-1 flex flex-col justify-between">
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] uppercase font-bold tracking-wider text-gray-400 mb-1.5">Full Name</label>
                        <input
                          type="text"
                          required
                          value={profileName}
                          onChange={(e) => setProfileName(e.target.value)}
                          className="w-full px-4 py-2.5 rounded-xl glass-input text-white text-sm focus:border-blue-500 shadow-inner"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] uppercase font-bold tracking-wider text-gray-400 mb-1.5">Email Address</label>
                        <input
                          type="email"
                          required
                          value={profileEmail}
                          onChange={(e) => setProfileEmail(e.target.value)}
                          className="w-full px-4 py-2.5 rounded-xl glass-input text-white text-sm focus:border-blue-500 shadow-inner"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] uppercase font-bold tracking-wider text-gray-400 mb-1.5">Phone Number</label>
                        <input
                          type="tel"
                          required
                          value={profilePhone}
                          onChange={(e) => setProfilePhone(e.target.value)}
                          className="w-full px-4 py-2.5 rounded-xl glass-input text-white text-sm focus:border-blue-500 shadow-inner"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] uppercase font-bold tracking-wider text-gray-400 mb-1.5">Emergency Contact</label>
                        <input
                          type="tel"
                          value={profileEmergencyContact}
                          onChange={(e) => setProfileEmergencyContact(e.target.value)}
                          className="w-full px-4 py-2.5 rounded-xl glass-input text-white text-sm focus:border-blue-500 shadow-inner"
                          placeholder="None configured"
                        />
                      </div>
                    </div>

                    <PasswordInput
                      id="citizen-profile-password"
                      label="New Password (Leave blank to keep current)"
                      value={profilePassword}
                      onChange={(e) => setProfilePassword(e.target.value)}
                      placeholder="Enter new password"
                      showIcon={false}
                      labelClassName="block text-[10px] uppercase font-bold tracking-wider text-gray-400 mb-1.5"
                      inputClassName="text-sm py-2.5"
                      autoComplete="new-password"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={profileSaving}
                    className="w-full py-3 px-4 rounded-xl text-white font-bold bg-blue-600 hover:bg-blue-500 transition shadow-lg mt-6"
                  >
                    {profileSaving ? 'Saving Changes...' : 'Save Settings'}
                  </button>
                </form>
              )}
            </div>

            {/* Right side: Statistics info card */}
            <div className="lg:col-span-5 glass-panel p-6 rounded-2xl flex flex-col justify-between">
              <div>
                <h3 className="text-lg font-bold text-white tracking-tight">Citizen Report Stats</h3>
                <p className="text-xs text-gray-400 mt-1">Lifecycle count of reported emergencies.</p>
              </div>

              <div className="my-6 space-y-4 flex-1 flex flex-col justify-center">
                <div className="flex items-center justify-between p-4 rounded-xl border border-white/5 bg-[#0b0e17]">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg">
                      <BarChart2 size={20} />
                    </div>
                    <span className="text-xs font-bold text-gray-300">Total Emergency Calls</span>
                  </div>
                  <strong className="text-xl text-white font-mono">{profileStats.totalIncidents}</strong>
                </div>

                <div className="flex items-center justify-between p-4 rounded-xl border border-white/5 bg-[#0b0e17]">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg">
                      <Activity size={20} />
                    </div>
                    <span className="text-xs font-bold text-gray-300">Currently Active</span>
                  </div>
                  <strong className="text-xl text-amber-400 font-mono">{profileStats.activeIncidents}</strong>
                </div>

                <div className="flex items-center justify-between p-4 rounded-xl border border-white/5 bg-[#0b0e17]">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg">
                      <Check size={20} />
                    </div>
                    <span className="text-xs font-bold text-gray-300">Resolved Incidents</span>
                  </div>
                  <strong className="text-xl text-emerald-400 font-mono">{profileStats.resolvedIncidents}</strong>
                </div>
              </div>

              <div className="text-[10px] text-gray-500 border-t border-white/5 pt-4 text-center">
                Thank you for contributing to community safety by reporting incidents responsibly.
              </div>
            </div>
          </div>
        )}

    </DashboardShell>
  );
}
