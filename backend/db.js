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
      type ENUM('accident', 'fire', 'gas_leak', 'medical_emergency') NOT NULL,
      latitude DECIMAL(10, 8) NOT NULL,
      longitude DECIMAL(11, 8) NOT NULL,
      description TEXT,
      source ENUM('citizen', 'sensor') NOT NULL,
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
  console.log('Database schema checked/created successfully.');
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

module.exports = {
  initDB,
  query: (sql, params) => pool.query(sql, params),
  getPool: () => pool
};
