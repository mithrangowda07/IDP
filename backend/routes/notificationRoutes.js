const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('../db');
const alarmGateway = require('../services/AlarmGateway');
const socketNotificationService = require('../services/SocketNotificationService');

const JWT_SECRET = process.env.JWT_SECRET || 'emergency-jwt-super-secret-key-1536';

// Middleware to authenticate JWT
function authenticateJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
      if (err) {
        return res.status(403).json({ error: 'Invalid or expired token.' });
      }
      req.user = decoded;
      next();
    });
  } else {
    res.status(401).json({ error: 'Authorization header with Bearer token required.' });
  }
}

// Middleware to authorize specific roles
function authorizeRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied: insufficient permissions.' });
    }
    next();
  };
}

/**
 * POST /api/notifications/acknowledge
 * Acknowledges an active emergency incident
 */
router.post('/acknowledge', authenticateJWT, async (req, res) => {
  const { incidentId } = req.body;
  
  if (!incidentId) {
    return res.status(400).json({ error: 'Incident ID is required.' });
  }

  try {
    // 1. Verify incident exists
    const [incidents] = await db.query('SELECT * FROM incidents WHERE id = ?', [incidentId]);
    if (incidents.length === 0) {
      return res.status(404).json({ error: 'Incident not found.' });
    }

    const incident = incidents[0];

    // 2. Check if already acknowledged
    const [existing] = await db.query(
      'SELECT id FROM incident_acknowledgements WHERE incident_id = ?',
      [incidentId]
    );

    if (existing.length > 0) {
      return res.status(200).json({ 
        message: 'Incident already acknowledged.', 
        alreadyAcknowledged: true 
      });
    }

    // 3. Insert acknowledgement log
    await db.query(
      'INSERT INTO incident_acknowledgements (incident_id, admin_id, status) VALUES (?, ?, "acknowledged")',
      [incidentId, req.user.id]
    );

    // 4. Update incident status to 'verified' if it is currently 'reported'
    // This allows proceeding with alerting emergency services on the dashboard
    if (incident.status === 'reported') {
      await db.query(
        'UPDATE incidents SET status = "verified" WHERE id = ?',
        [incidentId]
      );
      // Emit incident_status_change so the UI registers it immediately
      const io = alarmGateway.io;
      if (io) {
        io.emit('incident_status_change', { incidentId, status: 'verified' });
      }
    }

    // 5. Add event to timeline
    await db.addTimelineEvent(
      incidentId,
      'acknowledged',
      `Incident acknowledged by ${req.user.email} (${req.user.role.replace('_', ' ')}).`
    );

    // 6. Silence active sirens on the WebSocket network
    alarmGateway.silenceAlarm(incidentId);

    // 7. Broadcast socket confirmation event
    const io = alarmGateway.io;
    if (io) {
      io.emit('incident_acknowledged', {
        incidentId,
        adminId: req.user.id,
        status: 'acknowledged',
        acknowledgedBy: req.user.email
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Incident acknowledged successfully.',
      incidentId
    });

  } catch (err) {
    console.error('[NotificationRouter] Acknowledge error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

/**
 * GET /api/notifications/status
 * Retrieves statuses of online admins (for monitoring panel)
 */
router.get('/status', authenticateJWT, (req, res) => {
  try {
    const statuses = socketNotificationService.getActiveStatuses();
    return res.status(200).json({ success: true, statuses });
  } catch (err) {
    console.error('[NotificationRouter] Get status error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
