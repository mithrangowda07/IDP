const socketIo = require('socket.io');
const db = require('./db');

let io;
const activeSimulations = {}; // dispatchId -> intervalInfo

function initSocket(server) {
  io = socketIo(server, {
    cors: {
      origin: '*', // Allow React app connections
      methods: ['GET', 'POST']
    }
  });

  io.on('connection', (socket) => {
    console.log(`Socket client connected: ${socket.id}`);

    // Join room based on user role or custom room
    socket.on('join_role', (role) => {
      socket.join(role);
      console.log(`Socket ${socket.id} joined role room: ${role}`);
    });

    socket.on('disconnect', () => {
      console.log(`Socket client disconnected: ${socket.id}`);
    });
  });

  return io;
}

function getIo() {
  return io;
}

// Socket emitter helper functions
function broadcastNewIncident(incident) {
  if (!io) return;
  if (incident.type === 'accident' || incident.type === 'medical_emergency') {
    io.to('medical_admin').emit('new_incident', incident);
  } else if (incident.type === 'fire' || incident.type === 'gas_leak') {
    io.to('fire_admin').emit('new_incident', incident);
  }
  io.to('citizen_user').emit('incident_status_change', { incidentId: incident.id, status: incident.status });
}

function broadcastNewRegistration(service) {
  if (!io) return;
  // Send to traffic and other admins
  io.to('traffic_admin').to('medical_admin').to('fire_admin').emit('new_registration', service);
}

function broadcastRegistrationApproval(serviceId, status) {
  if (!io) return;
  io.emit('registration_approval_update', { serviceId, status });
}

function broadcastServiceAlerted(dispatch, incident) {
  if (!io) return;
  // Notify hospital or fire station room
  const targetRoom = dispatch.service_type === 'hospital' ? 'hospital_user' : 'fire_station_user';
  io.to(targetRoom).emit('new_alert', { dispatch, incident });
  // Notify admins and citizens
  io.emit('incident_status_change', { incidentId: incident.id, status: 'service_alerted' });
}

function broadcastVehicleDispatched(dispatch, vehicle, incident) {
  if (!io) return;
  io.emit('vehicle_dispatched', { dispatch, vehicle, incident });
  io.emit('incident_status_change', { incidentId: incident.id, status: 'vehicle_dispatched' });
  io.emit('vehicle_status_change', { vehicleId: vehicle.id, status: 'dispatched' });
}

// Simulated GPS Tracking and Green Corridor Simulation Loop
async function startTrackingSimulation(dispatchId) {
  if (activeSimulations[dispatchId]) {
    clearInterval(activeSimulations[dispatchId].intervalId);
  }

  try {
    // 1. Fetch dispatch details
    const [dispatches] = await db.query(
      `SELECT d.*, s.latitude as s_lat, s.longitude as s_lng, s.type as s_type, 
              i.latitude as i_lat, i.longitude as i_lng, i.type as i_type
       FROM dispatches d
       JOIN services s ON d.service_id = s.id
       JOIN incidents i ON d.incident_id = i.id
       WHERE d.id = ?`,
      [dispatchId]
    );

    if (dispatches.length === 0) return;
    const dispatch = dispatches[0];

    // Parse route geometry
    let route = [];
    try {
      route = JSON.parse(dispatch.route_geometry);
    } catch (e) {
      console.error('Failed to parse route geometry', e);
      return;
    }

    if (!route || route.length === 0) return;

    // Set vehicle status to en_route, incident status to en_route
    await db.query('UPDATE vehicles SET status = "en_route" WHERE id = ?', [dispatch.vehicle_id]);
    await db.query('UPDATE incidents SET status = "en_route" WHERE id = ?', [dispatch.incident_id]);
    await db.query('UPDATE dispatches SET status = "en_route" WHERE id = ?', [dispatchId]);

    // Insert green corridor record
    const [corridorResult] = await db.query(
      'INSERT INTO green_corridors (dispatch_id, status, signals_state) VALUES (?, "active", ?)',
      [dispatchId, JSON.stringify([])]
    );
    const corridorId = corridorResult.insertId;

    // Generate simulated signals along route (e.g. at index 25%, 50%, 75%)
    const signalIndices = [
      Math.floor(route.length * 0.25),
      Math.floor(route.length * 0.50),
      Math.floor(route.length * 0.75)
    ].filter(idx => idx > 0 && idx < route.length - 1);

    const signals = signalIndices.map((idx, index) => ({
      id: `sig-${dispatchId}-${index}`,
      lat: route[idx].lat,
      lng: route[idx].lng,
      status: 'green' // Turned green automatically due to green corridor
    }));

    await db.query('UPDATE green_corridors SET signals_state = ? WHERE id = ?', [JSON.stringify(signals), corridorId]);

    // Broadcast initial state
    io.emit('incident_status_change', { incidentId: dispatch.incident_id, status: 'en_route' });
    io.emit('vehicle_status_change', { vehicleId: dispatch.vehicle_id, status: 'en_route' });
    io.emit('green_corridor_update', { dispatchId, status: 'active', signals, route });

    let currentIndex = 0;
    const N = route.length;
    // Advance index so we reach destination in ~10 steps (every 5 seconds)
    const stepSize = Math.max(1, Math.ceil(N / 10));

    const intervalId = setInterval(async () => {
      currentIndex += stepSize;
      if (currentIndex >= N - 1) {
        currentIndex = N - 1;
      }

      const pt = route[currentIndex];
      const progress = (currentIndex / (N - 1)) * 100;

      // Update vehicle location in DB
      await db.query('UPDATE vehicles SET latitude = ?, longitude = ? WHERE id = ?', [pt.lat, pt.lng, dispatch.vehicle_id]);
      // Log location history
      await db.query('INSERT INTO vehicle_tracking (vehicle_id, latitude, longitude) VALUES (?, ?, ?)', [dispatch.vehicle_id, pt.lat, pt.lng]);

      // Dynamic signal updates (simulate turning green as vehicle approaches and returning to normal or showing active green)
      // For this simulation, they are all green along the corridor.
      
      // Broadcast vehicle location and corridor state
      io.emit('vehicle_tracking_update', {
        vehicleId: dispatch.vehicle_id,
        latitude: pt.lat,
        longitude: pt.lng,
        status: 'en_route',
        progress,
        dispatchId
      });

      // If reached destination
      if (currentIndex >= N - 1) {
        clearInterval(intervalId);
        delete activeSimulations[dispatchId];

        // Update DB
        await db.query('UPDATE vehicles SET status = "at_scene" WHERE id = ?', [dispatch.vehicle_id]);
        await db.query('UPDATE incidents SET status = "at_scene" WHERE id = ?', [dispatch.incident_id]);
        await db.query('UPDATE dispatches SET status = "at_scene" WHERE id = ?', [dispatchId]);
        await db.query('UPDATE green_corridors SET status = "inactive" WHERE id = ?', [corridorId]);

        // Broadcast destination reached
        io.emit('vehicle_status_change', { vehicleId: dispatch.vehicle_id, status: 'at_scene' });
        io.emit('incident_status_change', { incidentId: dispatch.incident_id, status: 'at_scene' });
        io.emit('green_corridor_update', { dispatchId, status: 'inactive', signals: [], route: [] });
      }
    }, 5000);

    activeSimulations[dispatchId] = { intervalId, corridorId, route };

  } catch (err) {
    console.error('Error in startTrackingSimulation:', err);
  }
}

