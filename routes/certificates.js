const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');

/**
 * Validation helper for Certificate
 */
async function validateCertificateInput(data, isUpdate = false) {
  const errors = [];
  const { std_id, course_id, issue_date } = data;

  if (!isUpdate || std_id !== undefined) {
    const sId = parseInt(std_id, 10);
    if (isNaN(sId)) {
      errors.push('A valid Student ID is required.');
    } else {
      const [s] = await pool.query('SELECT std_id FROM Student WHERE std_id = ?;', [sId]);
      if (s.length === 0) errors.push(`Student with ID ${sId} does not exist.`);
    }
  }

  if (!isUpdate || course_id !== undefined) {
    const cId = parseInt(course_id, 10);
    if (isNaN(cId)) {
      errors.push('A valid Course ID is required.');
    } else {
      const [c] = await pool.query('SELECT course_id FROM Course WHERE course_id = ?;', [cId]);
      if (c.length === 0) errors.push(`Course with ID ${cId} does not exist.`);
    }
  }

  if (!isUpdate || issue_date !== undefined) {
    if (!issue_date || isNaN(Date.parse(issue_date))) {
      errors.push('A valid issue date (YYYY-MM-DD) is required.');
    }
  }

  return errors;
}

/**
 * GET /api/certificates
 * List all certificates with student and course details
 */
router.get('/', async (req, res, next) => {
  try {
    const { course_id, std_id, search } = req.query;
    let sql = `
      SELECT 
        cert.certificate_id,
        cert.issue_date,
        cert.std_id,
        s.std_name,
        s.email AS student_email,
        cert.course_id,
        c.course_name,
        i.inst_name AS instructor_name
      FROM Certificate cert
      JOIN Student s ON cert.std_id = s.std_id
      JOIN Course c ON cert.course_id = c.course_id
      LEFT JOIN Instructor i ON c.instructor_id = i.instructor_id
    `;
    const params = [];
    const conditions = [];

    if (course_id) {
      conditions.push('cert.course_id = ?');
      params.push(parseInt(course_id, 10));
    }
    if (std_id) {
      conditions.push('cert.std_id = ?');
      params.push(parseInt(std_id, 10));
    }
    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      conditions.push('(s.std_name LIKE ? OR s.email LIKE ? OR c.course_name LIKE ?)');
      params.push(term, term, term);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY cert.issue_date DESC, cert.certificate_id DESC;';

    const [rows] = await pool.query(sql, params);
    res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/certificates/:id
 * Get single certificate
 */
router.get('/:id', async (req, res, next) => {
  try {
    const certId = parseInt(req.params.id, 10);
    if (isNaN(certId)) {
      return res.status(400).json({ success: false, error: 'Invalid certificate ID.' });
    }

    const [rows] = await pool.query(
      `SELECT cert.certificate_id, cert.issue_date, cert.std_id, s.std_name, s.email AS student_email,
              cert.course_id, c.course_name, i.inst_name AS instructor_name
       FROM Certificate cert
       JOIN Student s ON cert.std_id = s.std_id
       JOIN Course c ON cert.course_id = c.course_id
       LEFT JOIN Instructor i ON c.instructor_id = i.instructor_id
       WHERE cert.certificate_id = ?;`,
      [certId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Certificate not found.' });
    }

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/certificates
 * Issue certificate
 */
router.post('/', async (req, res, next) => {
  try {
    const { std_id, course_id, issue_date } = req.body;
    const errors = await validateCertificateInput({ std_id, course_id, issue_date });
    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    const formattedDate = new Date(issue_date).toISOString().split('T')[0];

    const [result] = await pool.execute(
      'INSERT INTO Certificate (std_id, course_id, issue_date) VALUES (?, ?, ?);',
      [std_id, course_id, formattedDate]
    );

    const [created] = await pool.query(
      `SELECT cert.certificate_id, cert.issue_date, cert.std_id, s.std_name, cert.course_id, c.course_name
       FROM Certificate cert
       JOIN Student s ON cert.std_id = s.std_id
       JOIN Course c ON cert.course_id = c.course_id
       WHERE cert.certificate_id = ?;`,
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      message: 'Certificate issued successfully.',
      data: created[0],
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/certificates/:id
 * Update certificate
 */
router.put('/:id', async (req, res, next) => {
  try {
    const certId = parseInt(req.params.id, 10);
    if (isNaN(certId)) {
      return res.status(400).json({ success: false, error: 'Invalid certificate ID.' });
    }

    const { std_id, course_id, issue_date } = req.body;
    const errors = await validateCertificateInput({ std_id, course_id, issue_date }, true);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    const [existing] = await pool.query('SELECT certificate_id FROM Certificate WHERE certificate_id = ?;', [certId]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'Certificate not found.' });
    }

    const formattedDate = new Date(issue_date).toISOString().split('T')[0];

    await pool.execute(
      'UPDATE Certificate SET std_id = ?, course_id = ?, issue_date = ? WHERE certificate_id = ?;',
      [std_id, course_id, formattedDate, certId]
    );

    const [updated] = await pool.query(
      `SELECT cert.certificate_id, cert.issue_date, cert.std_id, s.std_name, cert.course_id, c.course_name
       FROM Certificate cert
       JOIN Student s ON cert.std_id = s.std_id
       JOIN Course c ON cert.course_id = c.course_id
       WHERE cert.certificate_id = ?;`,
      [certId]
    );

    res.json({
      success: true,
      message: 'Certificate updated successfully.',
      data: updated[0],
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/certificates/:id
 * Revoke/delete certificate
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const certId = parseInt(req.params.id, 10);
    if (isNaN(certId)) {
      return res.status(400).json({ success: false, error: 'Invalid certificate ID.' });
    }

    const [result] = await pool.execute('DELETE FROM Certificate WHERE certificate_id = ?;', [certId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: 'Certificate not found.' });
    }

    res.json({
      success: true,
      message: `Certificate #${certId} revoked successfully.`,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
