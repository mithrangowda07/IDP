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
  registerCitizen: (name, email, password) => api.post('/auth/register-citizen', { name, email, password }),
  registerHospital: (data) => api.post('/auth/register-hospital', data),
  registerFireStation: (data) => api.post('/auth/register-fire-station', data),
};

export const adminAPI = {
  getPendingServices: () => api.get('/admin/pending-services'),
  approveService: (serviceId) => api.post('/admin/approve-service', { serviceId }),
  rejectService: (serviceId) => api.post('/admin/reject-service', { serviceId }),
};

export const citizenAPI = {
  reportIncident: (formData) => api.post('/citizen/incidents', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  getMyIncidents: () => api.get('/citizen/my-incidents'),
};

export const incidentsAPI = {
  getIncidents: () => api.get('/incidents'),
  getIncidentDetails: (id) => api.get(`/incidents/${id}`),
  getNearbyServices: (id) => api.get(`/incidents/${id}/nearby-services`),
  alertService: (id, serviceId) => api.post(`/incidents/${id}/alert-service`, { serviceId }),
};

export const serviceAPI = {
  getAlerts: (serviceId) => api.get(`/services/${serviceId}/alerts`),
  getActiveDispatch: (serviceId) => api.get(`/services/${serviceId}/active-dispatch`),
  getVehicles: (serviceId) => api.get(`/services/${serviceId}/vehicles`),
  dispatchVehicle: (serviceId, dispatchId, vehicleId) => api.post(`/services/${serviceId}/dispatch`, { dispatchId, vehicleId }),
  setEnRoute: (serviceId, dispatchId) => api.post(`/services/${serviceId}/en-route`, { dispatchId }),
  setAtScene: (serviceId, dispatchId) => api.post(`/services/${serviceId}/at-scene`, { dispatchId }),
  resolveIncident: (serviceId, dispatchId) => api.post(`/services/${serviceId}/resolve`, { dispatchId }),
};

export const trafficAPI = {
  getActiveCorridors: () => api.get('/traffic/active-corridors'),
  getTrackingHistory: () => api.get('/traffic/tracking-history'),
};

export default api;
