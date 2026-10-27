const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');

/**
 * Validation helper for Student
 */
function validateStudentInput(data, isUpdate = false) {
  const errors = [];
  const { std_name, email, contact } = data;

  if (!isUpdate || std_name !== undefined) {
    if (!std_name || typeof std_name !== 'string' || std_name.trim().length === 0) {
      errors.push('Student name is required and cannot be empty.');
    } else if (std_name.trim().length > 100) {
      errors.push('Student name must be 100 characters or fewer.');
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

  if (contact !== undefined && contact !== null && contact !== '') {
    if (typeof contact !== 'string' || contact.trim().length > 15) {
      errors.push('Contact number must be 15 characters or fewer.');
    }
  }

  return errors;
}

/**
 * GET /api/students
 * List all students with optional search
 */
router.get('/', async (req, res, next) => {
  try {
    const { search } = req.query;
    let sql = `
      SELECT 
        s.std_id,
        s.std_name,
        s.email,
        s.contact,
        COUNT(DISTINCT e.enrollment_id) AS enrolled_courses_count
      FROM Student s
      LEFT JOIN Enrollment e ON s.std_id = e.std_id
    `;
    const params = [];

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      sql += ` WHERE s.std_name LIKE ? OR s.email LIKE ? OR CAST(s.std_id AS CHAR) = ? `;
      params.push(term, term, search.trim());
    }

    sql += ` GROUP BY s.std_id, s.std_name, s.email, s.contact ORDER BY s.std_id DESC;`;

    const [rows] = await pool.query(sql, params);
    res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/students/:id
 * Get single student by ID
 */
router.get('/:id', async (req, res, next) => {
  try {
    const stdId = parseInt(req.params.id, 10);
    if (isNaN(stdId)) {
      return res.status(400).json({ success: false, error: 'Invalid student ID parameter.' });
    }

    const [rows] = await pool.query(
      'SELECT std_id, std_name, email, contact FROM Student WHERE std_id = ?;',
      [stdId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Student not found.' });
    }

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/students/:id/details
 * Get full student portfolio: enrollments, submissions, certificates
 */
router.get('/:id/details', async (req, res, next) => {
  try {
    const stdId = parseInt(req.params.id, 10);
    if (isNaN(stdId)) {
      return res.status(400).json({ success: false, error: 'Invalid student ID parameter.' });
    }

    const [studentRows] = await pool.query(
      'SELECT std_id, std_name, email, contact FROM Student WHERE std_id = ?;',
      [stdId]
    );
    if (studentRows.length === 0) {
      return res.status(404).json({ success: false, error: 'Student not found.' });
    }

    // Enrolled courses
    const [enrollments] = await pool.query(
      `SELECT e.enrollment_id, e.enrollment_date, c.course_id, c.course_name, c.price, i.inst_name
       FROM Enrollment e
       JOIN Course c ON e.course_id = c.course_id
       LEFT JOIN Instructor i ON c.instructor_id = i.instructor_id
       WHERE e.std_id = ?
       ORDER BY e.enrollment_date DESC;`,
      [stdId]
    );

    // Submissions
    const [submissions] = await pool.query(
      `SELECT sub.submission_id, sub.submission_date, sub.marks_obtained, a.title AS assignment_title,
              a.total_marks, c.course_name, ev.feedback, ev.evaluation_date
       FROM Submission sub
       JOIN Assignment a ON sub.asg_id = a.asg_id
       JOIN Course c ON a.course_id = c.course_id
       LEFT JOIN Evaluation ev ON sub.submission_id = ev.submission_id
       WHERE sub.std_id = ?
       ORDER BY sub.submission_date DESC;`,
      [stdId]
    );

    // Certificates
    const [certificates] = await pool.query(
      `SELECT cert.certificate_id, cert.issue_date, c.course_name
       FROM Certificate cert
       JOIN Course c ON cert.course_id = c.course_id
       WHERE cert.std_id = ?
       ORDER BY cert.issue_date DESC;`,
      [stdId]
    );

    res.json({
      success: true,
      data: {
        student: studentRows[0],
        enrollments,
        submissions,
        certificates,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/students
 * Create a new student
 */
router.post('/', async (req, res, next) => {
  try {
    const { std_name, email, contact } = req.body;
    const errors = validateStudentInput({ std_name, email, contact });
    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    const [result] = await pool.execute(
      'INSERT INTO Student (std_name, email, contact) VALUES (?, ?, ?);',
      [std_name.trim(), email.trim(), contact ? contact.trim() : null]
    );

    const newStudentId = result.insertId;
    const [createdRows] = await pool.query(
      'SELECT std_id, std_name, email, contact FROM Student WHERE std_id = ?;',
      [newStudentId]
    );

    res.status(201).json({
      success: true,
      message: 'Student registered successfully.',
      data: createdRows[0],
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/students/:id
 * Update an existing student
 */
router.put('/:id', async (req, res, next) => {
  try {
    const stdId = parseInt(req.params.id, 10);
    if (isNaN(stdId)) {
      return res.status(400).json({ success: false, error: 'Invalid student ID parameter.' });
    }

    const { std_name, email, contact } = req.body;
    const errors = validateStudentInput({ std_name, email, contact }, true);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    // Verify existence
    const [existing] = await pool.query('SELECT std_id FROM Student WHERE std_id = ?;', [stdId]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'Student not found.' });
    }

    await pool.execute(
      'UPDATE Student SET std_name = ?, email = ?, contact = ? WHERE std_id = ?;',
      [std_name.trim(), email.trim(), contact ? contact.trim() : null, stdId]
    );

    const [updatedRows] = await pool.query(
      'SELECT std_id, std_name, email, contact FROM Student WHERE std_id = ?;',
      [stdId]
    );

    res.json({
      success: true,
      message: 'Student updated successfully.',
      data: updatedRows[0],
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/students/:id
 * Delete a student (respecting foreign key relationships)
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const stdId = parseInt(req.params.id, 10);
    if (isNaN(stdId)) {
      return res.status(400).json({ success: false, error: 'Invalid student ID parameter.' });
    }

    // Check for referencing records first to provide friendly feedback
    const [enrollments] = await pool.query('SELECT COUNT(*) as count FROM Enrollment WHERE std_id = ?;', [stdId]);
    const [submissions] = await pool.query('SELECT COUNT(*) as count FROM Submission WHERE std_id = ?;', [stdId]);
    const [certificates] = await pool.query('SELECT COUNT(*) as count FROM Certificate WHERE std_id = ?;', [stdId]);

    const activeDependencies = [];
    if (enrollments[0].count > 0) activeDependencies.push(`${enrollments[0].count} enrollment(s)`);
    if (submissions[0].count > 0) activeDependencies.push(`${submissions[0].count} submission(s)`);
    if (certificates[0].count > 0) activeDependencies.push(`${certificates[0].count} certificate(s)`);

    if (activeDependencies.length > 0) {
      return res.status(409).json({
        success: false,
        error: `Cannot delete student #${stdId} because active records depend on it: ${activeDependencies.join(', ')}. Please remove or transfer dependent records first.`,
      });
    }

    const [result] = await pool.execute('DELETE FROM Student WHERE std_id = ?;', [stdId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: 'Student not found.' });
    }

    res.json({
      success: true,
      message: `Student #${stdId} deleted successfully.`,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
