const express = require('express');
const http = require('http');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const axios = require('axios');
const path = require('path');
const db = require('./db');
const socketModule = require('./socket');
const minioModule = require('./minioClient');

require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO
const io = socketModule.initSocket(server);

app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'emergency-jwt-super-secret-key-1536';
const PORT = process.env.PORT || 5000;

// Configure Multer for in-memory file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// ==========================================
// MIDDLEWARE
// ==========================================
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

function authorizeRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied: insufficient permissions.' });
    }
    next();
  };
}

// ==========================================
// AUTHENTICATION ROUTES
// ==========================================

// Citizen Registration
app.post('/api/auth/register-citizen', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required.' });
  }

  try {
    const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Email already registered.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // Insert user
    const [userResult] = await db.query(
      'INSERT INTO users (email, password_hash, role, status) VALUES (?, ?, "citizen_user", "active")',
      [email, passwordHash]
    );

    // Insert citizen details
    await db.query(
      'INSERT INTO citizens (user_id, name) VALUES (?, ?)',
      [userResult.insertId, name]
    );

    res.status(201).json({ message: 'Citizen registered successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Hospital Registration
app.post('/api/auth/register-hospital', async (req, res) => {
  const { name, email, password, phone, address, latitude, longitude, vehicles } = req.body;
  if (!name || !email || !password || !phone || !address || latitude === undefined || longitude === undefined) {
    return res.status(400).json({ error: 'All hospital registration fields are required.' });
  }

  try {
    const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Email already registered.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // Insert user with pending status
    const [userResult] = await db.query(
      'INSERT INTO users (email, password_hash, role, status) VALUES (?, ?, "hospital_user", "pending")',
      [email, passwordHash]
    );
    const userId = userResult.insertId;

    // Insert service details
    const [serviceResult] = await db.query(
      'INSERT INTO services (user_id, name, type, phone, address, latitude, longitude, status) VALUES (?, ?, "hospital", ?, ?, ?, ?, "pending")',
      [userId, name, phone, address, latitude, longitude]
    );
    const serviceId = serviceResult.insertId;

    // Add vehicles
    if (vehicles && Array.isArray(vehicles)) {
      for (const v of vehicles) {
        if (v.vehicleId) {
          await db.query(
            'INSERT INTO vehicles (id, service_id, type, status, latitude, longitude) VALUES (?, ?, "ambulance", "available", ?, ?)',
            [v.vehicleId, serviceId, latitude, longitude]
          );
        }
      }
    }

    const newService = {
      id: serviceId,
      name,
      type: 'hospital',
      phone,
      address,
      latitude,
      longitude,
      status: 'pending'
    };

    // Notify admins via Socket.IO
    socketModule.broadcastNewRegistration(newService);

    res.status(201).json({ message: 'Hospital registration submitted. Pending approval.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Fire Station Registration
app.post('/api/auth/register-fire-station', async (req, res) => {
  const { name, email, password, phone, address, latitude, longitude, vehicles } = req.body;
  if (!name || !email || !password || !phone || !address || latitude === undefined || longitude === undefined) {
    return res.status(400).json({ error: 'All fire station registration fields are required.' });
  }

  try {
    const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Email already registered.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // Insert user with pending status
    const [userResult] = await db.query(
      'INSERT INTO users (email, password_hash, role, status) VALUES (?, ?, "fire_station_user", "pending")',
      [email, passwordHash]
    );
    const userId = userResult.insertId;

    // Insert service details
    const [serviceResult] = await db.query(
      'INSERT INTO services (user_id, name, type, phone, address, latitude, longitude, status) VALUES (?, ?, "fire_station", ?, ?, ?, ?, "pending")',
      [userId, name, phone, address, latitude, longitude]
    );
    const serviceId = serviceResult.insertId;

    // Add vehicles
    if (vehicles && Array.isArray(vehicles)) {
      for (const v of vehicles) {
        if (v.vehicleId) {
          await db.query(
            'INSERT INTO vehicles (id, service_id, type, status, latitude, longitude) VALUES (?, ?, "fire_engine", "available", ?, ?)',
            [v.vehicleId, serviceId, latitude, longitude]
          );
        }
      }
    }

    const newService = {
      id: serviceId,
      name,
      type: 'fire_station',
      phone,
      address,
      latitude,
      longitude,
      status: 'pending'
    };

    // Notify admins via Socket.IO
    socketModule.broadcastNewRegistration(newService);

    res.status(201).json({ message: 'Fire Station registration submitted. Pending approval.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Login Page API
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const user = users[0];

    // Check account approval status
    if (user.status === 'pending') {
      return res.status(403).json({ error: 'Account pending admin approval.' });
    }
    if (user.status === 'rejected') {
      return res.status(403).json({ error: 'Account registration has been rejected by admins.' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Fetch details depending on role
    let details = {};
    if (user.role === 'citizen_user') {
      const [cDetails] = await db.query('SELECT * FROM citizens WHERE user_id = ?', [user.id]);
      if (cDetails.length > 0) details = cDetails[0];
    } else if (user.role === 'hospital_user' || user.role === 'fire_station_user') {
      const [sDetails] = await db.query('SELECT * FROM services WHERE user_id = ?', [user.id]);
      if (sDetails.length > 0) details = sDetails[0];
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, serviceId: details.id || null },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        name: details.name || user.email.split('@')[0],
        serviceId: details.id || null
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ==========================================
// ADMIN API
// ==========================================

// Get pending services
app.get('/api/admin/pending-services', authenticateJWT, authorizeRoles('medical_admin', 'fire_admin', 'traffic_admin'), async (req, res) => {
  try {
    const [services] = await db.query('SELECT * FROM services WHERE status = "pending"');
    
    // Add vehicles list to each
    for (const service of services) {
      const [vehicles] = await db.query('SELECT * FROM vehicles WHERE service_id = ?', [service.id]);
      service.vehicles = vehicles;
    }
    
    res.json(services);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Approve service registration
app.post('/api/admin/approve-service', authenticateJWT, authorizeRoles('medical_admin', 'fire_admin', 'traffic_admin'), async (req, res) => {
  const { serviceId } = req.body;
  if (!serviceId) {
    return res.status(400).json({ error: 'Service ID is required.' });
  }

  try {
    const [services] = await db.query('SELECT * FROM services WHERE id = ?', [serviceId]);
    if (services.length === 0) {
      return res.status(404).json({ error: 'Service not found.' });
    }
    const service = services[0];

    // Update status to active in both services and users
    await db.query('UPDATE services SET status = "active" WHERE id = ?', [serviceId]);
    await db.query('UPDATE users SET status = "active" WHERE id = ?', [service.user_id]);

    socketModule.broadcastRegistrationApproval(serviceId, 'active');

    res.json({ message: 'Service registration approved successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Reject service registration
app.post('/api/admin/reject-service', authenticateJWT, authorizeRoles('medical_admin', 'fire_admin', 'traffic_admin'), async (req, res) => {
  const { serviceId } = req.body;
  if (!serviceId) {
    return res.status(400).json({ error: 'Service ID is required.' });
  }

  try {
    const [services] = await db.query('SELECT * FROM services WHERE id = ?', [serviceId]);
    if (services.length === 0) {
      return res.status(404).json({ error: 'Service not found.' });
    }
    const service = services[0];

    await db.query('UPDATE services SET status = "rejected" WHERE id = ?', [serviceId]);
    await db.query('UPDATE users SET status = "rejected" WHERE id = ?', [service.user_id]);

    socketModule.broadcastRegistrationApproval(serviceId, 'rejected');

    res.json({ message: 'Service registration rejected.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ==========================================
// CITIZEN INCIDENT API
// ==========================================

// Report an Incident
app.post('/api/citizen/incidents', authenticateJWT, authorizeRoles('citizen_user'), upload.array('images'), async (req, res) => {
  const { type, latitude, longitude, description } = req.body;
  if (!type || latitude === undefined || longitude === undefined) {
    return res.status(400).json({ error: 'Incident type, latitude, and longitude are required.' });
  }

  try {
    // Insert incident
    const [incidentResult] = await db.query(
      'INSERT INTO incidents (type, latitude, longitude, description, source, reporter_id, status) VALUES (?, ?, ?, ?, "citizen", ?, "reported")',
      [type, latitude, longitude, description || '', req.user.id]
    );
    const incidentId = incidentResult.insertId;

    const imageUrls = [];
    if (req.files && req.files.length > 0) {
      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        const ext = path.extname(file.originalname) || '.jpg';
        const filename = `${incidentId}_img_${Date.now()}_${i}${ext}`;
        const url = await minioModule.uploadFile(file.buffer, filename, file.mimetype);
        
        await db.query('INSERT INTO incident_images (incident_id, image_url) VALUES (?, ?)', [incidentId, url]);
        imageUrls.push(url);
      }
    }

    const [rows] = await db.query('SELECT * FROM incidents WHERE id = ?', [incidentId]);
    const incident = rows[0];
    incident.images = imageUrls;

    // Broadcast new incident using Socket.IO
    socketModule.broadcastNewIncident(incident);

    res.status(201).json(incident);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Get My Reported Incidents
app.get('/api/citizen/my-incidents', authenticateJWT, authorizeRoles('citizen_user'), async (req, res) => {
  try {
    const [incidents] = await db.query(
      'SELECT * FROM incidents WHERE reporter_id = ? ORDER BY created_at DESC',
      [req.user.id]
    );

    // Get images for each
    for (const incident of incidents) {
      const [images] = await db.query('SELECT image_url FROM incident_images WHERE incident_id = ?', [incident.id]);
      incident.images = images.map(img => img.image_url);
    }

    res.json(incidents);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ==========================================
// SENSOR ENDPOINT
// ==========================================

// Sensor Incident Creation (unauthenticated)
app.post('/api/sensors/alert', async (req, res) => {
  const { alert_type, latitude, longitude, timestamp } = req.body;
  if (!alert_type || latitude === undefined || longitude === undefined) {
    return res.status(400).json({ error: 'Alert type, latitude, and longitude are required.' });
  }

  // Validate alert type
  const validTypes = ['fire', 'gas_leak', 'accident'];
  const formattedType = alert_type.toLowerCase().trim().replace(' ', '_');
  if (!validTypes.includes(formattedType)) {
    return res.status(400).json({ error: `Invalid sensor alert type. Must be one of: ${validTypes.join(', ')}` });
  }

  try {
    const description = `Sensor triggered alert of type "${alert_type}" at timestamp ${timestamp || new Date().toISOString()}`;
    const [incidentResult] = await db.query(
      'INSERT INTO incidents (type, latitude, longitude, description, source, reporter_id, status) VALUES (?, ?, ?, ?, "sensor", NULL, "reported")',
      [formattedType, latitude, longitude, description]
    );
    const incidentId = incidentResult.insertId;

    const [rows] = await db.query('SELECT * FROM incidents WHERE id = ?', [incidentId]);
    const incident = rows[0];
    incident.images = [];

    // Broadcast new incident using Socket.IO
    socketModule.broadcastNewIncident(incident);

    res.status(201).json({
      message: 'Sensor incident registered successfully.',
      incident
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ==========================================
// INCIDENTS MANAGEMENT
// ==========================================

// Get incidents filtered by role
app.get('/api/incidents', authenticateJWT, async (req, res) => {
  try {
    let query = 'SELECT * FROM incidents ORDER BY created_at DESC';
    let params = [];

    if (req.user.role === 'medical_admin') {
      query = 'SELECT * FROM incidents WHERE type IN ("accident", "medical_emergency") ORDER BY created_at DESC';
    } else if (req.user.role === 'fire_admin') {
      query = 'SELECT * FROM incidents WHERE type IN ("fire", "gas_leak") ORDER BY created_at DESC';
    }

    const [incidents] = await db.query(query, params);

    for (const incident of incidents) {
      const [images] = await db.query('SELECT image_url FROM incident_images WHERE incident_id = ?', [incident.id]);
      incident.images = images.map(img => img.image_url);
    }

    res.json(incidents);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Get single incident details
app.get('/api/incidents/:id', authenticateJWT, async (req, res) => {
  try {
    const [incidents] = await db.query('SELECT * FROM incidents WHERE id = ?', [req.params.id]);
    if (incidents.length === 0) {
      return res.status(404).json({ error: 'Incident not found.' });
    }
    const incident = incidents[0];

    const [images] = await db.query('SELECT image_url FROM incident_images WHERE incident_id = ?', [incident.id]);
    incident.images = images.map(img => img.image_url);

    // If dispatched, fetch dispatch info
    const [dispatches] = await db.query(
      `SELECT d.*, s.name as service_name, s.type as service_type
       FROM dispatches d
       JOIN services s ON d.service_id = s.id
       WHERE d.incident_id = ?`,
      [incident.id]
    );
    if (dispatches.length > 0) {
      incident.dispatch = dispatches[0];
    }

    res.json(incident);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ==========================================
// SERVICE DISCOVERY & RECOMMENDATION LOGIC
// ==========================================

function getHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
}

app.get('/api/incidents/:id/nearby-services', authenticateJWT, async (req, res) => {
  const incidentId = req.params.id;

  try {
    const [incidents] = await db.query('SELECT * FROM incidents WHERE id = ?', [incidentId]);
    if (incidents.length === 0) {
      return res.status(404).json({ error: 'Incident not found.' });
    }
    const incident = incidents[0];

    // Filter services type: Hospital for Accident/Medical, Fire Station for Fire/Gas leak
    let serviceType = 'hospital';
    if (incident.type === 'fire' || incident.type === 'gas_leak') {
      serviceType = 'fire_station';
    }

    const [services] = await db.query('SELECT * FROM services WHERE type = ? AND status = "active"', [serviceType]);

    // Format services with distance and available vehicles
    const nearbyServices = [];
    for (const service of services) {
      const distance = getHaversineDistance(
        parseFloat(incident.latitude),
        parseFloat(incident.longitude),
        parseFloat(service.latitude),
        parseFloat(service.longitude)
      );

      // Count available vehicles
      const [availableVehicles] = await db.query(
        'SELECT COUNT(*) as count FROM vehicles WHERE service_id = ? AND status = "available"',
        [service.id]
      );

      nearbyServices.push({
        id: service.id,
        name: service.name,
        type: service.type,
        latitude: parseFloat(service.latitude),
        longitude: parseFloat(service.longitude),
        phone: service.phone,
        address: service.address,
        distance: parseFloat(distance.toFixed(2)),
        availableVehicles: availableVehicles[0].count,
        isRecommended: false
      });
    }

    // Sort by distance ascending
    nearbyServices.sort((a, b) => a.distance - b.distance);

    // Identify recommended service: closest with at least 1 available vehicle
    let recommendedFound = false;
    for (const service of nearbyServices) {
      if (!recommendedFound && service.availableVehicles > 0) {
        service.isRecommended = true;
        recommendedFound = true;
      }
    }

    // If none has available vehicles, mark the closest one as recommended anyway or leave as false
    if (!recommendedFound && nearbyServices.length > 0) {
      nearbyServices[0].isRecommended = true;
    }

    res.json(nearbyServices);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ==========================================
// ROUTING & OPENROUTESERVICE API
// ==========================================

async function calculateRoute(startLat, startLng, endLat, endLng) {
  const apiKey = process.env.ORS_API_KEY;

  if (apiKey) {
    try {
      const response = await axios.post(
        'https://api.openrouteservice.org/v2/directions/driving-car',
        {
          coordinates: [[startLng, startLat], [endLng, endLat]]
        },
        {
          headers: {
            'Authorization': apiKey,
            'Content-Type': 'application/json'
          }
        }
      );

      const routeData = response.data;
      if (routeData && routeData.features && routeData.features.length > 0) {
        const feature = routeData.features[0];
        const coordinates = feature.geometry.coordinates; // Array of [lng, lat]
        const points = coordinates.map(coord => ({ lat: coord[1], lng: coord[0] }));
        
        const distanceMeters = feature.properties.summary.distance; // in meters
        const durationSeconds = feature.properties.summary.duration; // in seconds

        return {
          points,
          distance: parseFloat((distanceMeters / 1000).toFixed(2)), // in km
          duration: Math.ceil(durationSeconds / 60) // in minutes
        };
      }
    } catch (err) {
      console.warn('OpenRouteService request failed. Falling back to routing simulator.', err.message);
    }
  }

  // FALLBACK ROUTING SIMULATOR
  // Calculate direct distance
  const distance = getHaversineDistance(startLat, startLng, endLat, endLng);
  // Generate 15 interpolated path nodes with minor zig-zags to look like roads
  const points = [];
  const steps = 15;
  for (let i = 0; i <= steps; i++) {
    const ratio = i / steps;
    let lat = startLat + (endLat - startLat) * ratio;
    let lng = startLng + (endLng - startLng) * ratio;

    // Add noise to simulate streets
    if (i > 0 && i < steps) {
      lat += (Math.random() - 0.5) * 0.0015;
      lng += (Math.random() - 0.5) * 0.0015;
    }
    points.push({ lat: parseFloat(lat.toFixed(6)), lng: parseFloat(lng.toFixed(6)) });
  }

  // Assume avg city speed 40km/h
  const avgSpeedKmh = 40;
  const durationMinutes = Math.max(2, Math.ceil((distance / avgSpeedKmh) * 60));

  return {
    points,
    distance: parseFloat(distance.toFixed(2)),
    duration: durationMinutes
  };
}

// Route check API
app.get('/api/routing/check', authenticateJWT, async (req, res) => {
  const { startLat, startLng, endLat, endLng } = req.query;
  if (startLat === undefined || startLng === undefined || endLat === undefined || endLng === undefined) {
    return res.status(400).json({ error: 'Start and end coordinates are required.' });
  }

  try {
    const route = await calculateRoute(
      parseFloat(startLat),
      parseFloat(startLng),
      parseFloat(endLat),
      parseFloat(endLng)
    );

    const normalEta = route.duration;
    const optimizedEta = Math.ceil(normalEta * 0.65); // 35% time saved
    const timeSaved = normalEta - optimizedEta;

    res.json({
      ...route,
      normalEta,
      optimizedEta,
      timeSaved
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Routing failed.' });
  }
});

// ==========================================
// SERVICE ALERTING & DISPATCH WORKFLOW
// ==========================================

// 1. Admin Alerts Service
app.post('/api/incidents/:id/alert-service', authenticateJWT, authorizeRoles('medical_admin', 'fire_admin'), async (req, res) => {
  const incidentId = req.params.id;
  const { serviceId } = req.body;

  if (!serviceId) {
    return res.status(400).json({ error: 'Service ID is required.' });
  }

  try {
    const [incidents] = await db.query('SELECT * FROM incidents WHERE id = ?', [incidentId]);
    if (incidents.length === 0) {
      return res.status(404).json({ error: 'Incident not found.' });
    }
    const incident = incidents[0];

    const [services] = await db.query('SELECT * FROM services WHERE id = ?', [serviceId]);
    if (services.length === 0) {
      return res.status(404).json({ error: 'Service not found.' });
    }
    const service = services[0];

    // Check if dispatch already exists
    const [existingDispatches] = await db.query('SELECT * FROM dispatches WHERE incident_id = ?', [incidentId]);
    if (existingDispatches.length > 0) {
      return res.status(400).json({ error: 'Service already alerted for this incident.' });
    }

    // Calculate Route and ETA
    const route = await calculateRoute(
      parseFloat(service.latitude),
      parseFloat(service.longitude),
      parseFloat(incident.latitude),
      parseFloat(incident.longitude)
    );

    const normalEta = route.duration;
    const optimizedEta = Math.ceil(normalEta * 0.65);

    // Insert dispatch record (vehicle_id starts as null)
    const [dispatchResult] = await db.query(
      `INSERT INTO dispatches (incident_id, service_id, vehicle_id, status, route_geometry, normal_eta, optimized_eta) 
       VALUES (?, ?, NULL, "awaiting_response", ?, ?, ?)`,
      [incidentId, serviceId, JSON.stringify(route.points), normalEta, optimizedEta]
    );

    // Update incident status
    await db.query('UPDATE incidents SET status = "service_alerted" WHERE id = ?', [incidentId]);

    const dispatchObj = {
      id: dispatchResult.insertId,
      incident_id: incidentId,
      service_id: serviceId,
      service_type: service.type,
      status: 'awaiting_response',
      route_geometry: route.points,
      normal_eta: normalEta,
      optimized_eta: optimizedEta
    };

    // Broadcast to service via Socket.IO
    socketModule.broadcastServiceAlerted(dispatchObj, incident);

    res.status(201).json(dispatchObj);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ==========================================
// SERVICE DASHBOARD API
// ==========================================

// Get alerts for hospital or fire station
app.get('/api/services/:id/alerts', authenticateJWT, authorizeRoles('hospital_user', 'fire_station_user'), async (req, res) => {
  const serviceId = req.params.id;
  try {
    const [dispatches] = await db.query(
      `SELECT d.*, i.type as incident_type, i.latitude as incident_lat, i.longitude as incident_lng, i.description as incident_description
       FROM dispatches d
       JOIN incidents i ON d.incident_id = i.id
       WHERE d.service_id = ? AND d.status = "awaiting_response"`,
      [serviceId]
    );

    for (const d of dispatches) {
      try {
        d.route_geometry = JSON.parse(d.route_geometry);
      } catch (e) {
        d.route_geometry = [];
      }
    }

    res.json(dispatches);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Get active dispatch for service
app.get('/api/services/:id/active-dispatch', authenticateJWT, authorizeRoles('hospital_user', 'fire_station_user'), async (req, res) => {
  const serviceId = req.params.id;
  try {
    const [dispatches] = await db.query(
      `SELECT d.*, i.type as incident_type, i.latitude as incident_lat, i.longitude as incident_lng, i.description as incident_description
       FROM dispatches d
       JOIN incidents i ON d.incident_id = i.id
       WHERE d.service_id = ? AND d.status IN ("dispatched", "en_route", "at_scene", "returning")`,
      [serviceId]
    );

    if (dispatches.length > 0) {
      const d = dispatches[0];
      try {
        d.route_geometry = JSON.parse(d.route_geometry);
      } catch (e) {
        d.route_geometry = [];
      }
      return res.json(d);
    }
    res.json(null);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Get vehicles for service
app.get('/api/services/:id/vehicles', authenticateJWT, async (req, res) => {
  const serviceId = req.params.id;
  try {
    const [vehicles] = await db.query('SELECT * FROM vehicles WHERE service_id = ?', [serviceId]);
    res.json(vehicles);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Dispatch vehicle
app.post('/api/services/:id/dispatch', authenticateJWT, authorizeRoles('hospital_user', 'fire_station_user'), async (req, res) => {
  const serviceId = req.params.id;
  const { dispatchId, vehicleId } = req.body;

  if (!dispatchId || !vehicleId) {
    return res.status(400).json({ error: 'Dispatch ID and Vehicle ID are required.' });
  }

  try {
    const [dispatches] = await db.query('SELECT * FROM dispatches WHERE id = ? AND service_id = ?', [dispatchId, serviceId]);
    if (dispatches.length === 0) {
      return res.status(404).json({ error: 'Dispatch record not found.' });
    }
    const dispatch = dispatches[0];

    const [vehicles] = await db.query('SELECT * FROM vehicles WHERE id = ? AND service_id = ?', [vehicleId, serviceId]);
    if (vehicles.length === 0) {
      return res.status(404).json({ error: 'Vehicle not found.' });
    }
    const vehicle = vehicles[0];

    if (vehicle.status !== 'available') {
      return res.status(400).json({ error: 'Selected vehicle is not available.' });
    }

    const [incidents] = await db.query('SELECT * FROM incidents WHERE id = ?', [dispatch.incident_id]);
    const incident = incidents[0];

    // Update dispatch status to dispatched, vehicle_id
    await db.query('UPDATE dispatches SET status = "dispatched", vehicle_id = ? WHERE id = ?', [vehicleId, dispatchId]);
    // Update vehicle status to dispatched
    await db.query('UPDATE vehicles SET status = "dispatched" WHERE id = ?', [vehicleId]);
    // Update incident status to vehicle_dispatched
    await db.query('UPDATE incidents SET status = "vehicle_dispatched" WHERE id = ?', [dispatch.incident_id]);

    dispatch.vehicle_id = vehicleId;
    dispatch.status = 'dispatched';

    // Broadcast using Socket.IO
    socketModule.broadcastVehicleDispatched(dispatch, vehicle, incident);

    res.json({ message: 'Vehicle dispatched successfully.', dispatch });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// 3. Mark vehicle as En Route (starts tracking/corridor simulation)
app.post('/api/services/:id/en-route', authenticateJWT, authorizeRoles('hospital_user', 'fire_station_user'), async (req, res) => {
  const { dispatchId } = req.body;
  if (!dispatchId) return res.status(400).json({ error: 'Dispatch ID is required.' });

  try {
    await socketModule.startTrackingSimulation(dispatchId);
    res.json({ message: 'Vehicle is now En Route. Green Corridor Activated.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// 4. Mark vehicle At Scene
app.post('/api/services/:id/at-scene', authenticateJWT, authorizeRoles('hospital_user', 'fire_station_user'), async (req, res) => {
  const { dispatchId } = req.body;
  if (!dispatchId) return res.status(400).json({ error: 'Dispatch ID is required.' });

  try {
    const [dispatches] = await db.query('SELECT * FROM dispatches WHERE id = ?', [dispatchId]);
    if (dispatches.length === 0) return res.status(404).json({ error: 'Dispatch not found.' });
    const dispatch = dispatches[0];

    await db.query('UPDATE vehicles SET status = "at_scene" WHERE id = ?', [dispatch.vehicle_id]);
    await db.query('UPDATE incidents SET status = "at_scene" WHERE id = ?', [dispatch.incident_id]);
    await db.query('UPDATE dispatches SET status = "at_scene" WHERE id = ?', [dispatchId]);

    // Broadcast
    io.emit('vehicle_status_change', { vehicleId: dispatch.vehicle_id, status: 'at_scene' });
    io.emit('incident_status_change', { incidentId: dispatch.incident_id, status: 'at_scene' });

    res.json({ message: 'Vehicle marked as At Scene.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// 5. Resolve Incident
app.post('/api/services/:id/resolve', authenticateJWT, authorizeRoles('hospital_user', 'fire_station_user'), async (req, res) => {
  const { dispatchId } = req.body;
  if (!dispatchId) return res.status(400).json({ error: 'Dispatch ID is required.' });

  try {
    const [dispatches] = await db.query('SELECT * FROM dispatches WHERE id = ?', [dispatchId]);
    if (dispatches.length === 0) return res.status(404).json({ error: 'Dispatch not found.' });
    const dispatch = dispatches[0];

    // Update incident status to resolved
    await db.query('UPDATE incidents SET status = "resolved" WHERE id = ?', [dispatch.incident_id]);
    
    // Broadcast resolved status
    io.emit('incident_status_change', { incidentId: dispatch.incident_id, status: 'resolved' });

    // Trigger return simulation
    await socketModule.startReturnSimulation(dispatchId);

    res.json({ message: 'Incident resolved. Vehicle returning to station.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ==========================================
// TRAFFIC ADMIN DASHBOARD ENDPOINTS
// ==========================================

// Get Active Green Corridors
app.get('/api/traffic/active-corridors', authenticateJWT, async (req, res) => {
  try {
    const [corridors] = await db.query(
      `SELECT gc.*, d.vehicle_id, d.normal_eta, d.optimized_eta, d.route_geometry,
              s.name as service_name, s.latitude as s_lat, s.longitude as s_lng,
              i.id as incident_id, i.type as incident_type, i.latitude as i_lat, i.longitude as i_lng,
              v.latitude as v_lat, v.longitude as v_lng
       FROM green_corridors gc
       JOIN dispatches d ON gc.dispatch_id = d.id
       JOIN services s ON d.service_id = s.id
       JOIN incidents i ON d.incident_id = i.id
       JOIN vehicles v ON d.vehicle_id = v.id
       WHERE gc.status = "active"`
    );

    for (const gc of corridors) {
      try {
        gc.route_geometry = JSON.parse(gc.route_geometry);
      } catch (e) {
        gc.route_geometry = [];
      }
      try {
        gc.signals_state = JSON.parse(gc.signals_state);
      } catch (e) {
        gc.signals_state = [];
      }
    }

    res.json(corridors);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Get tracking logs (statistics)
app.get('/api/traffic/tracking-history', authenticateJWT, async (req, res) => {
  try {
    const [tracking] = await db.query('SELECT * FROM vehicle_tracking ORDER BY timestamp DESC LIMIT 100');
    res.json(tracking);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ==========================================
// APPLICATION STARTUP
// ==========================================
async function startServer() {
  try {
    // 1. Init Database
    await db.initDB();

    // 2. Init MinIO
    await minioModule.initMinio();

    // 3. Start Server
    server.listen(PORT, () => {
      console.log(`Express Backend Server listening on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();
