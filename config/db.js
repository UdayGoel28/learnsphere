require('dotenv').config();
const mysql = require('mysql2/promise');

// Validate critical configuration variables
const requiredEnv = ['DB_HOST', 'DB_USER', 'DB_NAME'];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);
if (missingEnv.length > 0) {
  console.warn(`[DB WARNING] Missing required environment variable(s): ${missingEnv.join(', ')}. Please check .env`);
}

// Create connection pool using mysql2/promise
const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'learnsphere',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

/**
 * Health check function to verify live database connectivity
 * @returns {Promise<{connected: boolean, message: string, timestamp: string}>}
 */
async function checkDatabaseHealth() {
  try {
    const [rows] = await pool.query('SELECT 1 AS database_connected;');
    if (rows && rows[0] && rows[0].database_connected === 1) {
      return {
        connected: true,
        message: 'Database connection is active and healthy',
        database: process.env.DB_NAME || 'learnsphere',
        host: process.env.DB_HOST || '127.0.0.1',
        port: Number(process.env.DB_PORT) || 3306,
        timestamp: new Date().toISOString(),
      };
    }
    return {
      connected: false,
      message: 'Unexpected query response from database',
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    return {
      connected: false,
      message: `Database connection failed: ${err.message}`,
      code: err.code || 'UNKNOWN_ERROR',
      timestamp: new Date().toISOString(),
    };
  }
}

module.exports = {
  pool,
  checkDatabaseHealth,
};
