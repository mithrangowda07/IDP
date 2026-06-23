const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

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
const INCIDENT_TYPES = ['medical_emergency', 'accident', 'fire', 'gas_leak', 'building_collapse', 'other'];
const FIRE_INCIDENT_TYPES = ['fire', 'gas_leak', 'building_collapse'];
const EMERGENCY_CONTACT_KEYS = {
  medicalPhone: 'medical_emergency_coordinator_phone',
  firePhone: 'fire_emergency_coordinator_phone'
};

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

function normalizeIncidentType(type) {
  return String(type || '').toLowerCase().trim();
}

function isValidIncidentType(type) {
  return INCIDENT_TYPES.includes(normalizeIncidentType(type));
}

function getCoordinatorType(type) {
  const normalizedType = normalizeIncidentType(type);
  return FIRE_INCIDENT_TYPES.includes(normalizedType) ? 'fire' : 'medical';
}

async function getEmergencyContacts() {
  const [rows] = await db.query(
    `SELECT setting_key, setting_value
     FROM system_settings
     WHERE setting_key IN (?, ?)`,
    [EMERGENCY_CONTACT_KEYS.medicalPhone, EMERGENCY_CONTACT_KEYS.firePhone]
  );

  const settings = Object.fromEntries(rows.map((row) => [row.setting_key, row.setting_value]));
  return {
    medicalPhone: settings[EMERGENCY_CONTACT_KEYS.medicalPhone] || '',
    firePhone: settings[EMERGENCY_CONTACT_KEYS.firePhone] || ''
  };
}

// ==========================================
// AUTHENTICATION ROUTES
// ==========================================

