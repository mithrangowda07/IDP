const db = require('../db');
const notificationService = require('./NotificationService');

class EscalationService {
  constructor() {
    this.io = null;
    this.checkIntervalId = null;
  }

  /**
   * Set Socket.IO instance and start the background checker
   */
  start(io) {
    this.io = io;
    if (this.checkIntervalId) {
      clearInterval(this.checkIntervalId);
    }
    
    // Run checks every 5 seconds
    this.checkIntervalId = setInterval(() => this.checkEscalations(), 5000);
    console.log('[EscalationService] Background escalation checker started (5s interval)');
  }

  /**
   * Stop the background checker
   */
  stop() {
    if (this.checkIntervalId) {
      clearInterval(this.checkIntervalId);
      this.checkIntervalId = null;
      console.log('[EscalationService] Background escalation checker stopped');
    }
  }

  /**
   * Fetch active, unacknowledged incidents and check if they require escalation
   */
  async checkEscalations() {
    if (!this.io) return;

    try {
      // Query incidents that are in 'reported' or other active states and do NOT have an acknowledgement entry
      const [unacknowledged] = await db.query(`
        SELECT i.* 
        FROM incidents i
        LEFT JOIN incident_acknowledgements a ON i.id = a.incident_id
        WHERE a.id IS NULL 
          AND i.status IN ('reported', 'verified')
      `);

      if (unacknowledged.length === 0) return;

      const now = Date.now();

      for (const incident of unacknowledged) {
        const createdAtTime = new Date(incident.created_at).getTime();
        const elapsedSeconds = Math.floor((now - createdAtTime) / 1000);

        // Fetch already triggered escalations for this incident to avoid duplicate triggers
        const [existingEscalations] = await db.query(
          'SELECT escalation_level FROM incident_escalations WHERE incident_id = ?',
          [incident.id]
        );
        const triggeredLevels = new Set(existingEscalations.map(e => e.escalation_level));

        // Determine target escalation level based on age
        // 60s -> Level 1 (Notify Hospital Admin / medical_admin)
        // 90s -> Level 2 (Notify Fire Admin / fire_admin)
        // 120s -> Level 3 (Notify Traffic Admin / traffic_admin)
        // 180s -> Level 4 (Notify all online operators)
        if (elapsedSeconds >= 180 && !triggeredLevels.has(4)) {
          await this.escalate(incident, 4, 'all_operators', 'All Online Operators', 180);
        } else if (elapsedSeconds >= 120 && !triggeredLevels.has(3)) {
          await this.escalate(incident, 3, 'traffic_admin', 'Traffic Admin', 120);
        } else if (elapsedSeconds >= 90 && !triggeredLevels.has(2)) {
          await this.escalate(incident, 2, 'fire_admin', 'Fire Admin', 90);
        } else if (elapsedSeconds >= 60 && !triggeredLevels.has(1)) {
          await this.escalate(incident, 1, 'medical_admin', 'Hospital Admin', 60);
        }
      }
    } catch (err) {
      console.error('[EscalationService] Error running checkEscalations:', err);
    }
  }

  /**
   * Perform escalation for a specific incident
   */
  async escalate(incident, level, targetRole, label, limitSeconds) {
    console.log(`[EscalationService] Escalating incident #${incident.id} to Level ${level} (${label}) - Elapsed: ${limitSeconds}s`);

    try {
      // 1. Store escalation log in database
      await db.query(
        'INSERT INTO incident_escalations (incident_id, escalation_level, escalated_to_role, status) VALUES (?, ?, ?, "escalated")',
        [incident.id, level, targetRole]
      );

      // 2. Add Timeline event
      await db.addTimelineEvent(
        incident.id,
        `escalation_level_${level}`,
        `Incident escalated to Level ${level} (${label}) due to lack of acknowledgement within ${limitSeconds} seconds.`
      );

      // 3. Emit Socket.IO event escalation_alert
      const alertPayload = {
        incidentId: incident.id,
        incidentType: incident.type,
        incident,
        level,
        targetRole,
        label,
        limitSeconds
      };

      if (targetRole === 'all_operators') {
        // Emit to all admin and service rooms
        const rooms = ['medical_admin', 'fire_admin', 'traffic_admin', 'hospital_user', 'fire_station_user'];
        rooms.forEach(room => this.io.to(room).emit('escalation_alert', alertPayload));
      } else {
        // Emit to target room
        this.io.to(targetRole).emit('escalation_alert', alertPayload);
      }

      // Also trigger a play_alarm signal on the newly notified role so their dashboards start sirens
      if (targetRole === 'all_operators') {
        this.io.emit('play_alarm', {
          incidentId: incident.id,
          incidentType: incident.type,
          incident
        });
      } else {
        this.io.to(targetRole).emit('play_alarm', {
          incidentId: incident.id,
          incidentType: incident.type,
          incident
        });
      }

      // 4. Trigger Backup Notifications (SMS, Email, WhatsApp)
      await this.triggerBackupNotifications(incident, level, label);

    } catch (err) {
      console.error(`[EscalationService] Failed to escalate incident #${incident.id} to Level ${level}:`, err);
    }
  }

  /**
   * Send backup alerts based on escalation target
   */
  async triggerBackupNotifications(incident, level, label) {
    try {
      const msg = `🚨 EMERGENCY ESCALATION (Level ${level}): Incident #${incident.id} (${incident.type.toUpperCase()}) at location [${incident.latitude}, ${incident.longitude}] has been ignored for too long. Action required immediately.`;

      // Load Coordinator Contacts from settings
      const [medicalPhoneSetting] = await db.query("SELECT setting_value FROM system_settings WHERE setting_key = 'medical_emergency_coordinator_phone'");
      const [firePhoneSetting] = await db.query("SELECT setting_value FROM system_settings WHERE setting_key = 'fire_emergency_coordinator_phone'");

      const medicalPhone = medicalPhoneSetting[0]?.setting_value || '';
      const firePhone = firePhoneSetting[0]?.setting_value || '';

      if (level === 1) {
        // Level 1: Medical / Hospital Coordinator
        if (medicalPhone) {
          await notificationService.sendSMS(medicalPhone, msg);
          await notificationService.sendWhatsApp(medicalPhone, msg);
        }
        await notificationService.sendEmail('hospital_coordinator@idp.com', '🚨 Urgent Emergency Alert Escalation', msg);
      } else if (level === 2) {
        // Level 2: Fire Station Coordinator
        if (firePhone) {
          await notificationService.sendSMS(firePhone, msg);
          await notificationService.sendWhatsApp(firePhone, msg);
        }
        await notificationService.sendEmail('fire_coordinator@idp.com', '🚨 Urgent Fire Alert Escalation', msg);
      } else if (level === 3) {
        // Level 3: Traffic Admin Coordinator
        await notificationService.sendSMS('+910000000003', msg);
        await notificationService.sendEmail('traffic_coordinator@idp.com', '🚨 Traffic Routing Alert Escalation', msg);
      } else if (level === 4) {
        // Level 4: All operators push notification simulation
        await notificationService.sendPush('all_admins', '🚨 CRITICAL ESCALATION', msg);
        await notificationService.sendEmail('all_operators@idp.com', '🚨 CRITICAL: Unhandled Emergency Alert', msg);
      }
    } catch (err) {
      console.warn('[EscalationService] Backup notification trigger warning:', err.message);
    }
  }
}

module.exports = new EscalationService();
