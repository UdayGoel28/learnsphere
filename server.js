require('dotenv').config();
const express = require('express');
const path = require('path');
const { checkDatabaseHealth } = require('./config/db');
const errorHandler = require('./middleware/errorHandler');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend assets (css, js, images)
app.use(express.static(path.join(__dirname, 'public')));

// Basic server health endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    service: 'LearnSphere API',
  });
});

// Database health endpoint
app.get('/api/health/db', async (req, res) => {
  const health = await checkDatabaseHealth();
  if (health.connected) {
    res.json({
      status: 'ok',
      database: health,
    });
  } else {
    res.status(503).json({
      status: 'error',
      database: health,
    });
  }
});

// Modular REST API routes
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/students', require('./routes/students'));
app.use('/api/courses', require('./routes/courses'));
app.use('/api/instructors', require('./routes/instructors'));
app.use('/api/enrollments', require('./routes/enrollments'));
app.use('/api/lessons', require('./routes/lessons'));
app.use('/api/study-materials', require('./routes/studyMaterials'));
app.use('/api/assignments', require('./routes/assignments'));
app.use('/api/submissions', require('./routes/submissions'));
app.use('/api/evaluations', require('./routes/evaluations'));
app.use('/api/certificates', require('./routes/certificates'));

// Views routing
const serveView = (viewName) => (req, res) => {
  res.sendFile(path.join(__dirname, 'views', viewName));
};

app.get('/', serveView('dashboard.html'));
app.get('/dashboard', serveView('dashboard.html'));
app.get('/students', serveView('students.html'));
app.get('/courses', serveView('courses.html'));
app.get('/instructors', serveView('instructors.html'));
app.get('/enrollments', serveView('enrollments.html'));
app.get('/lessons', serveView('lessons.html'));
app.get('/study-materials', serveView('study-materials.html'));
app.get('/assignments', serveView('assignments.html'));
app.get('/submissions', serveView('submissions.html'));
app.get('/evaluations', serveView('evaluations.html'));
app.get('/certificates', serveView('certificates.html'));

// 404 Handler for API endpoints
app.use('/api', (req, res) => {
  res.status(404).json({
    success: false,
    error: `API route ${req.method} ${req.originalUrl} not found.`,
  });
});

// 404 Handler for web views
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'views', 'error.html'));
});

// Centralized error handler
app.use(errorHandler);

// Start server only when executed directly
if (require.main === module) {
  app.listen(PORT, async () => {
    console.log(`\n======================================================`);
    console.log(`  LearnSphere RDBMS Dashboard Server`);
    console.log(`  Live on: http://localhost:${PORT}`);
    console.log(`======================================================`);

    const dbHealth = await checkDatabaseHealth();
    if (dbHealth.connected) {
      console.log(`  MySQL Connection: ACTIVE & CONNECTED (${dbHealth.database} on ${dbHealth.host}:${dbHealth.port})`);
    } else {
      console.warn(`  MySQL Connection: WARNING - ${dbHealth.message}`);
    }
    console.log(`======================================================\n`);
  });
}

module.exports = app;
