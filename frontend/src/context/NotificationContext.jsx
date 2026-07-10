import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { socket } from '../services/socket';
import EmergencyAlarm from '../services/EmergencyAlarm';
import BrowserNotification from '../services/BrowserNotification';
import TitleFlasher from '../services/TitleFlasher';
import NotificationService from '../services/NotificationService';

const NotificationContext = createContext();

export const useNotifications = () => useContext(NotificationContext);

export const NotificationProvider = ({ children, user }) => {
  const [activeAlerts, setActiveAlerts] = useState([]); // Queue of active alerts
  const [currentAlert, setCurrentAlert] = useState(null); // Alert currently visible in popup
  const [isFlashing, setIsFlashing] = useState(false); // Dashboard flash control
  const [shouldShake, setShouldShake] = useState(false); // Trigger shake on modal
  const [countdownSeconds, setCountdownSeconds] = useState(0); // Escalation countdown
  const [adminStatus, setAdminStatus] = useState('offline'); // online | idle | offline
  const [onlineOperators, setOnlineOperators] = useState([]); // Statuses of other admins
  const [selectedIncidentForDashboard, setSelectedIncidentForDashboard] = useState(null); // Triggers auto-selection on dashboard

  const activeAlertsRef = useRef([]);
  const countdownIntervalRef = useRef(null);
  const reminderIntervalRef = useRef(null);
  const idleTimeoutRef = useRef(null);

  // Synchronize activeAlertsRef with state
  useEffect(() => {
    activeAlertsRef.current = activeAlerts;
  }, [activeAlerts]);

  // Request browser notification permissions once upon mount
  useEffect(() => {
    BrowserNotification.requestPermission();
  }, []);

  // Track operator online/idle status when user session is active
  useEffect(() => {
    if (!user) {
      setAdminStatus('offline');
      return;
    }

    // Connect to sockets (assumes App.jsx has already connected, but we can verify)
    setAdminStatus('online');

    const reportOnline = () => {
      if (socket.connected) {
        socket.emit('admin_online', { userId: user.id, role: user.role });
      }
    };

    // Emit online status when socket connects or reconnects
    socket.on('connect', reportOnline);
    if (socket.connected) {
      reportOnline();
    }

    // User activity listeners for idle status tracking
    const IDLE_TIME_MS = 60000; // 60 seconds of inactivity = Idle
    
    const resetIdleTimer = () => {
      // If user was idle, report them online again
      setAdminStatus(prev => {
        if (prev === 'idle') {
          console.log('[NotificationContext] User active. Reporting ONLINE.');
          if (socket.connected) {
            socket.emit('admin_online', { userId: user.id, role: user.role });
          }
          return 'online';
        }
        return prev;
      });

      if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
      
      idleTimeoutRef.current = setTimeout(() => {
        setAdminStatus(prev => {
          if (prev === 'online') {
            console.log('[NotificationContext] User inactive. Reporting IDLE.');
            if (socket.connected) {
              socket.emit('admin_idle', { userId: user.id });
            }
            return 'idle';
          }
          return prev;
        });
      }, IDLE_TIME_MS);
    };

    // Register mouse/keyboard listeners
    window.addEventListener('mousemove', resetIdleTimer);
    window.addEventListener('keydown', resetIdleTimer);
    window.addEventListener('click', resetIdleTimer);

    // Initial trigger
    resetIdleTimer();

    // Load initial operator status from REST API
    const loadOperatorStatuses = async () => {
      try {
        const res = await NotificationService.getStatus();
        if (res.data && res.data.statuses) {
          setOnlineOperators(res.data.statuses);
        }
      } catch (err) {
        console.warn('Failed to load initial online operators:', err);
      }
    };
    loadOperatorStatuses();

    // Listen to status updates from other admins
    socket.on('status_update', (data) => {
      setOnlineOperators(prev => {
        const filtered = prev.filter(op => op.userId !== data.userId);
        if (data.status === 'offline') {
          return filtered;
        }
        return [...filtered, data];
      });
    });

    return () => {
      // Clean up activity listeners
      window.removeEventListener('mousemove', resetIdleTimer);
      window.removeEventListener('keydown', resetIdleTimer);
      window.removeEventListener('click', resetIdleTimer);
      if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);

      if (socket.connected) {
        socket.emit('admin_offline', { userId: user.id });
      }
      
      socket.off('connect', reportOnline);
      socket.off('status_update');
    };
  }, [user]);

  // Setup real-time Socket.IO incident and alert events
  useEffect(() => {
    if (!user) return;

    // Check if incident is relevant to this user's admin role
    const isIncidentRelevant = (incident) => {
      if (user.role === 'medical_admin' && ['accident', 'medical_emergency', 'other'].includes(incident.type)) return true;
      if (user.role === 'fire_admin' && ['fire', 'gas_leak', 'building_collapse'].includes(incident.type)) return true;
      if (user.role === 'traffic_admin') return true; // Traffic receives routing and updates
      return false;
    };

    const handleNewAlert = (incident) => {
      if (!isIncidentRelevant(incident)) return;

      // Avoid duplicates
      const exists = activeAlertsRef.current.some(alert => alert.id === incident.id);
      if (exists) return;

      console.log('[NotificationContext] New incident alert received:', incident);

      // Add to alert queue
      setActiveAlerts(prev => [...prev, incident]);

      // Trigger desktop notification
      const reporterText = incident.reporter_id ? 'Citizen' : 'IoT Sensor';
      BrowserNotification.show(`🚨 Emergency Alert: ${incident.type.toUpperCase().replace('_', ' ')}`, {
        body: `Location: ${incident.latitude}, ${incident.longitude}\nReporter: ${reporterText}\nTime: ${new Date(incident.created_at).toLocaleTimeString()}`,
        requireInteraction: true
      });
    };

    // Listen to standard play_alarm events
    socket.on('play_alarm', (payload) => {
      handleNewAlert(payload.incident);
    });

    // Listen to escalation warnings
    socket.on('escalation_alert', (payload) => {
      // Escalations are broadcasted to alternative roles, check relevance
      if (payload.targetRole === 'all_operators' || payload.targetRole === user.role) {
        console.log(`[NotificationContext] Escalation Alert Level ${payload.level} received for incident: #${payload.incidentId}`);
        handleNewAlert(payload.incident);
      }
    });

    // Listen to stop alarm / silencing events
    socket.on('stop_alarm', (data) => {
      setActiveAlerts(prev => prev.filter(alert => alert.id !== data.incidentId));
    });

    // Listen to global acknowledgements
    socket.on('incident_acknowledged', (data) => {
      setActiveAlerts(prev => prev.filter(alert => alert.id !== data.incidentId));
    });

    return () => {
      socket.off('play_alarm');
      socket.off('escalation_alert');
      socket.off('stop_alarm');
      socket.off('incident_acknowledged');
    };
  }, [user]);

  // Queue controller - coordinates the visible alert and the siren sounds
  useEffect(() => {
    if (activeAlerts.length > 0) {
      const nextAlert = activeAlerts[0];
      
      // If we are showing a different alert or no alert is showing
      if (!currentAlert || currentAlert.id !== nextAlert.id) {
        setCurrentAlert(nextAlert);
        setIsFlashing(true);

        // Play correct alarm siren based on type
        EmergencyAlarm.play(nextAlert.type);

        // Flash browser title
        TitleFlasher.start(nextAlert.type);
      }
    } else {
      // No more active alerts in the queue
      setCurrentAlert(null);
      setIsFlashing(false);
      EmergencyAlarm.stop();
      TitleFlasher.stop();
    }
  }, [activeAlerts, currentAlert]);

  // Countdown calculations for the next escalation stage
  useEffect(() => {
    if (!currentAlert) {
      setCountdownSeconds(0);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      return;
    }

    const calculateCountdown = () => {
      const createdAt = new Date(currentAlert.created_at).getTime();
      const elapsed = Math.floor((Date.now() - createdAt) / 1000);
      
      let nextLimit = 0;
      if (elapsed < 60) {
        nextLimit = 60; // Escalates to Hospital Admin
      } else if (elapsed < 90) {
        nextLimit = 90; // Escalates to Fire Admin
      } else if (elapsed < 120) {
        nextLimit = 120; // Escalates to Traffic Admin
      } else if (elapsed < 180) {
        nextLimit = 180; // Escalates to All Online Operators
      } else {
        nextLimit = 0; // Fully escalated
      }

      const remaining = nextLimit > 0 ? nextLimit - elapsed : 0;
      setCountdownSeconds(remaining);
    };

    calculateCountdown(); // Run immediately

    countdownIntervalRef.current = setInterval(calculateCountdown, 1000);

    return () => {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, [currentAlert]);

  // 30-Second Reminder Alarm & Modal Shake Controller
  useEffect(() => {
    if (!currentAlert) {
      if (reminderIntervalRef.current) clearInterval(reminderIntervalRef.current);
      return;
    }

    reminderIntervalRef.current = setInterval(() => {
      if (!currentAlert) return;

      console.log(`[NotificationContext] Reminder Triggered for incident #${currentAlert.id}`);

      // Replay Alarm
      EmergencyAlarm.play(currentAlert.type);

      // Trigger Shake State
      setShouldShake(true);
      setTimeout(() => setShouldShake(false), 1000);

      // Show another desktop notification if window is out of focus
      if (document.hidden) {
        BrowserNotification.show(`⚠️ UNACKNOWLEDGED EMERGENCY: ${currentAlert.type.toUpperCase()}`, {
          body: `Reminder: Action required for incident #${currentAlert.id} at [${currentAlert.latitude}, ${currentAlert.longitude}]`,
          requireInteraction: true
        });
      }
    }, 30000); // 30 seconds

    return () => {
      if (reminderIntervalRef.current) clearInterval(reminderIntervalRef.current);
    };
  }, [currentAlert]);

  /**
   * Action: Acknowledges the active incident
   * @param {number} incidentId 
   */
  const acknowledgeAlert = async (incidentId) => {
    try {
      const res = await NotificationService.acknowledge(incidentId);
      if (res.data && res.data.success) {
        console.log(`[NotificationContext] Acknowledge call succeeded for #${incidentId}`);
        // Select it for the dashboard view
        setSelectedIncidentForDashboard(incidentId);
        // Remove from local queue
        setActiveAlerts(prev => prev.filter(alert => alert.id !== incidentId));
      }
    } catch (err) {
      console.error('[NotificationContext] Failed to acknowledge incident:', err);
      // Select it for dashboard view even on fallback
      setSelectedIncidentForDashboard(incidentId);
      // Fallback: remove from queue in case network error occurs but we need to silence it
      setActiveAlerts(prev => prev.filter(alert => alert.id !== incidentId));
    }
  };

  /**
   * Action: View Incident (silences the alarm and marks popup as seen for this session)
   * @param {number} incidentId 
   */
  const viewIncident = (incidentId) => {
    console.log(`[NotificationContext] Viewing incident #${incidentId}. Silencing alarm...`);
    // Silence local alarm sound
    EmergencyAlarm.stop();
    TitleFlasher.stop();
    // Select it for the dashboard view
    setSelectedIncidentForDashboard(incidentId);
    // Remove from active alerts queue locally so the popup closes
    setActiveAlerts(prev => prev.filter(alert => alert.id !== incidentId));
  };

  // Expose context properties
  return (
    <NotificationContext.Provider
      value={{
        activeAlerts,
        currentAlert,
        isFlashing,
        shouldShake,
        countdownSeconds,
        adminStatus,
        onlineOperators,
        selectedIncidentForDashboard,
        setSelectedIncidentForDashboard,
        setAdminStatus,
        acknowledgeAlert,
        viewIncident
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};
export default NotificationContext;
