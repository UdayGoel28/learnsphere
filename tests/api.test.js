const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const app = require('../server');
const { pool, checkDatabaseHealth } = require('../config/db');

let server;
let baseUrl;

function makeRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const req = http.request(url, options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve({ status: res.statusCode, headers: res.headers, body: json, rawBody: body });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, rawBody: body });
        }
      });
    });
    req.on('error', reject);
    if (options.data) {
      req.write(typeof options.data === 'string' ? options.data : JSON.stringify(options.data));
    }
    req.end();
  });
}

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  // Do not destroy pool completely if needed elsewhere, but close cleanly
  await pool.end();
});

describe('1. System & Database Health Checks', () => {
  test('GET /api/health should return ok and uptime', async () => {
    const res = await makeRequest('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
    assert.equal(res.body.service, 'LearnSphere API');
  });

  test('GET /api/health/db should verify live MySQL connectivity', async () => {
    const res = await makeRequest('/api/health/db');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
    assert.equal(res.body.database.connected, true);
    assert.equal(res.body.database.database, 'learnsphere');
  });
});

describe('2. Dashboard Metrics & Relational Reports', () => {
  test('GET /api/dashboard/stats returns real counts matching DB queries', async () => {
    const res = await makeRequest('/api/dashboard/stats');
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    const { data } = res.body;

    assert.ok(typeof data.students === 'number' && data.students >= 0);
    assert.ok(typeof data.courses === 'number' && data.courses >= 0);
    assert.ok(typeof data.instructors === 'number' && data.instructors >= 0);
    assert.ok(typeof data.enrollments === 'number' && data.enrollments >= 0);
    assert.ok(typeof data.lessons === 'number' && data.lessons >= 0);
    assert.ok(typeof data.studyMaterials === 'number' && data.studyMaterials >= 0);
    assert.ok(typeof data.assignments === 'number' && data.assignments >= 0);
    assert.ok(typeof data.submissions === 'number' && data.submissions >= 0);
    assert.ok(typeof data.evaluations === 'number' && data.evaluations >= 0);
    assert.ok(typeof data.certificates === 'number' && data.certificates >= 0);
  });

  test('GET /api/dashboard/reports returns populated relational structures', async () => {
    const res = await makeRequest('/api/dashboard/reports');
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.data.courseEnrollments));
    assert.ok(Array.isArray(res.body.data.instructorCourses));
    assert.ok(Array.isArray(res.body.data.recentEnrollments));
    assert.ok(Array.isArray(res.body.data.recentSubmissions));
  });
});

describe('3. Students API & Validation', () => {
  test('GET /api/students returns student list', async () => {
    const res = await makeRequest('/api/students');
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.data));
  });

  test('GET /api/students/:id returns 404 for non-existent ID', async () => {
    const res = await makeRequest('/api/students/999999');
    assert.equal(res.status, 404);
    assert.equal(res.body.success, false);
  });

  test('GET /api/students/:id returns 400 for invalid non-numeric ID', async () => {
    const res = await makeRequest('/api/students/abc');
    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
  });

  test('POST /api/students returns 400 validation error when name or email is missing', async () => {
    const res = await makeRequest('/api/students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      data: { std_name: '', email: 'notanemail' },
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.ok(Array.isArray(res.body.errors));
    assert.ok(res.body.errors.length >= 2);
  });
});

describe('4. Courses API & Validation', () => {
  test('GET /api/courses returns course catalog with instructor info', async () => {
    const res = await makeRequest('/api/courses');
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.data));
  });

  test('POST /api/courses returns 400 for invalid price or non-existent instructor', async () => {
    const res = await makeRequest('/api/courses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      data: { course_name: 'Test', price: -50, instructor_id: 999999 },
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.ok(Array.isArray(res.body.errors));
  });
});

describe('5. Remaining Entity Endpoints', () => {
  const endpoints = [
    '/api/instructors',
    '/api/enrollments',
    '/api/lessons',
    '/api/study-materials',
    '/api/assignments',
    '/api/submissions',
    '/api/evaluations',
    '/api/certificates',
  ];

  for (const ep of endpoints) {
    test(`GET ${ep} responds with 200 and data array`, async () => {
      const res = await makeRequest(ep);
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(Array.isArray(res.body.data));
    });
  }
});

describe('6. Static Views Delivery & Error Handling', () => {
  test('GET / serves dashboard.html', async () => {
    const res = await makeRequest('/');
    assert.equal(res.status, 200);
    assert.ok(res.rawBody.includes('LearnSphere'));
    assert.ok(res.rawBody.includes('Platform Overview'));
  });

  test('GET /students serves students.html', async () => {
    const res = await makeRequest('/students');
    assert.equal(res.status, 200);
    assert.ok(res.rawBody.includes('Student Directory'));
  });

  test('GET /api/nonexistent returns JSON 404', async () => {
    const res = await makeRequest('/api/nonexistent');
    assert.equal(res.status, 404);
    assert.equal(res.body.success, false);
  });

  test('GET /random-unknown-page serves error.html', async () => {
    const res = await makeRequest('/random-unknown-page');
    assert.equal(res.status, 404);
    assert.ok(res.rawBody.includes('404 - Page Not Found'));
  });
});
