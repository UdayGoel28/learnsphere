const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');

/**
 * Validation helper for Enrollment
 */
async function validateEnrollmentInput(data, isUpdate = false) {
  const errors = [];
  const { std_id, course_id, enrollment_date } = data;

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

  if (!isUpdate || enrollment_date !== undefined) {
    if (!enrollment_date || isNaN(Date.parse(enrollment_date))) {
      errors.push('A valid enrollment date (YYYY-MM-DD) is required.');
    }
  }

  return errors;
}

/**
 * GET /api/enrollments
 * List all enrollments with student and course details
 */
router.get('/', async (req, res, next) => {
  try {
    const { search, course_id, std_id } = req.query;
    let sql = `
      SELECT 
        e.enrollment_id,
        e.enrollment_date,
        e.std_id,
        s.std_name,
        s.email AS student_email,
        e.course_id,
        c.course_name,
        c.price,
        i.inst_name AS instructor_name
      FROM Enrollment e
      JOIN Student s ON e.std_id = s.std_id
      JOIN Course c ON e.course_id = c.course_id
      LEFT JOIN Instructor i ON c.instructor_id = i.instructor_id
    `;
    const params = [];
    const conditions = [];

    if (course_id) {
      conditions.push('e.course_id = ?');
      params.push(parseInt(course_id, 10));
    }
    if (std_id) {
      conditions.push('e.std_id = ?');
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

    sql += ' ORDER BY e.enrollment_date DESC, e.enrollment_id DESC;';

    const [rows] = await pool.query(sql, params);
    res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/enrollments/:id
 * Get single enrollment
 */
router.get('/:id', async (req, res, next) => {
  try {
    const enrId = parseInt(req.params.id, 10);
    if (isNaN(enrId)) {
      return res.status(400).json({ success: false, error: 'Invalid enrollment ID.' });
    }

    const [rows] = await pool.query(
      `SELECT e.enrollment_id, e.enrollment_date, e.std_id, s.std_name, e.course_id, c.course_name
       FROM Enrollment e
       JOIN Student s ON e.std_id = s.std_id
       JOIN Course c ON e.course_id = c.course_id
       WHERE e.enrollment_id = ?;`,
      [enrId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Enrollment record not found.' });
    }

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/enrollments
 * Create enrollment
 */
router.post('/', async (req, res, next) => {
  try {
    const { std_id, course_id, enrollment_date } = req.body;
    const errors = await validateEnrollmentInput({ std_id, course_id, enrollment_date });
    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    // Check if student is already enrolled in this course
    const [existing] = await pool.query(
      'SELECT enrollment_id FROM Enrollment WHERE std_id = ? AND course_id = ?;',
      [std_id, course_id]
    );
    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        error: `Student #${std_id} is already enrolled in Course #${course_id}.`,
      });
    }

    const formattedDate = new Date(enrollment_date).toISOString().split('T')[0];

    const [result] = await pool.execute(
      'INSERT INTO Enrollment (std_id, course_id, enrollment_date) VALUES (?, ?, ?);',
      [std_id, course_id, formattedDate]
    );

    const [created] = await pool.query(
      `SELECT e.enrollment_id, e.enrollment_date, e.std_id, s.std_name, e.course_id, c.course_name
       FROM Enrollment e
       JOIN Student s ON e.std_id = s.std_id
       JOIN Course c ON e.course_id = c.course_id
       WHERE e.enrollment_id = ?;`,
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      message: 'Student enrolled successfully.',
      data: created[0],
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/enrollments/:id
 * Update enrollment
 */
router.put('/:id', async (req, res, next) => {
  try {
    const enrId = parseInt(req.params.id, 10);
    if (isNaN(enrId)) {
      return res.status(400).json({ success: false, error: 'Invalid enrollment ID.' });
    }

    const { std_id, course_id, enrollment_date } = req.body;
    const errors = await validateEnrollmentInput({ std_id, course_id, enrollment_date }, true);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    const [existing] = await pool.query('SELECT enrollment_id FROM Enrollment WHERE enrollment_id = ?;', [enrId]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'Enrollment record not found.' });
    }

    const formattedDate = new Date(enrollment_date).toISOString().split('T')[0];

    await pool.execute(
      'UPDATE Enrollment SET std_id = ?, course_id = ?, enrollment_date = ? WHERE enrollment_id = ?;',
      [std_id, course_id, formattedDate, enrId]
    );

    const [updated] = await pool.query(
      `SELECT e.enrollment_id, e.enrollment_date, e.std_id, s.std_name, e.course_id, c.course_name
       FROM Enrollment e
       JOIN Student s ON e.std_id = s.std_id
       JOIN Course c ON e.course_id = c.course_id
       WHERE e.enrollment_id = ?;`,
      [enrId]
    );

    res.json({
      success: true,
      message: 'Enrollment updated successfully.',
      data: updated[0],
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/enrollments/:id
 * Delete enrollment
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const enrId = parseInt(req.params.id, 10);
    if (isNaN(enrId)) {
      return res.status(400).json({ success: false, error: 'Invalid enrollment ID.' });
    }

    const [result] = await pool.execute('DELETE FROM Enrollment WHERE enrollment_id = ?;', [enrId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: 'Enrollment not found.' });
    }

    res.json({
      success: true,
      message: `Enrollment #${enrId} removed successfully.`,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
