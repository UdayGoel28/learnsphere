const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');

/**
 * Validation helper for Instructor
 */
function validateInstructorInput(data, isUpdate = false) {
  const errors = [];
  const { inst_name, email, qualification } = data;

  if (!isUpdate || inst_name !== undefined) {
    if (!inst_name || typeof inst_name !== 'string' || inst_name.trim().length === 0) {
      errors.push('Instructor name is required.');
    } else if (inst_name.trim().length > 100) {
      errors.push('Instructor name must be 100 characters or fewer.');
    }
  }

  if (!isUpdate || email !== undefined) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || typeof email !== 'string' || !emailRegex.test(email.trim())) {
      errors.push('A valid email address is required.');
    } else if (email.trim().length > 100) {
      errors.push('Email address must be 100 characters or fewer.');
    }
  }

  if (qualification !== undefined && qualification !== null && qualification !== '') {
    if (typeof qualification !== 'string' || qualification.trim().length > 100) {
      errors.push('Qualification must be 100 characters or fewer.');
    }
  }

  return errors;
}

/**
 * GET /api/instructors
 * List all instructors with courses taught count
 */
router.get('/', async (req, res, next) => {
  try {
    const { search } = req.query;
    let sql = `
      SELECT 
        i.instructor_id,
        i.inst_name,
        i.email,
        i.qualification,
        COUNT(c.course_id) AS total_courses
      FROM Instructor i
      LEFT JOIN Course c ON i.instructor_id = c.instructor_id
    `;
    const params = [];

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      sql += ` WHERE i.inst_name LIKE ? OR i.email LIKE ? OR i.qualification LIKE ? `;
      params.push(term, term, term);
    }

    sql += ` GROUP BY i.instructor_id, i.inst_name, i.email, i.qualification ORDER BY i.instructor_id DESC;`;

    const [rows] = await pool.query(sql, params);
    res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/instructors/:id
 * Get single instructor
 */
router.get('/:id', async (req, res, next) => {
  try {
    const instId = parseInt(req.params.id, 10);
    if (isNaN(instId)) {
      return res.status(400).json({ success: false, error: 'Invalid instructor ID.' });
    }

    const [rows] = await pool.query(
      'SELECT instructor_id, inst_name, email, qualification FROM Instructor WHERE instructor_id = ?;',
      [instId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Instructor not found.' });
    }

    // Courses taught
    const [courses] = await pool.query(
      'SELECT course_id, course_name, price FROM Course WHERE instructor_id = ?;',
      [instId]
    );

    res.json({
      success: true,
      data: {
        ...rows[0],
        courses,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/instructors
 * Create instructor
 */
router.post('/', async (req, res, next) => {
  try {
    const { inst_name, email, qualification } = req.body;
    const errors = validateInstructorInput({ inst_name, email, qualification });
    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    const [result] = await pool.execute(
      'INSERT INTO Instructor (inst_name, email, qualification) VALUES (?, ?, ?);',
      [inst_name.trim(), email.trim(), qualification ? qualification.trim() : null]
    );

    const [created] = await pool.query(
      'SELECT instructor_id, inst_name, email, qualification FROM Instructor WHERE instructor_id = ?;',
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      message: 'Instructor registered successfully.',
      data: created[0],
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/instructors/:id
 * Update instructor
 */
router.put('/:id', async (req, res, next) => {
  try {
    const instId = parseInt(req.params.id, 10);
    if (isNaN(instId)) {
      return res.status(400).json({ success: false, error: 'Invalid instructor ID.' });
    }

    const { inst_name, email, qualification } = req.body;
    const errors = validateInstructorInput({ inst_name, email, qualification }, true);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    const [existing] = await pool.query('SELECT instructor_id FROM Instructor WHERE instructor_id = ?;', [instId]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'Instructor not found.' });
    }

    await pool.execute(
      'UPDATE Instructor SET inst_name = ?, email = ?, qualification = ? WHERE instructor_id = ?;',
      [inst_name.trim(), email.trim(), qualification ? qualification.trim() : null, instId]
    );

    const [updated] = await pool.query(
      'SELECT instructor_id, inst_name, email, qualification FROM Instructor WHERE instructor_id = ?;',
      [instId]
    );

    res.json({
      success: true,
      message: 'Instructor updated successfully.',
      data: updated[0],
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/instructors/:id
 * Delete instructor
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const instId = parseInt(req.params.id, 10);
    if (isNaN(instId)) {
      return res.status(400).json({ success: false, error: 'Invalid instructor ID.' });
    }

    const [courses] = await pool.query('SELECT COUNT(*) as count FROM Course WHERE instructor_id = ?;', [instId]);
    const [evaluations] = await pool.query('SELECT COUNT(*) as count FROM Evaluation WHERE instructor_id = ?;', [instId]);

    const activeDeps = [];
    if (courses[0].count > 0) activeDeps.push(`${courses[0].count} course(s) assigned`);
    if (evaluations[0].count > 0) activeDeps.push(`${evaluations[0].count} evaluation(s) conducted`);

    if (activeDeps.length > 0) {
      return res.status(409).json({
        success: false,
        error: `Cannot delete instructor #${instId} because active records depend on them: ${activeDeps.join(', ')}.`,
      });
    }

    const [result] = await pool.execute('DELETE FROM Instructor WHERE instructor_id = ?;', [instId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: 'Instructor not found.' });
    }

    res.json({
      success: true,
      message: `Instructor #${instId} deleted successfully.`,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