async function startReturnSimulation(dispatchId) {
  try {
    const [dispatches] = await db.query(
      `SELECT d.*, s.latitude as s_lat, s.longitude as s_lng
       FROM dispatches d
       JOIN services s ON d.service_id = s.id
       WHERE d.id = ?`,
      [dispatchId]
    );

    if (dispatches.length === 0) return;
    const dispatch = dispatches[0];

    // Load original route and reverse it
    let route = [];
    try {
      route = JSON.parse(dispatch.route_geometry);
    } catch (e) {
      console.error('Failed to parse route', e);
      return;
    }

    if (!route || route.length === 0) {
      // Just simulate straight line
      route = [
        { lat: dispatch.latitude, lng: dispatch.longitude },
        { lat: dispatch.s_lat, lng: dispatch.s_lng }
      ];
    }

    const returnRoute = route.slice().reverse();

    // Set status
    await db.query('UPDATE vehicles SET status = "returning" WHERE id = ?', [dispatch.vehicle_id]);
    await db.query('UPDATE dispatches SET status = "returning" WHERE id = ?', [dispatchId]);
    
    io.emit('vehicle_status_change', { vehicleId: dispatch.vehicle_id, status: 'returning' });

    let currentIndex = 0;
    const N = returnRoute.length;
    const stepSize = Math.max(1, Math.ceil(N / 10));

    const intervalId = setInterval(async () => {
      currentIndex += stepSize;
      if (currentIndex >= N - 1) {
        currentIndex = N - 1;
      }

      const pt = returnRoute[currentIndex];
      const progress = (currentIndex / (N - 1)) * 100;

      // Update vehicle location in DB
      await db.query('UPDATE vehicles SET latitude = ?, longitude = ? WHERE id = ?', [pt.lat, pt.lng, dispatch.vehicle_id]);
      await db.query('INSERT INTO vehicle_tracking (vehicle_id, latitude, longitude) VALUES (?, ?, ?)', [dispatch.vehicle_id, pt.lat, pt.lng]);

      io.emit('vehicle_tracking_update', {
        vehicleId: dispatch.vehicle_id,
        latitude: pt.lat,
        longitude: pt.lng,
        status: 'returning',
        progress,
        dispatchId
      });

      if (currentIndex >= N - 1) {
        clearInterval(intervalId);
        
        // Return completed, vehicle available
        await db.query('UPDATE vehicles SET status = "available", latitude = ?, longitude = ? WHERE id = ?', [dispatch.s_lat, dispatch.s_lng, dispatch.vehicle_id]);
        await db.query('UPDATE dispatches SET status = "completed" WHERE id = ?', [dispatchId]);

        io.emit('vehicle_status_change', { vehicleId: dispatch.vehicle_id, status: 'available', latitude: dispatch.s_lat, longitude: dispatch.s_lng });
      }
    }, 5000);

  } catch (err) {
    console.error('Error in startReturnSimulation:', err);
  }
}

module.exports = {
  initSocket,
  getIo,
  broadcastNewIncident,
  broadcastNewRegistration,
  broadcastRegistrationApproval,
  broadcastServiceAlerted,
  broadcastVehicleDispatched,
  startTrackingSimulation,
  startReturnSimulation
};
