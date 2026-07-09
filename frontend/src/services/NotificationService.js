import api from './api';

/**
 * NotificationService
 * 
 * Frontend client interface for communicating with the backend notification endpoints:
 * - Acknowledging active incidents
 * - Retrieving active operator status details
 */
export const NotificationService = {
  /**
   * Send acknowledgement request for an incident
   * @param {number} incidentId 
   * @returns {Promise} Axios response promise
   */
  acknowledge: (incidentId) => api.post('/notifications/acknowledge', { incidentId }),

  /**
   * Get current online status of all administrators
   * @returns {Promise} Axios response promise
   */
  getStatus: () => api.get('/notifications/status')
};

export default NotificationService;
