const db = require('../db');

// In-memory states for active operators
// socketId -> { userId, role, status }
const activeSockets = new Map();

// userId -> { role, status, socketIds: Set }
const activeUsers = new Map();

class SocketNotificationService {
  constructor() {
    this.io = null;
  }

  /**
   * Set Socket.IO instance
   * @param {object} io - Socket.IO server instance
   */
  setIo(io) {
    this.io = io;
  }

  /**
   * Register active Socket.IO listeners
   * @param {object} socket - Socket instance
   */
  registerSocket(socket) {
    // When an admin goes online or connects
    socket.on('admin_online', async ({ userId, role }) => {
      console.log(`[SocketNotificationService] User ${userId} (${role}) is ONLINE (Socket: ${socket.id})`);
      
      // Update session map
      activeSockets.set(socket.id, { userId, role, status: 'online' });
      
      // Update user map
      if (!activeUsers.has(userId)) {
        activeUsers.set(userId, {
          role,
          status: 'online',
          socketIds: new Set([socket.id])
        });
      } else {
        const user = activeUsers.get(userId);
        user.status = 'online';
        user.socketIds.add(socket.id);
      }

      // Join room for their role
      socket.join(role);

      // Broadcast update to all clients
      if (this.io) {
        this.io.emit('status_update', {
          userId,
          role,
          status: 'online'
        });
      }
    });

    // When an admin is idle
    socket.on('admin_idle', ({ userId }) => {
      console.log(`[SocketNotificationService] User ${userId} is IDLE (Socket: ${socket.id})`);
      
      const session = activeSockets.get(socket.id);
      if (session) {
        session.status = 'idle';
      }

      const user = activeUsers.get(userId);
      if (user) {
        user.status = 'idle';
        if (this.io) {
          this.io.emit('status_update', {
            userId,
            role: user.role,
            status: 'idle'
          });
        }
      }
    });

    // Explicit offline command (like logout)
    socket.on('admin_offline', ({ userId }) => {
      console.log(`[SocketNotificationService] User ${userId} is OFFLINE (Socket: ${socket.id})`);
      this.handleUserOffline(socket.id, userId);
    });

    // Handle connection drops
    socket.on('disconnect', () => {
      const session = activeSockets.get(socket.id);
      if (session) {
        console.log(`[SocketNotificationService] Socket ${socket.id} disconnected. User ${session.userId} offline check.`);
        this.handleUserOffline(socket.id, session.userId);
      }
    });
  }

  /**
   * Helper to clean up user sessions and broadcast offline status
   */
  handleUserOffline(socketId, userId) {
    activeSockets.delete(socketId);
    
    const user = activeUsers.get(userId);
    if (user) {
      user.socketIds.delete(socketId);
      
      // If no remaining active sockets, they are fully offline
      if (user.socketIds.size === 0) {
        activeUsers.delete(userId);
        console.log(`[SocketNotificationService] User ${userId} is fully OFFLINE`);
        if (this.io) {
          this.io.emit('status_update', {
            userId,
            role: user.role,
            status: 'offline'
          });
        }
      }
    }
  }

  /**
   * Check if a specific role is currently online or idle
   * @param {string} role - Admin role name
   * @returns {boolean} True if at least one socket of that role is online/idle
   */
  isRoleOnline(role) {
    for (const [_, session] of activeSockets.entries()) {
      if (session.role === role) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get all active operators' statuses
   * @returns {Array} List of active users
   */
  getActiveStatuses() {
    const statuses = [];
    activeUsers.forEach((value, key) => {
      statuses.push({
        userId: key,
        role: value.role,
        status: value.status
      });
    });
    return statuses;
  }

  /**
   * Route incident alert, notifying alternative admins if the primary admin is offline.
   * @param {object} incident - Incident data structure
   */
  async routeIncidentAlert(incident) {
    if (!this.io) return;

    let targetRole = '';
    if (['fire', 'gas_leak', 'building_collapse'].includes(incident.type)) {
      targetRole = 'fire_admin';
    } else {
      targetRole = 'medical_admin';
    }

    const isPrimaryOnline = this.isRoleOnline(targetRole);

    if (isPrimaryOnline) {
      // Primary admin is online, standard emit to target role
      console.log(`[SocketNotificationService] Routing incident ${incident.id} to primary role: ${targetRole}`);
      this.io.to(targetRole).emit('new_incident', incident);
    } else {
      // Primary admin offline! Route to other available admins
      console.warn(`[SocketNotificationService] Primary admin role "${targetRole}" is offline! Routing to alternative admins...`);
      
      const altAdmins = ['medical_admin', 'fire_admin', 'traffic_admin'].filter(r => r !== targetRole);
      let routedTo = [];

      for (const altRole of altAdmins) {
        if (this.isRoleOnline(altRole)) {
          this.io.to(altRole).emit('new_incident', incident);
          routedTo.push(altRole);
        }
      }

      // Log route override to audit/timeline
      const routeText = routedTo.length > 0 
        ? `routed to alternative online admins: [${routedTo.join(', ')}]`
        : 'no online admins available';
      
      await db.addTimelineEvent(
        incident.id, 
        'routing_escalation', 
        `Primary admin (${targetRole}) is offline. Incident ${routeText}.`
      );

      // In case nobody is online, broadcast it to all connections so it's visible on reconnect
      if (routedTo.length === 0) {
        console.warn(`[SocketNotificationService] Absolutely no admins online for incident ${incident.id}.`);
        this.io.emit('new_incident', incident);
      }
    }
  }
}

module.exports = new SocketNotificationService();
