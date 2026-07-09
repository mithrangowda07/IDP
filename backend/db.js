const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const dbConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'MithDhru@1536',
};

const dbName = process.env.DB_NAME || 'emergency_response';

let pool;

async function initDB() {
  // Create connection to initialize database if not exists
  const connection = await mysql.createConnection(dbConfig);
  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
  await connection.end();

  // Create connection pool
  pool = mysql.createPool({
    ...dbConfig,
    database: dbName,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });

  console.log(`MySQL Connection Pool established with database: ${dbName}`);

  // Create tables
  await createTables();

  // Seed default admin users
  await seedAdmins();
}

async function createTables() {
  const queries = [
    // Users table
    `CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role ENUM('medical_admin', 'fire_admin', 'traffic_admin', 'hospital_user', 'fire_station_user', 'citizen_user') NOT NULL,
      status ENUM('pending', 'active', 'rejected') DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    // Citizens table
    `CREATE TABLE IF NOT EXISTS citizens (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      name VARCHAR(255) NOT NULL,
      phone VARCHAR(20) DEFAULT NULL,
      emergency_contact VARCHAR(20) DEFAULT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,

    // Services table
    `CREATE TABLE IF NOT EXISTS services (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      name VARCHAR(255) NOT NULL,
      type ENUM('hospital', 'fire_station') NOT NULL,
      phone VARCHAR(20) NOT NULL,
      address TEXT NOT NULL,
      latitude DECIMAL(10, 8) NOT NULL,
      longitude DECIMAL(11, 8) NOT NULL,
      status ENUM('pending', 'active', 'rejected') DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,

    // Vehicles table
    `CREATE TABLE IF NOT EXISTS vehicles (
      id VARCHAR(50) PRIMARY KEY,
      service_id INT NOT NULL,
      type ENUM('ambulance', 'fire_engine') NOT NULL,
      status ENUM('available', 'dispatched', 'en_route', 'at_scene', 'returning', 'maintenance') DEFAULT 'available',
      latitude DECIMAL(10, 8) DEFAULT NULL,
      longitude DECIMAL(11, 8) DEFAULT NULL,
      FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
    )`,

    // Incidents table
    `CREATE TABLE IF NOT EXISTS incidents (
      id INT AUTO_INCREMENT PRIMARY KEY,
      type VARCHAR(50) NOT NULL,
      latitude DECIMAL(10, 8) NOT NULL,
      longitude DECIMAL(11, 8) NOT NULL,
      description TEXT,
      source VARCHAR(50) NOT NULL,
      reporter_id INT NULL,
      status ENUM('reported', 'verified', 'service_alerted', 'vehicle_dispatched', 'en_route', 'at_scene', 'resolved') DEFAULT 'reported',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE SET NULL
    )`,

    // Incident images table
    `CREATE TABLE IF NOT EXISTS incident_images (
      id INT AUTO_INCREMENT PRIMARY KEY,
      incident_id INT NOT NULL,
      image_url VARCHAR(1024) NOT NULL,
      FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE
    )`,

    // Dispatches table
    `CREATE TABLE IF NOT EXISTS dispatches (
      id INT AUTO_INCREMENT PRIMARY KEY,
      incident_id INT NOT NULL,
      service_id INT NOT NULL,
      vehicle_id VARCHAR(50) NULL,
      status ENUM('awaiting_response', 'dispatched', 'en_route', 'at_scene', 'returning', 'completed') DEFAULT 'awaiting_response',
      route_geometry LONGTEXT, -- Stores GeoJSON string of coordinates
      normal_eta INT, -- In seconds
      optimized_eta INT, -- In seconds
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE,
      FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
      FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL
    )`,

    // Vehicle tracking table
    `CREATE TABLE IF NOT EXISTS vehicle_tracking (
      id INT AUTO_INCREMENT PRIMARY KEY,
      vehicle_id VARCHAR(50) NOT NULL,
      latitude DECIMAL(10, 8) NOT NULL,
      longitude DECIMAL(11, 8) NOT NULL,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
    )`,

    // Green corridors table
    `CREATE TABLE IF NOT EXISTS green_corridors (
      id INT AUTO_INCREMENT PRIMARY KEY,
      dispatch_id INT NOT NULL,
      status ENUM('active', 'inactive') DEFAULT 'inactive',
      signals_state JSON DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (dispatch_id) REFERENCES dispatches(id) ON DELETE CASCADE
    )`,

    // Notifications table
    `CREATE TABLE IF NOT EXISTS notifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      title VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      is_read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,

    // Incident timeline table
    `CREATE TABLE IF NOT EXISTS incident_timeline (
      id INT AUTO_INCREMENT PRIMARY KEY,
      incident_id INT NOT NULL,
      event_type VARCHAR(100) NOT NULL,
      event_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      description TEXT NOT NULL,
      FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE
    )`,

    // Incident coordinate audit table
    `CREATE TABLE IF NOT EXISTS incident_coordinate_audit (
      id INT AUTO_INCREMENT PRIMARY KEY,
      incident_id INT NOT NULL,
      original_latitude DECIMAL(10, 8) NOT NULL,
      original_longitude DECIMAL(11, 8) NOT NULL,
      updated_latitude DECIMAL(10, 8) NOT NULL,
      updated_longitude DECIMAL(11, 8) NOT NULL,
      edited_by INT NOT NULL,
      edited_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      reason_for_change TEXT NOT NULL,
      FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE,
      FOREIGN KEY (edited_by) REFERENCES users(id) ON DELETE CASCADE
    )`,

    // System settings table
    `CREATE TABLE IF NOT EXISTS system_settings (
      setting_key VARCHAR(100) PRIMARY KEY,
      setting_value TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,

    // OSM Traffic Signals Cache table
    `CREATE TABLE IF NOT EXISTS osm_traffic_signals (
      osm_id BIGINT PRIMARY KEY,
      latitude DECIMAL(10, 8) NOT NULL,
      longitude DECIMAL(11, 8) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    // Incident acknowledgements table
    `CREATE TABLE IF NOT EXISTS incident_acknowledgements (
      id INT AUTO_INCREMENT PRIMARY KEY,
      incident_id INT NOT NULL,
      admin_id INT NOT NULL,
      acknowledged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      status VARCHAR(50) NOT NULL,
      FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE,
      FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE
    )`,

    // Incident escalations table
    `CREATE TABLE IF NOT EXISTS incident_escalations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      incident_id INT NOT NULL,
      escalation_level INT NOT NULL,
      escalated_to_role VARCHAR(50) NOT NULL,
      escalated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      status VARCHAR(50) NOT NULL DEFAULT 'escalated',
      FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE
    )`
  ];

  for (const query of queries) {
    try {
      await pool.query(query);
    } catch (err) {
      console.error('Error running DDL query:', query);
      console.error(err);
      throw err;
    }
  }

  // Database migrations - dynamically adding columns if not exists
  const addColumnIfNotExists = async (table, column, definition) => {
    const [rows] = await pool.query(
      `SELECT * FROM information_schema.COLUMNS 
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [dbName, table, column]
    );
    if (rows.length === 0) {
      await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
      console.log(`Added column ${column} to table ${table}`);
    }
  };

  try {
    await addColumnIfNotExists('citizens', 'phone', 'VARCHAR(20) DEFAULT NULL');
    await addColumnIfNotExists('citizens', 'emergency_contact', 'VARCHAR(20) DEFAULT NULL');
    await addColumnIfNotExists('dispatches', 'outcome', 'VARCHAR(100) DEFAULT NULL');
    await addColumnIfNotExists('dispatches', 'fire_severity', 'VARCHAR(50) DEFAULT NULL');
    await addColumnIfNotExists('dispatches', 'water_consumption', 'INT DEFAULT NULL');
    await addColumnIfNotExists('dispatches', 'time_to_control', 'INT DEFAULT NULL');
    await addColumnIfNotExists('dispatches', 'time_to_extinguish', 'INT DEFAULT NULL');
    await addColumnIfNotExists('vehicles', 'driver_name', 'VARCHAR(100) DEFAULT NULL');

    // Modify incident columns to avoid ENUM constraints as categories and sources grow.
    await pool.query(`ALTER TABLE incidents MODIFY COLUMN type VARCHAR(50) NOT NULL`);
    await pool.query(`ALTER TABLE incidents MODIFY COLUMN source VARCHAR(50) NOT NULL`);

    // Modify status columns to avoid ENUM constraints
    await pool.query(`ALTER TABLE incidents MODIFY COLUMN status VARCHAR(50) DEFAULT 'reported'`);
    await pool.query(`ALTER TABLE dispatches MODIFY COLUMN status VARCHAR(50) DEFAULT 'awaiting_response'`);

    await seedSystemSettings();
    console.log('Database migrations completed successfully.');
  } catch (migErr) {
    console.error('Migration error:', migErr);
  }
  console.log('Database schema checked/created successfully.');
}

async function seedSystemSettings() {
  const defaults = {
    medical_emergency_coordinator_phone: process.env.MEDICAL_EMERGENCY_COORDINATOR_PHONE || '',
    fire_emergency_coordinator_phone: process.env.FIRE_EMERGENCY_COORDINATOR_PHONE || ''
  };

  for (const [key, value] of Object.entries(defaults)) {
    await pool.query(
      'INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES (?, ?)',
      [key, value]
    );
  }
}

async function seedAdmins() {
  const admins = [
    { email: 'medical_admin@idp.com', role: 'medical_admin', name: 'Medical Admin' },
    { email: 'fire_admin@idp.com', role: 'fire_admin', name: 'Fire Admin' },
    { email: 'traffic_admin@idp.com', role: 'traffic_admin', name: 'Traffic Admin' }
  ];

  const defaultPassword = 'admin123';

  for (const admin of admins) {
    try {
      const [rows] = await pool.query('SELECT id FROM users WHERE email = ?', [admin.email]);
      if (rows.length === 0) {
        const passwordHash = await bcrypt.hash(defaultPassword, 10);
        // Insert user
        const [userResult] = await pool.query(
          'INSERT INTO users (email, password_hash, role, status) VALUES (?, ?, ?, ?)',
          [admin.email, passwordHash, admin.role, 'active']
        );
        const userId = userResult.insertId;

        // Insert admin record in admins (we can use notifications or just a name insert, but we don't have separate admin detail tables required, so we just seed the user and can have details if needed. Let's make sure it is clean)
        console.log(`Seeded default admin user: ${admin.email} (password: ${defaultPassword})`);
      }
    } catch (err) {
      console.error(`Error seeding admin ${admin.email}:`, err);
    }
  }
}

async function addTimelineEvent(incidentId, eventType, description) {
  try {
    await pool.query(
      'INSERT INTO incident_timeline (incident_id, event_type, description) VALUES (?, ?, ?)',
      [incidentId, eventType, description]
    );
    const socketModule = require('./socket');
    const io = socketModule.getIo();
    if (io) {
      io.emit('timeline_update', { incidentId, eventType, description, timestamp: new Date() });
    }
  } catch (err) {
    console.error('Error adding timeline event:', err);
  }
}

module.exports = {
  initDB,
  query: (sql, params) => pool.query(sql, params),
  getPool: () => pool,
  addTimelineEvent
};
