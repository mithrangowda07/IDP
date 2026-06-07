const socketIo = require('socket.io');
const axios = require('axios');
const db = require('./db');

let io;
const activeSimulations = {}; // dispatchId -> intervalInfo
const SIGNAL_CLEARANCE_DISTANCE_METERS = 300;
const SIGNAL_ROUTE_MATCH_DISTANCE_METERS = parseInt(process.env.SIGNAL_ROUTE_MATCH_DISTANCE_METERS || '0', 10);
const OVERPASS_API_URL = process.env.OVERPASS_API_URL || 'https://overpass-api.de/api/interpreter';
const USE_SYNTHETIC_SIGNAL_FALLBACK = process.env.USE_SYNTHETIC_SIGNAL_FALLBACK === 'true';

function getDistanceMeters(a, b) {
  const earthRadiusMeters = 6371000;
  const lat1 = parseFloat(a.lat) * Math.PI / 180;
  const lat2 = parseFloat(b.lat) * Math.PI / 180;
  const deltaLat = (parseFloat(b.lat) - parseFloat(a.lat)) * Math.PI / 180;
  const deltaLng = (parseFloat(b.lng) - parseFloat(a.lng)) * Math.PI / 180;
  const h =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;

  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function getCumulativeRouteDistances(route) {
  const distances = [0];
  for (let i = 1; i < route.length; i++) {
    distances.push(distances[i - 1] + getDistanceMeters(route[i - 1], route[i]));
  }
  return distances;
}

function generateSyntheticSignals(dispatchId, route, routeDistances) {
  const totalDistance = routeDistances[routeDistances.length - 1] || 0;
  const targetDistances = [];

  for (let distance = 300; distance < totalDistance - 100; distance += 450) {
    targetDistances.push(distance);
  }

  if (targetDistances.length === 0 && route.length > 2) {
    targetDistances.push(totalDistance / 2);
  }

  return targetDistances.slice(0, 12).map((targetDistance, index) => {
    let routeIndex = routeDistances.findIndex(distance => distance >= targetDistance);
    if (routeIndex < 0) routeIndex = route.length - 1;

    return {
      id: `sig-${dispatchId}-${index}`,
      lat: route[routeIndex].lat,
      lng: route[routeIndex].lng,
      routeIndex,
      distanceAlongRoute: routeDistances[routeIndex],
      source: 'synthetic',
      status: 'normal'
    };
  });
}

function toRoutePoint(point) {
  return {
    lat: parseFloat(point.lat),
    lng: parseFloat(point.lng)
  };
}

function projectToMeters(point, originLat) {
  const metersPerDegreeLat = 111320;
  const metersPerDegreeLng = 111320 * Math.cos(originLat * Math.PI / 180);
  return {
    x: point.lng * metersPerDegreeLng,
    y: point.lat * metersPerDegreeLat
  };
}

function getPointToSegmentDistanceMeters(point, segmentStart, segmentEnd, originLat) {
  const p = projectToMeters(point, originLat);
  const a = projectToMeters(segmentStart, originLat);
  const b = projectToMeters(segmentEnd, originLat);
  const dx = b.x - a.x;
  const dy = b.y - a.y;

  if (dx === 0 && dy === 0) {
    return Math.hypot(p.x - a.x, p.y - a.y);
  }

  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  const projection = {
    x: a.x + t * dx,
    y: a.y + t * dy
  };

  return Math.hypot(p.x - projection.x, p.y - projection.y);
}

function getSignalRouteMatch(signalPoint, route, routeDistances) {
  const originLat = route.reduce((sum, point) => sum + parseFloat(point.lat), 0) / route.length;
  let bestMatch = {
    distanceToRoute: Number.POSITIVE_INFINITY,
    routeIndex: 0,
    distanceAlongRoute: 0
  };

  for (let i = 1; i < route.length; i++) {
    const segmentStart = toRoutePoint(route[i - 1]);
    const segmentEnd = toRoutePoint(route[i]);
    const distanceToRoute = getPointToSegmentDistanceMeters(signalPoint, segmentStart, segmentEnd, originLat);

    if (distanceToRoute < bestMatch.distanceToRoute) {
      bestMatch = {
        distanceToRoute,
        routeIndex: i,
        distanceAlongRoute: routeDistances[i]
      };
    }
  }

  return bestMatch;
}

function getRouteBoundingBox(route, paddingDegrees = 0.003) {
  const coordinates = route.map(toRoutePoint);
  const lats = coordinates.map(point => point.lat);
  const lngs = coordinates.map(point => point.lng);

  return {
    south: Math.min(...lats) - paddingDegrees,
    west: Math.min(...lngs) - paddingDegrees,
    north: Math.max(...lats) + paddingDegrees,
    east: Math.max(...lngs) + paddingDegrees
  };
}

async function fetchSignalsOnRoute(dispatchId, route, routeDistances) {
  if (!Array.isArray(route) || route.length < 2) return [];

  const bbox = getRouteBoundingBox(route);
  const query = `
    [out:json][timeout:10];
    node["highway"="traffic_signals"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
    out body;
  `;

  const response = await axios.post(OVERPASS_API_URL, new URLSearchParams({ data: query }).toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'IDP-Green-Corridor/1.0'
    },
    timeout: 12000
  });

  const seenNodeIds = new Set();
  const candidates = (response.data?.elements || [])
    .filter(element => element.type === 'node' && Number.isFinite(element.lat) && Number.isFinite(element.lon))
    .map((element) => {
      const signalPoint = { lat: element.lat, lng: element.lon };
      const match = getSignalRouteMatch(signalPoint, route, routeDistances);
      return {
        id: `osm-sig-${dispatchId}-${element.id}`,
        osmId: element.id,
        lat: parseFloat(element.lat.toFixed(6)),
        lng: parseFloat(element.lon.toFixed(6)),
        routeIndex: match.routeIndex,
        distanceAlongRoute: match.distanceAlongRoute,
        distanceToRoute: Math.round(match.distanceToRoute),
        source: 'osm',
        status: 'normal'
      };
    })
    .filter((signal) => {
      if (seenNodeIds.has(signal.osmId)) return false;
      seenNodeIds.add(signal.osmId);
      return signal.distanceToRoute <= SIGNAL_ROUTE_MATCH_DISTANCE_METERS;
    })
    .sort((a, b) => a.distanceAlongRoute - b.distanceAlongRoute)
    .slice(0, 30);

  console.log(
    `OSM traffic signals for dispatch ${dispatchId}: ` +
    `${response.data?.elements?.length || 0} fetched, ${candidates.length} matched within ${SIGNAL_ROUTE_MATCH_DISTANCE_METERS}m`
  );

  return candidates;
}

