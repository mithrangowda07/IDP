import React, { useState, useEffect } from 'react';
import { citizenAPI } from '../services/api';
import { connectSocket, disconnectSocket, socket } from '../services/socket';
import MapPanel from '../components/MapPanel';
import { MapPin, Navigation, Upload, CheckCircle2, AlertTriangle, Clock, ListFilter, Power } from 'lucide-react';

export default function CitizenDashboard({ user, onLogout }) {
  const [activeTab, setActiveTab] = useState('report');
  const [incidents, setIncidents] = useState([]);
  const [loadingIncidents, setLoadingIncidents] = useState(false);

  // Form states
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

  // Location selector state
  const [manualMarkerPos, setManualMarkerPos] = useState({ lat: 12.9716, lng: 77.5946 });

  useEffect(() => {
    // Connect to Socket.IO room for citizens
    connectSocket('citizen_user');

    // Load citizen incidents
    loadMyIncidents();

    // Listen for real-time status updates
    socket.on('incident_status_change', (data) => {
      console.log('Real-time incident status update received:', data);
      setIncidents(prev => 
        prev.map(inc => inc.id === data.incidentId ? { ...inc, status: data.status } : inc)
      );
    });

    return () => {
      socket.off('incident_status_change');
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
      // Reload incidents list
      loadMyIncidents();
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
      default: return 'text-gray-400 bg-gray-500/10';
    }
  };

  return (
    <div className="min-h-screen bg-[#070b13] flex flex-col">
      {/* Top Navbar */}
      <nav className="glass-panel border-b border-white/5 py-4 px-6 flex justify-between items-center shadow-lg relative z-20">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-600/10 text-blue-400 rounded-lg border border-blue-500/20">
            <AlertTriangle size={20} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white leading-tight">Emergency Portal</h1>
            <p className="text-xs text-gray-400">Welcome, {user.name} (Citizen)</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex bg-white/5 p-1 rounded-xl border border-white/10">
            <button
              onClick={() => setActiveTab('report')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition ${activeTab === 'report' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400 hover:text-white'}`}
            >
              Report Incident
            </button>
            <button
              onClick={() => {
                setActiveTab('my-incidents');
                loadMyIncidents();
              }}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition ${activeTab === 'my-incidents' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400 hover:text-white'}`}
            >
              My Incidents ({incidents.length})
            </button>
          </div>

          <button onClick={onLogout} className="p-2 text-gray-400 hover:text-red-400 transition" title="Log Out">
            <Power size={18} />
          </button>
        </div>
      </nav>

      {/* Main Dashboard Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 grid grid-cols-1 gap-6 overflow-hidden">
        {activeTab === 'report' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full items-stretch">
            {/* Left side: Report form */}
            <div className="lg:col-span-5 glass-panel p-6 rounded-2xl flex flex-col justify-between">
              <div>
                <h3 className="text-lg font-bold text-white mb-2">Report Emergency Incident</h3>
                <p className="text-xs text-gray-400 mb-5">Please fill out coordinates, type of emergency, and describe details clearly.</p>

                {submitSuccess && (
                  <div className="mb-5 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2">
                    <CheckCircle2 size={16} /> Emergency reported successfully. Service dispatchers are checking details.
                  </div>
                )}

                {submitError && (
                  <div className="mb-5 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs">
                    {submitError}
                  </div>
                )}

                <form onSubmit={handleReportSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs uppercase font-semibold text-gray-400 mb-1.5">Emergency Type</label>
                    <select
                      value={type}
                      onChange={(e) => setType(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl glass-input text-white text-sm focus:border-blue-500"
                    >
                      <option value="accident">Accident</option>
                      <option value="fire">Fire Emergency</option>
                      <option value="gas_leak">Gas Leak Alert</option>
                      <option value="medical_emergency">Medical Emergency</option>
                    </select>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="block text-xs uppercase font-semibold text-gray-400">Incident Location</label>
                      <button
                        type="button"
                        onClick={handleCaptureGPS}
                        disabled={gpsLoading}
                        className="inline-flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 font-bold"
                      >
                        <Navigation size={12} className={gpsLoading ? 'animate-spin' : ''} />
                        {gpsLoading ? 'Locating...' : 'Get GPS Coordinates'}
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-2">
                      <div className="glass-panel px-3 py-2 rounded-xl border border-white/5 bg-[#0b0e17]">
                        <span className="text-[10px] text-gray-400 block uppercase">Latitude</span>
                        <span className="text-sm font-bold text-white">{latitude}</span>
                      </div>
                      <div className="glass-panel px-3 py-2 rounded-xl border border-white/5 bg-[#0b0e17]">
                        <span className="text-[10px] text-gray-400 block uppercase">Longitude</span>
                        <span className="text-sm font-bold text-white">{longitude}</span>
                      </div>
                    </div>

                    {gpsError && (
                      <p className="text-[10px] text-amber-400">{gpsError}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs uppercase font-semibold text-gray-400 mb-1.5">Incident Description</label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      required
                      placeholder="Describe the emergency details (e.g. fire intensity, vehicle types, injured counts...)"
                      className="w-full px-4 py-2.5 rounded-xl glass-input text-white text-sm focus:border-blue-500 h-24 resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs uppercase font-semibold text-gray-400 mb-1.5">Upload Evidence Images (Multiple)</label>
                    <div className="relative border border-dashed border-white/10 rounded-xl p-4 text-center hover:border-blue-500 transition cursor-pointer">
                      <input
                        type="file"
                        multiple
                        accept="image/*"
                        onChange={handleFileChange}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <Upload size={20} className="mx-auto text-gray-500 mb-1.5" />
                      <span className="text-xs text-gray-400 block">Click or drag images to upload</span>
                      <span className="text-[10px] text-gray-500 block mt-1">MinIO storage system active</span>
                    </div>
                    {images.length > 0 && (
                      <div className="mt-2 text-xs text-blue-400 font-semibold">
                        {images.length} files selected: {images.map(f => f.name).join(', ')}
                      </div>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={submitLoading}
                    className="w-full py-3 px-4 rounded-xl text-white font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 transition shadow-lg focus:outline-none"
                  >
                    {submitLoading ? 'Reporting Incident...' : 'Report Incident'}
                  </button>
                </form>
              </div>
            </div>

            {/* Right side: Map picker */}
            <div className="lg:col-span-7 glass-panel p-4 rounded-2xl flex flex-col h-[580px]">
              <div className="mb-2 flex justify-between items-center px-2">
                <span className="text-xs font-semibold text-gray-400">Map Location Picker</span>
                <span className="text-[10px] text-gray-500">Click anywhere on the map to set manual location</span>
              </div>
              <div className="flex-1 rounded-xl overflow-hidden">
                <MapPanel
                  center={[12.9716, 77.5946]}
                  interactive={true}
                  onLocationSelect={handleMapClick}
                  markerPosition={manualMarkerPos}
                />
              </div>
            </div>
          </div>
        ) : (
          /* My Incidents list */
          <div className="glass-panel p-6 rounded-2xl min-h-[500px]">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-lg font-bold text-white">My Reported Incidents</h3>
                <p className="text-xs text-gray-400 mt-1">Check current dispatch status and location updates in real time.</p>
              </div>
              <button onClick={loadMyIncidents} className="px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 text-xs font-bold transition">
                Refresh List
              </button>
            </div>

            {loadingIncidents ? (
              <div className="py-20 text-center text-gray-400">Loading incidents...</div>
            ) : incidents.length === 0 ? (
              <div className="py-20 text-center text-gray-500 text-sm">
                You haven't reported any emergency incidents yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {incidents.map((incident) => (
                  <div key={incident.id} className="bg-white/5 border border-white/5 rounded-2xl p-5 hover:border-white/10 transition relative overflow-hidden flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <span className="text-[10px] uppercase font-semibold text-gray-400">ID: #{incident.id}</span>
                          <h4 className="text-sm font-bold text-white uppercase mt-0.5">{incident.type.replace('_', ' ')}</h4>
                        </div>
                        <span className={`px-2 py-0.5 border rounded-full text-[10px] font-bold uppercase ${getStatusColor(incident.status)}`}>
                          {incident.status.replace('_', ' ')}
                        </span>
                      </div>

                      <div className="text-xs text-gray-400 space-y-2 mb-4">
                        <p>{incident.description || 'No description provided.'}</p>
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
                        <span className="text-[10px] uppercase text-gray-400 block mb-1.5">Evidence Images</span>
                        <div className="flex gap-2 overflow-x-auto pb-1">
                          {incident.images.map((url, i) => (
                            <img
                              key={i}
                              src={url}
                              alt="evidence"
                              className="w-14 h-14 object-cover rounded-lg border border-white/10 bg-slate-900"
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
            )}
          </div>
        )}
      </main>
    </div>
  );
}
