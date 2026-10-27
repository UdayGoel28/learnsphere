const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');

/**
 * Validation helper for Assignment
 */
async function validateAssignmentInput(data, isUpdate = false) {
  const errors = [];
  const { course_id, title, due_date, total_marks } = data;

  if (!isUpdate || course_id !== undefined) {
    const cId = parseInt(course_id, 10);
    if (isNaN(cId)) {
      errors.push('A valid Course ID is required.');
    } else {
      const [c] = await pool.query('SELECT course_id FROM Course WHERE course_id = ?;', [cId]);
      if (c.length === 0) errors.push(`Course with ID ${cId} does not exist.`);
    }
  }

  if (!isUpdate || title !== undefined) {
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      errors.push('Assignment title is required.');
    } else if (title.trim().length > 150) {
      errors.push('Assignment title must be 150 characters or fewer.');
    }
  }

  if (due_date !== undefined && due_date !== null && due_date !== '') {
    if (isNaN(Date.parse(due_date))) {
      errors.push('Due date must be a valid date (YYYY-MM-DD).');
    }
  }

  if (!isUpdate || total_marks !== undefined) {
    const marks = parseInt(total_marks, 10);
    if (isNaN(marks) || marks <= 0) {
      errors.push('Total marks must be a positive integer.');
    }
  }

  return errors;
}

/**
 * GET /api/assignments
 * List all assignments with course name and submission count
 */
router.get('/', async (req, res, next) => {
  try {
    const { course_id, search } = req.query;
    let sql = `
      SELECT 
        a.asg_id,
        a.title,
        a.due_date,
        a.total_marks,
        a.course_id,
        c.course_name,
        COUNT(s.submission_id) AS submission_count
      FROM Assignment a
      JOIN Course c ON a.course_id = c.course_id
      LEFT JOIN Submission s ON a.asg_id = s.asg_id
    `;
    const params = [];
    const conditions = [];

    if (course_id) {
      conditions.push('a.course_id = ?');
      params.push(parseInt(course_id, 10));
    }
    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      conditions.push('(a.title LIKE ? OR c.course_name LIKE ?)');
      params.push(term, term);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' GROUP BY a.asg_id, a.title, a.due_date, a.total_marks, a.course_id, c.course_name ORDER BY a.asg_id DESC;';

    const [rows] = await pool.query(sql, params);
    res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/assignments/:id
 * Get single assignment with submissions
 */
router.get('/:id', async (req, res, next) => {
  try {
    const asgId = parseInt(req.params.id, 10);
    if (isNaN(asgId)) {
      return res.status(400).json({ success: false, error: 'Invalid assignment ID.' });
    }

    const [rows] = await pool.query(
      `SELECT a.asg_id, a.title, a.due_date, a.total_marks, a.course_id, c.course_name
       FROM Assignment a
       JOIN Course c ON a.course_id = c.course_id
       WHERE a.asg_id = ?;`,
      [asgId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Assignment not found.' });
    }

    // Submissions for this assignment
    const [submissions] = await pool.query(
      `SELECT sub.submission_id, sub.submission_date, sub.marks_obtained, s.std_name, s.email, ev.feedback
       FROM Submission sub
       JOIN Student s ON sub.std_id = s.std_id
       LEFT JOIN Evaluation ev ON sub.submission_id = ev.submission_id
       WHERE sub.asg_id = ?
       ORDER BY sub.submission_date DESC;`,
      [asgId]
    );

    res.json({
      success: true,
      data: {
        ...rows[0],
        submissions,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/assignments
 * Create assignment
 */
router.post('/', async (req, res, next) => {
  try {
    const { course_id, title, due_date, total_marks } = req.body;
    const errors = await validateAssignmentInput({ course_id, title, due_date, total_marks });
    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    const formattedDate = due_date ? new Date(due_date).toISOString().split('T')[0] : null;

    const [result] = await pool.execute(
      'INSERT INTO Assignment (course_id, title, due_date, total_marks) VALUES (?, ?, ?, ?);',
      [course_id, title.trim(), formattedDate, parseInt(total_marks, 10)]
    );

    const [created] = await pool.query(
      `SELECT a.asg_id, a.title, a.due_date, a.total_marks, a.course_id, c.course_name
       FROM Assignment a
       JOIN Course c ON a.course_id = c.course_id
       WHERE a.asg_id = ?;`,
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      message: 'Assignment created successfully.',
      data: created[0],
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/assignments/:id
 * Update assignment
 */
router.put('/:id', async (req, res, next) => {
  try {
    const asgId = parseInt(req.params.id, 10);
    if (isNaN(asgId)) {
      return res.status(400).json({ success: false, error: 'Invalid assignment ID.' });
    }

    const { course_id, title, due_date, total_marks } = req.body;
    const errors = await validateAssignmentInput({ course_id, title, due_date, total_marks }, true);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    const [existing] = await pool.query('SELECT asg_id FROM Assignment WHERE asg_id = ?;', [asgId]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'Assignment not found.' });
    }

    const formattedDate = due_date ? new Date(due_date).toISOString().split('T')[0] : null;

    await pool.execute(
      'UPDATE Assignment SET course_id = ?, title = ?, due_date = ?, total_marks = ? WHERE asg_id = ?;',
      [course_id, title.trim(), formattedDate, parseInt(total_marks, 10), asgId]
    );

    const [updated] = await pool.query(
      `SELECT a.asg_id, a.title, a.due_date, a.total_marks, a.course_id, c.course_name
       FROM Assignment a
       JOIN Course c ON a.course_id = c.course_id
       WHERE a.asg_id = ?;`,
      [asgId]
    );

    res.json({
      success: true,
      message: 'Assignment updated successfully.',
      data: updated[0],
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/assignments/:id
 * Delete assignment
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const asgId = parseInt(req.params.id, 10);
    if (isNaN(asgId)) {
      return res.status(400).json({ success: false, error: 'Invalid assignment ID.' });
    }

    const [submissions] = await pool.query('SELECT COUNT(*) as count FROM Submission WHERE asg_id = ?;', [asgId]);
    if (submissions[0].count > 0) {
      return res.status(409).json({
        success: false,
        error: `Cannot delete assignment #${asgId} because it has ${submissions[0].count} student submission(s).`,
      });
    }

    const [result] = await pool.execute('DELETE FROM Assignment WHERE asg_id = ?;', [asgId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: 'Assignment not found.' });
    }

    res.json({
      success: true,
      message: `Assignment #${asgId} deleted successfully.`,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
