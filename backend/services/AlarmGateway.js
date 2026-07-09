const socketNotificationService = require('./SocketNotificationService');

class AlarmGateway {
  constructor() {
    this.io = null;
  }

  /**
   * Set Socket.IO server instance
   * @param {object} io 
   */
  setIo(io) {
    this.io = io;
  }

  /**
   * Broadcast play alarm signal to the appropriate rooms
   * @param {object} incident - Incident details
   */
  triggerAlarm(incident) {
    if (!this.io) return;
    
    let targetRole = '';
    if (['fire', 'gas_leak', 'building_collapse'].includes(incident.type)) {
      targetRole = 'fire_admin';
    } else {
      targetRole = 'medical_admin';
    }

    const isPrimaryOnline = socketNotificationService.isRoleOnline(targetRole);

    console.log(`[AlarmGateway] Triggering alarm for incident: #${incident.id} (${incident.type})`);
    
    // Broadcast play_alarm
    const alarmPayload = {
      incidentId: incident.id,
      incidentType: incident.type,
      incident
    };

    if (isPrimaryOnline) {
      // Send to primary role room
      this.io.to(targetRole).emit('play_alarm', alarmPayload);
    } else {
      // Broadcast to alternative online admins
      const altAdmins = ['medical_admin', 'fire_admin', 'traffic_admin'].filter(r => r !== targetRole);
      for (const altRole of altAdmins) {
        if (socketNotificationService.isRoleOnline(altRole)) {
          this.io.to(altRole).emit('play_alarm', alarmPayload);
        }
      }
    }
  }

  /**
   * Broadcast stop alarm signal to all admins and operators
   * @param {number} incidentId - The incident to silence
   */
  silenceAlarm(incidentId) {
    if (!this.io) return;

    console.log(`[AlarmGateway] Silencing alarm for incident: #${incidentId}`);
    
    // Broadcast stop_alarm to everyone so any console playing it silences it immediately
    this.io.emit('stop_alarm', { incidentId });
  }
}

module.exports = new AlarmGateway();