// Citizen Registration
app.post('/api/auth/register-citizen', async (req, res) => {
  const { name, email, password, phone, emergencyContact } = req.body;
  if (!name || !email || !password || !phone) {
    return res.status(400).json({ error: 'Name, email, password, and phone number are required.' });
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
      'INSERT INTO citizens (user_id, name, phone, emergency_contact) VALUES (?, ?, ?, ?)',
      [userResult.insertId, name, phone, emergencyContact || null]
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

// Emergency coordinator contact numbers (readable by authenticated users for native phone dialing)
app.get('/api/emergency-contacts', authenticateJWT, async (req, res) => {
  try {
    res.json(await getEmergencyContacts());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Update emergency coordinator contact numbers
app.put('/api/admin/emergency-contacts', authenticateJWT, authorizeRoles('medical_admin', 'fire_admin', 'traffic_admin'), async (req, res) => {
  const { medicalPhone, firePhone } = req.body;
  if (medicalPhone === undefined || firePhone === undefined) {
    return res.status(400).json({ error: 'Medical and fire coordinator phone numbers are required.' });
  }

  try {
    await db.query(
      `INSERT INTO system_settings (setting_key, setting_value)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [EMERGENCY_CONTACT_KEYS.medicalPhone, String(medicalPhone).trim()]
    );
    await db.query(
      `INSERT INTO system_settings (setting_key, setting_value)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [EMERGENCY_CONTACT_KEYS.firePhone, String(firePhone).trim()]
    );

    res.json({
      message: 'Emergency coordinator contacts updated successfully.',
      contacts: await getEmergencyContacts()
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

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
  const incidentType = normalizeIncidentType(type);
  if (!isValidIncidentType(incidentType)) {
    return res.status(400).json({ error: `Invalid incident type. Must be one of: ${INCIDENT_TYPES.join(', ')}` });
  }

  try {
    // Insert incident
    const [incidentResult] = await db.query(
      'INSERT INTO incidents (type, latitude, longitude, description, source, reporter_id, status) VALUES (?, ?, ?, ?, "citizen", ?, "reported")',
      [incidentType, latitude, longitude, description || '', req.user.id]
    );
    const incidentId = incidentResult.insertId;
    await db.addTimelineEvent(incidentId, 'reported', `Incident reported by Citizen: ${incidentType.replace('_', ' ')}.`);

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
    // Check for duplicate alerts within the last 10 minutes (600 seconds)
    const [duplicates] = await db.query(
      `SELECT id FROM incidents 
       WHERE type = ? 
         AND ABS(latitude - ?) < 0.0001 
         AND ABS(longitude - ?) < 0.0001 
         AND created_at >= DATE_SUB(NOW(), INTERVAL 10 MINUTE)`,
      [formattedType, parseFloat(latitude), parseFloat(longitude)]
    );

    if (duplicates.length > 0) {
      console.log(`[Sensor Alert] Duplicate alert of type "${formattedType}" at (${latitude}, ${longitude}) detected within the last 10 minutes. Ignoring.`);
      return res.status(200).json({
        message: 'Duplicate alert detected. Ignored.',
        isDuplicate: true
      });
    }

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
      query = 'SELECT * FROM incidents WHERE type IN ("medical_emergency", "accident", "other") ORDER BY created_at DESC';
    } else if (req.user.role === 'fire_admin') {
      query = 'SELECT * FROM incidents WHERE type IN ("fire", "gas_leak", "building_collapse") ORDER BY created_at DESC';
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
      const routePoints = parseRouteGeometry(incident.dispatch.route_geometry);
      incident.dispatch.route_geometry = routePoints;
      incident.dispatch.distance = getRouteDistanceKm(routePoints);

      const [corridors] = await db.query(
        `SELECT status, signals_state
         FROM green_corridors
         WHERE dispatch_id = ?
         ORDER BY id DESC
         LIMIT 1`,
        [incident.dispatch.id]
      );
      incident.dispatch.corridor_active = corridors[0]?.status === 'active';
      incident.dispatch.signals = parseSignalsState(corridors[0]?.signals_state);
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

    // Filter service type through the existing workflow.
    const serviceType = getCoordinatorType(incident.type) === 'fire' ? 'fire_station' : 'hospital';

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
// ROUTING & OSRM API
// ==========================================

async function calculateRoute(startLat, startLng, endLat, endLng) {
  const osrmBaseUrl = process.env.OSRM_BASE_URL || 'https://router.project-osrm.org';
  const coordinates = `${startLng},${startLat};${endLng},${endLat}`;
  const primaryUrl = `${osrmBaseUrl.replace(/\/$/, '')}/route/v1/driving/${coordinates}`;
  const fallbackUrl = `https://routing.openstreetmap.de/routed-car/route/v1/driving/${coordinates}`;

  let routeData = null;
  let provider = 'osrm_primary';
  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await axios.get(primaryUrl, {
        params: {
          overview: 'full',
          geometries: 'geojson',
          alternatives: false,
          steps: false
        },
        timeout: 10000 // 10 seconds timeout
      });
      routeData = response.data;
      provider = 'osrm_primary';
      break; // Success
    } catch (err) {
      console.warn(`Primary OSRM request attempt ${attempt} failed: ${err.message || err.code || 'Timeout'}. Trying fallback...`);
      try {
        const response = await axios.get(fallbackUrl, {
          params: {
            overview: 'full',
            geometries: 'geojson',
            alternatives: false,
            steps: false
          },
          timeout: 10000
        });
        routeData = response.data;
        provider = 'osrm_fallback';
        break; // Success
      } catch (fallbackErr) {
        console.warn(`Fallback OSRM request attempt ${attempt} failed: ${fallbackErr.message || fallbackErr.code || 'Timeout'}`);
      }
    }

    if (attempt < maxRetries) {
      // Wait 500ms before retrying
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  if (routeData?.code === 'Ok' && routeData.routes?.length > 0) {
    const route = routeData.routes[0];
    const points = route.geometry.coordinates.map(([lng, lat]) => ({
      lat: parseFloat(lat.toFixed(6)),
      lng: parseFloat(lng.toFixed(6))
    }));

    return {
      points,
      distance: parseFloat((route.distance / 1000).toFixed(2)),
      duration: Math.max(1, Math.ceil(route.duration / 60)),
      provider
    };
  }

  const distance = getHaversineDistance(startLat, startLng, endLat, endLng);
  const points = [
    {
      lat: parseFloat(startLat.toFixed(6)),
      lng: parseFloat(startLng.toFixed(6))
    },
    {
      lat: parseFloat(endLat.toFixed(6)),
      lng: parseFloat(endLng.toFixed(6))
    }
  ];
  const avgSpeedKmh = 40;
  const durationMinutes = Math.max(2, Math.ceil((distance / avgSpeedKmh) * 60));

  return {
    points,
    distance: parseFloat(distance.toFixed(2)),
    duration: durationMinutes,
    provider: 'fallback_direct'
  };
}

function parseRouteGeometry(routeGeometry) {
  if (Array.isArray(routeGeometry)) return routeGeometry;
  if (!routeGeometry) return [];

  try {
    const parsed = JSON.parse(routeGeometry);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function parseSignalsState(signalsState) {
  if (Array.isArray(signalsState)) return signalsState;
  if (!signalsState) return [];
  try {
    const parsed = typeof signalsState === 'string' ? JSON.parse(signalsState) : signalsState;
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function getRouteDistanceKm(points) {
  if (!Array.isArray(points) || points.length < 2) return 0;

  let distance = 0;
  for (let i = 1; i < points.length; i++) {
    distance += getHaversineDistance(
      parseFloat(points[i - 1].lat),
      parseFloat(points[i - 1].lng),
      parseFloat(points[i].lat),
      parseFloat(points[i].lng)
    );
  }

  return parseFloat(distance.toFixed(2));
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
    await db.addTimelineEvent(incidentId, 'service_recommended', `Service recommended: ${service.name} (${service.type}).`);
    await db.addTimelineEvent(incidentId, 'service_assigned', `Service assigned and alerted: ${service.name}.`);

    const dispatchObj = {
      id: dispatchResult.insertId,
      incident_id: incidentId,
      service_id: serviceId,
      service_type: service.type,
      status: 'awaiting_response',
      route_geometry: route.points,
      distance: route.distance,
      normal_eta: normalEta,
      optimized_eta: optimizedEta,
      incident_type: incident.type,
      incident_lat: incident.latitude,
      incident_lng: incident.longitude,
      incident_description: incident.description,
      service_name: service.name,
      service_type: service.type,
      service_lat: service.latitude,
      service_lng: service.longitude
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
      `SELECT d.*, 
              i.type as incident_type, i.latitude as incident_lat, i.longitude as incident_lng, i.description as incident_description,
              s.name as service_name, s.type as service_type, s.latitude as service_lat, s.longitude as service_lng
       FROM dispatches d
       JOIN incidents i ON d.incident_id = i.id
       JOIN services s ON d.service_id = s.id
       WHERE d.service_id = ? AND d.status = "awaiting_response"`,
      [serviceId]
    );

    for (const d of dispatches) {
      d.route_geometry = parseRouteGeometry(d.route_geometry);
      d.distance = getRouteDistanceKm(d.route_geometry);
    }

    res.json(dispatches);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Get all active dispatches for service
app.get('/api/services/:id/active-dispatches', authenticateJWT, authorizeRoles('hospital_user', 'fire_station_user'), async (req, res) => {
  const serviceId = req.params.id;
  try {
    const [dispatches] = await db.query(
      `SELECT d.*, 
              i.type as incident_type, i.latitude as incident_lat, i.longitude as incident_lng, i.description as incident_description,
              s.name as service_name, s.type as service_type, s.latitude as service_lat, s.longitude as service_lng
       FROM dispatches d
       JOIN incidents i ON d.incident_id = i.id
       JOIN services s ON d.service_id = s.id
       WHERE d.service_id = ? AND d.status IN ("dispatched", "en_route", "at_scene", "returning")`,
      [serviceId]
    );

    for (const d of dispatches) {
      d.route_geometry = parseRouteGeometry(d.route_geometry);
      d.distance = getRouteDistanceKm(d.route_geometry);

      const [corridors] = await db.query(
        `SELECT status, signals_state
         FROM green_corridors
         WHERE dispatch_id = ?
         ORDER BY id DESC
         LIMIT 1`,
        [d.id]
      );
      d.corridor_active = corridors[0]?.status === 'active';
      d.signals = parseSignalsState(corridors[0]?.signals_state);
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
      `SELECT d.*, 
              i.type as incident_type, i.latitude as incident_lat, i.longitude as incident_lng, i.description as incident_description,
              s.name as service_name, s.type as service_type, s.latitude as service_lat, s.longitude as service_lng
       FROM dispatches d
       JOIN incidents i ON d.incident_id = i.id
       JOIN services s ON d.service_id = s.id
       WHERE d.service_id = ? AND d.status IN ("dispatched", "en_route", "at_scene", "returning")`,
      [serviceId]
    );

    if (dispatches.length > 0) {
      const d = dispatches[0];
      d.route_geometry = parseRouteGeometry(d.route_geometry);
      d.distance = getRouteDistanceKm(d.route_geometry);

      const [corridors] = await db.query(
        `SELECT status, signals_state
         FROM green_corridors
         WHERE dispatch_id = ?
         ORDER BY id DESC
         LIMIT 1`,
        [d.id]
      );
      d.corridor_active = corridors[0]?.status === 'active';
      d.signals = parseSignalsState(corridors[0]?.signals_state);

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

// Add vehicle to service fleet
app.post('/api/services/:id/vehicles', authenticateJWT, authorizeRoles('hospital_user', 'fire_station_user'), async (req, res) => {
  const serviceId = req.params.id;
  const { vehicleId } = req.body;

  if (!vehicleId || !String(vehicleId).trim()) {
    return res.status(400).json({ error: 'Vehicle ID is required.' });
  }

  const trimmedId = String(vehicleId).trim().toUpperCase();

  try {
    const [services] = await db.query(
      'SELECT * FROM services WHERE id = ? AND user_id = ?',
      [serviceId, req.user.id]
    );
    if (services.length === 0) {
      return res.status(403).json({ error: 'Access denied: you can only manage your own fleet.' });
    }
    const service = services[0];

    const vehicleType = service.type === 'fire_station' ? 'fire_engine' : 'ambulance';
    const expectedPrefix = vehicleType === 'fire_engine' ? 'FIRE-' : 'AMB-';
    if (!trimmedId.startsWith(expectedPrefix)) {
      return res.status(400).json({ error: `Vehicle ID must start with ${expectedPrefix}` });
    }

    const [existing] = await db.query('SELECT id FROM vehicles WHERE id = ?', [trimmedId]);
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Vehicle ID already exists in the system.' });
    }

    await db.query(
      'INSERT INTO vehicles (id, service_id, type, status, latitude, longitude) VALUES (?, ?, ?, "available", ?, ?)',
      [trimmedId, serviceId, vehicleType, service.latitude, service.longitude]
    );

    const [vehicles] = await db.query('SELECT * FROM vehicles WHERE service_id = ? ORDER BY id', [serviceId]);
    res.status(201).json({ message: 'Vehicle added to fleet.', vehicleId: trimmedId, vehicles });
  } catch (err) {
    console.error('Add vehicle error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Remove vehicle from service fleet
app.delete('/api/services/:id/vehicles/:vehicleId', authenticateJWT, authorizeRoles('hospital_user', 'fire_station_user'), async (req, res) => {
  const serviceId = req.params.id;
  const vehicleId = decodeURIComponent(req.params.vehicleId).trim().toUpperCase();

  try {
    const [services] = await db.query(
      'SELECT id FROM services WHERE id = ? AND user_id = ?',
      [serviceId, req.user.id]
    );
    if (services.length === 0) {
      return res.status(403).json({ error: 'Access denied: you can only manage your own fleet.' });
    }

    const [vehicles] = await db.query('SELECT * FROM vehicles WHERE id = ? AND service_id = ?', [vehicleId, serviceId]);
    if (vehicles.length === 0) {
      return res.status(404).json({ error: 'Vehicle not found in this fleet.' });
    }

    const vehicle = vehicles[0];
    if (!['available', 'maintenance'].includes(vehicle.status)) {
      return res.status(400).json({ error: 'Cannot remove a vehicle that is currently on an active dispatch.' });
    }

    const [activeDispatches] = await db.query(
      'SELECT id FROM dispatches WHERE vehicle_id = ? AND status IN ("dispatched", "en_route", "at_scene", "returning")',
      [vehicleId]
    );
    if (activeDispatches.length > 0) {
      return res.status(400).json({ error: 'Cannot remove a vehicle linked to an active dispatch.' });
    }

    await db.query('DELETE FROM vehicles WHERE id = ? AND service_id = ?', [vehicleId, serviceId]);

    const [remaining] = await db.query('SELECT * FROM vehicles WHERE service_id = ? ORDER BY id', [serviceId]);
    res.json({ message: 'Vehicle removed from fleet.', vehicles: remaining });
  } catch (err) {
    console.error('Remove vehicle error:', err);
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
    await db.addTimelineEvent(dispatch.incident_id, 'vehicle_dispatched', `Vehicle dispatched: ${vehicleId}.`);

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

    await socketModule.stopTrackingSimulation(dispatchId);

    await db.query('UPDATE vehicles SET status = "at_scene" WHERE id = ?', [dispatch.vehicle_id]);
    await db.query('UPDATE incidents SET status = "at_scene" WHERE id = ?', [dispatch.incident_id]);
    await db.query('UPDATE dispatches SET status = "at_scene" WHERE id = ?', [dispatchId]);
    await db.addTimelineEvent(dispatch.incident_id, 'at_scene', `Vehicle arrived at scene.`);

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
  const { dispatchId, outcome, fireSeverity, waterConsumption, timeToControl, timeToExtinguish, needGreenCorridor } = req.body;
  if (!dispatchId) return res.status(400).json({ error: 'Dispatch ID is required.' });

  try {
    const [dispatches] = await db.query('SELECT * FROM dispatches WHERE id = ?', [dispatchId]);
    if (dispatches.length === 0) return res.status(404).json({ error: 'Dispatch not found.' });
    const dispatch = dispatches[0];

    // Update outcome & other fields on dispatch record
    await db.query(
      `UPDATE dispatches 
       SET outcome = ?, fire_severity = ?, water_consumption = ?, time_to_control = ?, time_to_extinguish = ?
       WHERE id = ?`,
      [
        outcome || null,
        fireSeverity || null,
        waterConsumption !== undefined ? parseInt(waterConsumption) : null,
        timeToControl !== undefined ? parseInt(timeToControl) : null,
        timeToExtinguish !== undefined ? parseInt(timeToExtinguish) : null,
        dispatchId
      ]
    );

    // Update incident status to resolved
    await db.query('UPDATE incidents SET status = "resolved" WHERE id = ?', [dispatch.incident_id]);
    
    // Add timeline event
    await db.addTimelineEvent(dispatch.incident_id, 'resolved', `Incident resolved. Outcome: ${outcome || 'N/A'}`);

    // Broadcast resolved status
    io.emit('incident_status_change', { incidentId: dispatch.incident_id, status: 'resolved' });

    // Trigger return simulation with needGreenCorridor preference
    const requestGreenCorridor = needGreenCorridor !== false; // default to true if not defined
    await socketModule.startReturnSimulation(dispatchId, requestGreenCorridor);

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
      gc.signals_state = parseSignalsState(gc.signals_state);
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

function buildTrafficJourneyDateFilter(filter) {
  const completedTimeExpr = `COALESCE(
    (SELECT MAX(event_time) FROM incident_timeline it WHERE it.incident_id = d.incident_id AND it.event_type = 'completed'),
    d.created_at
  )`;

  if (filter === 'today') {
    return `AND ${completedTimeExpr} >= CURDATE()`;
  }
  if (filter === '7days') {
    return `AND ${completedTimeExpr} >= DATE_SUB(NOW(), INTERVAL 7 DAY)`;
  }
  if (filter === '30days') {
    return `AND ${completedTimeExpr} >= DATE_SUB(NOW(), INTERVAL 30 DAY)`;
  }
  return '';
}

function buildCompletedJourneyBaseQuery() {
  return `
    FROM dispatches d
    JOIN services s ON d.service_id = s.id
    JOIN vehicles v ON d.vehicle_id = v.id
    LEFT JOIN (
      SELECT incident_id, MIN(event_time) as en_route_time
      FROM incident_timeline
      WHERE event_type = 'en_route'
      GROUP BY incident_id
    ) en_route_events ON en_route_events.incident_id = d.incident_id
    LEFT JOIN (
      SELECT incident_id, MAX(event_time) as completed_time
      FROM incident_timeline
      WHERE event_type = 'completed'
      GROUP BY incident_id
    ) completed_events ON completed_events.incident_id = d.incident_id
    WHERE d.status = 'completed' AND d.vehicle_id IS NOT NULL
  `;
}

function mapJourneyRow(row) {
  const optimizedTravelTime = row.optimized_travel_time || 0;
  const normalTravelTime = row.normal_travel_time || optimizedTravelTime + (row.time_saved || 0);
  const timeSaved = row.time_saved ?? (normalTravelTime - optimizedTravelTime);

  return {
    journey_id: row.journey_id,
    incident_id: row.incident_id,
    vehicle_id: row.vehicle_id,
    vehicle_type: row.vehicle_type,
    service_name: row.service_name,
    start_time: row.start_time,
    end_time: row.end_time,
    optimized_travel_time: optimizedTravelTime,
    normal_travel_time: normalTravelTime,
    time_saved: timeSaved,
    corridor_status: row.corridor_status
  };
}

// Completed corridor journey statistics
app.get('/api/traffic/journey-stats', authenticateJWT, authorizeRoles('traffic_admin'), async (req, res) => {
  const { filter = 'all' } = req.query;

  try {
    const dateFilter = buildTrafficJourneyDateFilter(filter);
    const [rows] = await db.query(
      `SELECT
         d.id as journey_id,
         d.optimized_eta as optimized_travel_time,
         d.normal_eta as normal_travel_time,
         (d.normal_eta - d.optimized_eta) as time_saved
       ${buildCompletedJourneyBaseQuery()}
       ${dateFilter}`
    );

    const totalOptimizedTravelTime = rows.reduce((sum, row) => sum + (row.optimized_travel_time || 0), 0);
    const totalNormalTravelTime = rows.reduce((sum, row) => {
      const optimized = row.optimized_travel_time || 0;
      const normal = row.normal_travel_time || optimized + (row.time_saved || 0);
      return sum + normal;
    }, 0);
    const totalTimeSaved = totalNormalTravelTime - totalOptimizedTravelTime;

    res.json({
      totalOptimizedTravelTime,
      totalNormalTravelTime,
      totalTimeSaved,
      totalCompletedCorridors: rows.length,
      filter
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Completed corridor journey history
app.get('/api/traffic/journey-history', authenticateJWT, authorizeRoles('traffic_admin'), async (req, res) => {
  const {
    filter = 'all',
    search = '',
    page = '1',
    limit = '10',
    sort = 'end_time',
    order = 'desc'
  } = req.query;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
  const offset = (pageNum - 1) * limitNum;

  const sortMap = {
    journey_id: 'journey_id',
    incident_id: 'incident_id',
    vehicle_id: 'vehicle_id',
    vehicle_type: 'vehicle_type',
    service_name: 'service_name',
    start_time: 'start_time',
    end_time: 'end_time',
    optimized_travel_time: 'optimized_travel_time',
    normal_travel_time: 'normal_travel_time',
    time_saved: 'time_saved',
    corridor_status: 'corridor_status'
  };
  const sortCol = sortMap[sort] || 'end_time';
  const sortOrder = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  try {
    const dateFilter = buildTrafficJourneyDateFilter(filter);
    let searchFilter = '';
    const searchParams = [];

    if (search) {
      searchFilter = `AND (
        CAST(d.id AS CHAR) LIKE ? OR
        CAST(d.incident_id AS CHAR) LIKE ? OR
        d.vehicle_id LIKE ? OR
        s.name LIKE ? OR
        v.type LIKE ?
      )`;
      const searchVal = `%${search}%`;
      searchParams.push(searchVal, searchVal, searchVal, searchVal, searchVal);
    }

    const countQuery = `
      SELECT COUNT(*) as total
      ${buildCompletedJourneyBaseQuery()}
      ${dateFilter}
      ${searchFilter}
    `;
    const [countRows] = await db.query(countQuery, searchParams);
    const total = countRows[0]?.total || 0;

    const dataQuery = `
      SELECT
        d.id as journey_id,
        d.incident_id,
        d.vehicle_id,
        v.type as vehicle_type,
        s.name as service_name,
        COALESCE(en_route_events.en_route_time, d.created_at) as start_time,
        completed_events.completed_time as end_time,
        d.optimized_eta as optimized_travel_time,
        d.normal_eta as normal_travel_time,
        (d.normal_eta - d.optimized_eta) as time_saved,
        d.status as corridor_status
      ${buildCompletedJourneyBaseQuery()}
      ${dateFilter}
      ${searchFilter}
      ORDER BY ${sortCol} ${sortOrder}
      LIMIT ? OFFSET ?
    `;
    const [rows] = await db.query(dataQuery, [...searchParams, limitNum, offset]);

    res.json({
      items: rows.map(mapJourneyRow),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.max(1, Math.ceil(total / limitNum))
      },
      filter
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Simulation speed controls for hospital/fire operators (demo only)
app.get('/api/simulation-speed', authenticateJWT, authorizeRoles('hospital_user', 'fire_station_user'), (req, res) => {
  res.json({ speedKmh: socketModule.getSimulationSpeedKmh() });
});

app.post('/api/simulation-speed', authenticateJWT, authorizeRoles('hospital_user', 'fire_station_user'), (req, res) => {
  const { delta, speedKmh } = req.body;
  const parsedSpeed = Number(speedKmh);
  const parsedDelta = Number(delta);

  if (Number.isFinite(parsedSpeed)) {
    return res.json({ speedKmh: socketModule.setSimulationSpeedKmh(parsedSpeed) });
  }
  if (Number.isFinite(parsedDelta)) {
    return res.json({ speedKmh: socketModule.adjustSimulationSpeed(parsedDelta) });
  }

  return res.status(400).json({ error: 'Provide delta or speedKmh.' });
});

// Get Citizen profile details
app.get('/api/citizen/profile', authenticateJWT, authorizeRoles('citizen_user'), async (req, res) => {
  try {
    const [citizens] = await db.query('SELECT * FROM citizens WHERE user_id = ?', [req.user.id]);
    if (citizens.length === 0) return res.status(404).json({ error: 'Citizen profile not found.' });
    
    res.json({
      name: citizens[0].name,
      phone: citizens[0].phone || '',
      emergencyContact: citizens[0].emergency_contact || '',
      email: req.user.email
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Update Citizen profile
app.put('/api/citizen/profile', authenticateJWT, authorizeRoles('citizen_user'), async (req, res) => {
  const { name, phone, emergencyContact, email, password } = req.body;
  if (!name || !phone || !email) {
    return res.status(400).json({ error: 'Name, phone number, and email are required.' });
  }

  try {
    const [existing] = await db.query('SELECT id FROM users WHERE email = ? AND id != ?', [email, req.user.id]);
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Email already in use.' });
    }

    if (password) {
      const passwordHash = await bcrypt.hash(password, 10);
      await db.query('UPDATE users SET email = ?, password_hash = ? WHERE id = ?', [email, passwordHash, req.user.id]);
    } else {
      await db.query('UPDATE users SET email = ? WHERE id = ?', [email, req.user.id]);
    }

    await db.query(
      'UPDATE citizens SET name = ?, phone = ?, emergency_contact = ? WHERE user_id = ?',
      [name, phone, emergencyContact || null, req.user.id]
    );

    res.json({ message: 'Profile updated successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Get Citizen stats
app.get('/api/citizen/stats', authenticateJWT, authorizeRoles('citizen_user'), async (req, res) => {
  try {
    const [total] = await db.query('SELECT COUNT(*) as count FROM incidents WHERE reporter_id = ?', [req.user.id]);
    const [active] = await db.query('SELECT COUNT(*) as count FROM incidents WHERE reporter_id = ? AND status != "resolved"', [req.user.id]);
    const [resolved] = await db.query('SELECT COUNT(*) as count FROM incidents WHERE reporter_id = ? AND status = "resolved"', [req.user.id]);
    
    res.json({
      totalIncidents: total[0].count,
      activeIncidents: active[0].count,
      resolvedIncidents: resolved[0].count
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Get Service Profile Details
app.get('/api/services/:id/profile', authenticateJWT, authorizeRoles('hospital_user', 'fire_station_user'), async (req, res) => {
  try {
    const [services] = await db.query('SELECT * FROM services WHERE id = ?', [req.params.id]);
    if (services.length === 0) return res.status(404).json({ error: 'Service profile not found.' });
    
    const [users] = await db.query('SELECT email FROM users WHERE id = ?', [services[0].user_id]);
    const email = users[0]?.email || '';

    res.json({
      name: services[0].name,
      phone: services[0].phone,
      email: email,
      address: services[0].address,
      latitude: services[0].latitude,
      longitude: services[0].longitude
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Update Service Profile Settings
app.put('/api/services/:id/profile', authenticateJWT, authorizeRoles('hospital_user', 'fire_station_user'), async (req, res) => {
  const { name, phone, email, address, latitude, longitude, password } = req.body;
  if (!name || !phone || !email || !address || latitude === undefined || longitude === undefined) {
    return res.status(400).json({ error: 'All service profile fields are required.' });
  }

  try {
    const [services] = await db.query('SELECT * FROM services WHERE id = ?', [req.params.id]);
    if (services.length === 0) return res.status(404).json({ error: 'Service profile not found.' });
    const service = services[0];

    const [existing] = await db.query('SELECT id FROM users WHERE email = ? AND id != ?', [email, service.user_id]);
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Email already in use.' });
    }

    if (password) {
      const passwordHash = await bcrypt.hash(password, 10);
      await db.query('UPDATE users SET email = ?, password_hash = ? WHERE id = ?', [email, passwordHash, service.user_id]);
    } else {
      await db.query('UPDATE users SET email = ? WHERE id = ?', [email, service.user_id]);
    }

    await db.query(
      'UPDATE services SET name = ?, phone = ?, address = ?, latitude = ?, longitude = ? WHERE id = ?',
      [name, phone, address, latitude, longitude, req.params.id]
    );

    res.json({ message: 'Profile updated successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Get Service Profile Stats
app.get('/api/services/:id/stats', authenticateJWT, authorizeRoles('hospital_user', 'fire_station_user'), async (req, res) => {
  const serviceId = req.params.id;
  try {
    const [totalIncidents] = await db.query('SELECT COUNT(*) as count FROM dispatches WHERE service_id = ?', [serviceId]);
    const [activeVehicles] = await db.query(
      'SELECT COUNT(*) as count FROM vehicles WHERE service_id = ? AND status IN ("dispatched", "en_route", "at_scene", "returning")',
      [serviceId]
    );
    const [availableVehicles] = await db.query(
      'SELECT COUNT(*) as count FROM vehicles WHERE service_id = ? AND status = "available"',
      [serviceId]
    );
    const [avgTimeRows] = await db.query(
      `SELECT AVG(TIMESTAMPDIFF(SECOND, t_as.event_time, t_en.event_time)) as avg_time
       FROM dispatches d
       JOIN incident_timeline t_en ON d.incident_id = t_en.incident_id AND t_en.event_type = "en_route"
       JOIN incident_timeline t_as ON d.incident_id = t_as.incident_id AND t_as.event_type = "service_assigned"
       WHERE d.service_id = ?`,
      [serviceId]
    );

    const avgResponseTimeSecs = Math.round(avgTimeRows[0]?.avg_time || 0);
    const avgResponseTimeStr = avgResponseTimeSecs > 0 
      ? `${(avgResponseTimeSecs / 60).toFixed(1)} mins` 
      : 'N/A';

    res.json({
      totalIncidents: totalIncidents[0].count,
      activeVehicles: activeVehicles[0].count,
      availableVehicles: availableVehicles[0].count,
      avgResponseTime: avgResponseTimeStr
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Elderly "Emergency Assistance" Route
app.post('/api/incidents/emergency-assistance', authenticateJWT, authorizeRoles('citizen_user'), async (req, res) => {
  const { type, latitude, longitude, accuracy } = req.body;
  if (!type || latitude === undefined || longitude === undefined) {
    return res.status(400).json({ error: 'Type and GPS coordinates are required.' });
  }
  const incidentType = normalizeIncidentType(type);
  if (!isValidIncidentType(incidentType)) {
    return res.status(400).json({ error: `Invalid incident type. Must be one of: ${INCIDENT_TYPES.join(', ')}` });
  }

  try {
    const description = `Emergency assistance requested. GPS accuracy: ${accuracy || 'N/A'}m.`;
    const [incidentResult] = await db.query(
      `INSERT INTO incidents (type, latitude, longitude, description, source, reporter_id, status) 
       VALUES (?, ?, ?, ?, 'emergency_assistance', ?, 'reported')`,
      [incidentType, latitude, longitude, description, req.user.id]
    );
    const incidentId = incidentResult.insertId;

    await db.addTimelineEvent(incidentId, 'reported', `Emergency assistance incident reported by Citizen: ${incidentType.replace('_', ' ')}.`);

    const [incidents] = await db.query('SELECT * FROM incidents WHERE id = ?', [incidentId]);
    const incidentObj = incidents[0];
    incidentObj.images = [];

    socketModule.broadcastNewIncident(incidentObj);
    const contacts = await getEmergencyContacts();
    const coordinatorType = getCoordinatorType(incidentType);

    res.status(201).json({
      message: 'Emergency assistance request created.',
      incident: incidentObj,
      incidentId,
      coordinatorType,
      callNumber: coordinatorType === 'fire' ? contacts.firePhone : contacts.medicalPhone
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Admin coordinates correction
app.put('/api/incidents/:id/location', authenticateJWT, authorizeRoles('medical_admin', 'fire_admin'), async (req, res) => {
  const incidentId = req.params.id;
  const { latitude, longitude, reason } = req.body;
  if (latitude === undefined || longitude === undefined || !reason) {
    return res.status(400).json({ error: 'New coordinates and reason are required.' });
  }

  try {
    const [incidents] = await db.query('SELECT * FROM incidents WHERE id = ?', [incidentId]);
    if (incidents.length === 0) return res.status(404).json({ error: 'Incident not found.' });
    const incident = incidents[0];

    await db.query(
      `INSERT INTO incident_coordinate_audit (incident_id, original_latitude, original_longitude, updated_latitude, updated_longitude, edited_by, reason_for_change) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [incidentId, incident.latitude, incident.longitude, latitude, longitude, req.user.id, reason]
    );

    await db.query('UPDATE incidents SET latitude = ?, longitude = ? WHERE id = ?', [latitude, longitude, incidentId]);

    await db.addTimelineEvent(incidentId, 'location_corrected', `Coordinates updated by Admin. Reason: ${reason}`);

    io.emit('incident_status_change', { incidentId, status: incident.status, latitude, longitude });

    res.json({ message: 'Incident location updated successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Get Admin coordinate correction log
app.get('/api/incidents/:id/audit-trail', authenticateJWT, async (req, res) => {
  try {
    const [audit] = await db.query(
      `SELECT a.*, u.email as editor_email
       FROM incident_coordinate_audit a
       JOIN users u ON a.edited_by = u.id
       WHERE a.incident_id = ?
       ORDER BY a.edited_time DESC`,
      [req.params.id]
    );
    res.json(audit);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Get Service history
app.get('/api/services/:id/history', authenticateJWT, authorizeRoles('hospital_user', 'fire_station_user'), async (req, res) => {
  const serviceId = req.params.id;
  const { filter, search } = req.query;
  
  let dateFilter = '';
  if (filter === 'today') {
    dateFilter = 'AND d.created_at >= CURDATE()';
  } else if (filter === '7days') {
    dateFilter = 'AND d.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)';
  } else if (filter === '30days') {
    dateFilter = 'AND d.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)';
  }

  let searchFilter = '';
  const params = [serviceId];

  if (search) {
    searchFilter = `AND (d.id LIKE ? OR c.name LIKE ? OR d.vehicle_id LIKE ?)`;
    const searchVal = `%${search}%`;
    params.push(searchVal, searchVal, searchVal);
  }

  try {
    const query = `
      SELECT d.*, 
             i.type as incident_type, i.latitude as incident_lat, i.longitude as incident_lng, i.created_at as reported_time,
             c.name as citizen_name,
             v.driver_name
      FROM dispatches d
      JOIN incidents i ON d.incident_id = i.id
      LEFT JOIN users u ON i.reporter_id = u.id
      LEFT JOIN citizens c ON u.id = c.user_id
      LEFT JOIN vehicles v ON d.vehicle_id = v.id
      WHERE d.service_id = ? ${dateFilter} ${searchFilter}
      ORDER BY d.created_at DESC
    `;
    
    const [dispatches] = await db.query(query, params);

    if (dispatches.length === 0) {
      return res.json([]);
    }

    const incidentIds = dispatches.map(d => d.incident_id);
    
    const [timelineEvents] = await db.query(
      `SELECT incident_id, event_type, event_time 
       FROM incident_timeline 
       WHERE incident_id IN (${incidentIds.join(',')})
       ORDER BY event_time ASC`
    );

    const timelineMap = {};
    for (const ev of timelineEvents) {
      if (!timelineMap[ev.incident_id]) {
        timelineMap[ev.incident_id] = {};
      }
      timelineMap[ev.incident_id][ev.event_type] = ev.event_time;
    }

    const history = dispatches.map(d => {
      const t = timelineMap[d.incident_id] || {};
      
      const reportedTime = d.reported_time;
      const assignedTime = d.created_at;
      const enRouteTime = t['en_route'] || null;
      const arrivalTime = t['at_scene'] || null;
      const resolutionTime = t['resolved'] || t['completed'] || null;

      let responseTime = 'N/A';
      if (assignedTime && enRouteTime) {
        const diffMs = new Date(enRouteTime) - new Date(assignedTime);
        responseTime = `${Math.round(diffMs / 60000)} mins`;
      }

      return {
        id: d.id,
        incident_id: d.incident_id,
        incident_type: d.incident_type,
        citizen_name: d.citizen_name || 'N/A',
        incident_lat: d.incident_lat,
        incident_lng: d.incident_lng,
        reported_time: reportedTime,
        assigned_time: assignedTime,
        ambulance_assigned: d.vehicle_id || 'N/A',
        driver_name: d.driver_name || 'John Doe',
        response_time: responseTime,
        arrival_time: arrivalTime,
        resolution_time: resolutionTime,
        status: d.status,
        outcome: d.outcome || 'N/A',
        fire_severity: d.fire_severity || 'N/A',
        water_consumption: d.water_consumption || 0,
        time_to_control: d.time_to_control !== null ? `${d.time_to_control} mins` : 'N/A',
        time_to_extinguish: d.time_to_extinguish !== null ? `${d.time_to_extinguish} mins` : 'N/A'
      };
    });

    res.json(history);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Get Incident Timeline
app.get('/api/incidents/:id/timeline', authenticateJWT, async (req, res) => {
  try {
    const [events] = await db.query(
      'SELECT * FROM incident_timeline WHERE incident_id = ? ORDER BY event_time ASC',
      [req.params.id]
    );
    res.json(events);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Get Citizen active incident tracking
app.get('/api/citizen/active-incident/track', authenticateJWT, authorizeRoles('citizen_user'), async (req, res) => {
  try {
    const [citizens] = await db.query('SELECT * FROM citizens WHERE user_id = ?', [req.user.id]);
    if (citizens.length === 0) return res.status(404).json({ error: 'Citizen profile not found.' });
    
    const [incidents] = await db.query(
      `SELECT i.* FROM incidents i
       LEFT JOIN dispatches d ON d.incident_id = i.id
       WHERE i.reporter_id = ? AND (i.status != "resolved" OR (i.status = "resolved" AND d.status = "returning"))
       ORDER BY i.id DESC LIMIT 1`,
      [req.user.id]
    );

    if (incidents.length === 0) {
      return res.json(null);
    }
    const incident = incidents[0];

    const [dispatches] = await db.query(
      `SELECT d.*, 
              s.name as service_name, s.type as service_type, s.latitude as service_lat, s.longitude as service_lng,
              v.status as vehicle_status, v.latitude as v_lat, v.longitude as v_lng, v.driver_name
       FROM dispatches d
       JOIN services s ON d.service_id = s.id
       LEFT JOIN vehicles v ON d.vehicle_id = v.id
       WHERE d.incident_id = ? AND d.status != "completed"
       ORDER BY d.id DESC LIMIT 1`,
      [incident.id]
    );

    if (dispatches.length === 0) {
      return res.json({
        incident,
        dispatch: null
      });
    }

    const dispatch = dispatches[0];
    dispatch.route_geometry = parseRouteGeometry(dispatch.route_geometry);

    const [corridors] = await db.query(
      'SELECT status, signals_state FROM green_corridors WHERE dispatch_id = ? ORDER BY id DESC LIMIT 1',
      [dispatch.id]
    );
    const corridorActive = corridors[0]?.status === 'active';
    const signals = parseSignalsState(corridors[0]?.signals_state);

    res.json({
      incident,
      dispatch: {
        ...dispatch,
        corridor_active: corridorActive,
        signals
      }
    });
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