async function generateSignals(dispatchId, route, routeDistances) {
  try {
    const realSignals = await fetchSignalsOnRoute(dispatchId, route, routeDistances);
    if (realSignals.length > 0) {
      return realSignals;
    }
    console.warn(`No OSM traffic signals found on route for dispatch ${dispatchId}.`);
  } catch (err) {
    console.warn(`Failed to fetch OSM traffic signals for dispatch ${dispatchId}.`, err.message);
  }

  if (USE_SYNTHETIC_SIGNAL_FALLBACK) {
    console.warn(`Using synthetic traffic signals for dispatch ${dispatchId} because USE_SYNTHETIC_SIGNAL_FALLBACK=true.`);
    return generateSyntheticSignals(dispatchId, route, routeDistances);
  }

  return [];
}

function updateSignalStates(signals, vehicleDistance) {
  return signals.map(signal => {
    const distanceAhead = signal.distanceAlongRoute - vehicleDistance;
    return {
      ...signal,
      distanceAhead: Math.max(0, Math.round(distanceAhead)),
      status: distanceAhead >= 0 && distanceAhead <= SIGNAL_CLEARANCE_DISTANCE_METERS
        ? 'green'
        : 'normal'
    };
  });
}

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

    const routeDistances = getCumulativeRouteDistances(route);
    let signals = updateSignalStates(
      await generateSignals(dispatchId, route, routeDistances),
      routeDistances[0]
    );

    await db.query('UPDATE green_corridors SET signals_state = ? WHERE id = ?', [JSON.stringify(signals), corridorId]);

    // Broadcast initial state
    io.emit('incident_status_change', { incidentId: dispatch.incident_id, status: 'en_route' });
    io.emit('vehicle_status_change', { vehicleId: dispatch.vehicle_id, status: 'en_route' });
    io.emit('green_corridor_update', {
      dispatchId,
      incidentType: dispatch.i_type,
      serviceType: dispatch.s_type,
      vehicleId: dispatch.vehicle_id,
      status: 'active',
      signals,
      route
    });
    io.emit('vehicle_tracking_update', {
      vehicleId: dispatch.vehicle_id,
      latitude: route[0].lat,
      longitude: route[0].lng,
      status: 'en_route',
      progress: 0,
      dispatchId
    });

    let currentIndex = 0;
    const N = route.length;

    const intervalId = setInterval(async () => {
      const nextDistance = routeDistances[currentIndex] + 350;
      const nextIndex = routeDistances.findIndex((distance, index) =>
        index > currentIndex && distance >= nextDistance
      );
      currentIndex = nextIndex === -1 ? N - 1 : nextIndex;

      const pt = route[currentIndex];
      const progress = (currentIndex / (N - 1)) * 100;

      // Update vehicle location in DB
      await db.query('UPDATE vehicles SET latitude = ?, longitude = ? WHERE id = ?', [pt.lat, pt.lng, dispatch.vehicle_id]);
      // Log location history
      await db.query('INSERT INTO vehicle_tracking (vehicle_id, latitude, longitude) VALUES (?, ?, ?)', [dispatch.vehicle_id, pt.lat, pt.lng]);

      signals = updateSignalStates(signals, routeDistances[currentIndex]);
      await db.query(
        'UPDATE green_corridors SET signals_state = ? WHERE id = ?',
        [JSON.stringify(signals), corridorId]
      );
      
      // Broadcast vehicle location and corridor state
      io.emit('vehicle_tracking_update', {
        vehicleId: dispatch.vehicle_id,
        latitude: pt.lat,
        longitude: pt.lng,
        status: 'en_route',
        progress,
        dispatchId
      });
      io.emit('green_corridor_update', {
        dispatchId,
        incidentType: dispatch.i_type,
        serviceType: dispatch.s_type,
        vehicleId: dispatch.vehicle_id,
        status: 'active',
        signals,
        route
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
        io.emit('green_corridor_update', {
          dispatchId,
          incidentType: dispatch.i_type,
          serviceType: dispatch.s_type,
          vehicleId: dispatch.vehicle_id,
          status: 'inactive',
          signals: [],
          route: []
        });
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
