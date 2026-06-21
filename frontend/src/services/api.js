const API_BASE_URL = 'http://localhost:5000/api';

import axios from 'axios';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor to attach JWT token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Helper endpoints
export const authAPI = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  registerCitizen: (data) => api.post('/auth/register-citizen', data),
  registerHospital: (data) => api.post('/auth/register-hospital', data),
  registerFireStation: (data) => api.post('/auth/register-fire-station', data),
};

export const adminAPI = {
  getPendingServices: () => api.get('/admin/pending-services'),
  approveService: (serviceId) => api.post('/admin/approve-service', { serviceId }),
  rejectService: (serviceId) => api.post('/admin/reject-service', { serviceId }),
  getEmergencyContacts: () => api.get('/emergency-contacts'),
  updateEmergencyContacts: (data) => api.put('/admin/emergency-contacts', data),
};

export const citizenAPI = {
  reportIncident: (formData) => api.post('/citizen/incidents', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  getMyIncidents: () => api.get('/citizen/my-incidents'),
  getProfile: () => api.get('/citizen/profile'),
  updateProfile: (data) => api.put('/citizen/profile', data),
  getStats: () => api.get('/citizen/stats'),
  requestEmergencyAssistance: (data) => api.post('/incidents/emergency-assistance', data),
  getEmergencyContacts: () => api.get('/emergency-contacts'),
  getActiveIncidentTrack: () => api.get('/citizen/active-incident/track'),
};

export const incidentsAPI = {
  getIncidents: () => api.get('/incidents'),
  getIncidentDetails: (id) => api.get(`/incidents/${id}`),
  getNearbyServices: (id) => api.get(`/incidents/${id}/nearby-services`),
  checkRoute: (params) => api.get('/routing/check', { params }),
  alertService: (id, serviceId) => api.post(`/incidents/${id}/alert-service`, { serviceId }),
  getTimeline: (id) => api.get(`/incidents/${id}/timeline`),
  correctLocation: (id, data) => api.put(`/incidents/${id}/location`, data),
  getAuditTrail: (id) => api.get(`/incidents/${id}/audit-trail`),
};

export const serviceAPI = {
  getAlerts: (serviceId) => api.get(`/services/${serviceId}/alerts`),
  getActiveDispatch: (serviceId) => api.get(`/services/${serviceId}/active-dispatch`),
  getActiveDispatches: (serviceId) => api.get(`/services/${serviceId}/active-dispatches`),
  getVehicles: (serviceId) => api.get(`/services/${serviceId}/vehicles`),
  addVehicle: (serviceId, vehicleId) => api.post(`/services/${serviceId}/vehicles`, { vehicleId }),
  removeVehicle: (serviceId, vehicleId) => api.delete(`/services/${serviceId}/vehicles/${vehicleId}`),
  dispatchVehicle: (serviceId, dispatchId, vehicleId) => api.post(`/services/${serviceId}/dispatch`, { dispatchId, vehicleId }),
  setEnRoute: (serviceId, dispatchId) => api.post(`/services/${serviceId}/en-route`, { dispatchId }),
  setAtScene: (serviceId, dispatchId) => api.post(`/services/${serviceId}/at-scene`, { dispatchId }),
  resolveIncident: (serviceId, data) => api.post(`/services/${serviceId}/resolve`, data),
  getProfile: (serviceId) => api.get(`/services/${serviceId}/profile`),
  updateProfile: (serviceId, data) => api.put(`/services/${serviceId}/profile`, data),
  getStats: (serviceId) => api.get(`/services/${serviceId}/stats`),
  getHistory: (serviceId, params) => api.get(`/services/${serviceId}/history`, { params }),
  getSimulationSpeed: () => api.get('/simulation-speed'),
  adjustSimulationSpeed: (delta) => api.post('/simulation-speed', { delta }),
};

export const trafficAPI = {
  getActiveCorridors: () => api.get('/traffic/active-corridors'),
  getTrackingHistory: () => api.get('/traffic/tracking-history'),
  getJourneyStats: (params) => api.get('/traffic/journey-stats', { params }),
  getJourneyHistory: (params) => api.get('/traffic/journey-history', { params }),
};

export default api;
