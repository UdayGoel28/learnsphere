const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');

/**
 * Validation helper for Submission
 */
async function validateSubmissionInput(data, isUpdate = false) {
  const errors = [];
  const { std_id, asg_id, submission_date, marks_obtained } = data;

  if (!isUpdate || std_id !== undefined) {
    const sId = parseInt(std_id, 10);
    if (isNaN(sId)) {
      errors.push('A valid Student ID is required.');
    } else {
      const [s] = await pool.query('SELECT std_id FROM Student WHERE std_id = ?;', [sId]);
      if (s.length === 0) errors.push(`Student with ID ${sId} does not exist.`);
    }
  }

  let assignmentMaxMarks = null;
  if (!isUpdate || asg_id !== undefined) {
    const aId = parseInt(asg_id, 10);
    if (isNaN(aId)) {
      errors.push('A valid Assignment ID is required.');
    } else {
      const [a] = await pool.query('SELECT asg_id, total_marks FROM Assignment WHERE asg_id = ?;', [aId]);
      if (a.length === 0) {
        errors.push(`Assignment with ID ${aId} does not exist.`);
      } else {
        assignmentMaxMarks = a[0].total_marks;
      }
    }
  }

  if (submission_date !== undefined && submission_date !== null && submission_date !== '') {
    if (isNaN(Date.parse(submission_date))) {
      errors.push('Submission date must be a valid date (YYYY-MM-DD).');
    }
  }

  if (marks_obtained !== undefined && marks_obtained !== null && marks_obtained !== '') {
    const marks = parseInt(marks_obtained, 10);
    if (isNaN(marks) || marks < 0) {
      errors.push('Marks obtained must be a non-negative integer.');
    } else if (assignmentMaxMarks !== null && marks > assignmentMaxMarks) {
      errors.push(`Marks obtained (${marks}) cannot exceed total marks for this assignment (${assignmentMaxMarks}).`);
    }
  }

  return errors;
}

/**
 * GET /api/submissions
 * List all submissions with student, assignment, course and evaluation details
 */
router.get('/', async (req, res, next) => {
  try {
    const { asg_id, std_id, course_id, search } = req.query;
    let sql = `
      SELECT 
        sub.submission_id,
        sub.submission_date,
        sub.marks_obtained,
        sub.std_id,
        s.std_name,
        s.email AS student_email,
        sub.asg_id,
        a.title AS assignment_title,
        a.total_marks,
        c.course_id,
        c.course_name,
        ev.evaluation_id,
        ev.feedback,
        ev.evaluation_date,
        inst.inst_name AS evaluated_by
      FROM Submission sub
      JOIN Student s ON sub.std_id = s.std_id
      JOIN Assignment a ON sub.asg_id = a.asg_id
      JOIN Course c ON a.course_id = c.course_id
      LEFT JOIN Evaluation ev ON sub.submission_id = ev.submission_id
      LEFT JOIN Instructor inst ON ev.instructor_id = inst.instructor_id
    `;
    const params = [];
    const conditions = [];

    if (course_id) {
      conditions.push('c.course_id = ?');
      params.push(parseInt(course_id, 10));
    }
    if (asg_id) {
      conditions.push('sub.asg_id = ?');
      params.push(parseInt(asg_id, 10));
    }
    if (std_id) {
      conditions.push('sub.std_id = ?');
      params.push(parseInt(std_id, 10));
    }
    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      conditions.push('(s.std_name LIKE ? OR a.title LIKE ? OR c.course_name LIKE ?)');
      params.push(term, term, term);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY sub.submission_date DESC, sub.submission_id DESC;';

    const [rows] = await pool.query(sql, params);
    res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/submissions/:id
 * Get single submission
 */
router.get('/:id', async (req, res, next) => {
  try {
    const subId = parseInt(req.params.id, 10);
    if (isNaN(subId)) {
      return res.status(400).json({ success: false, error: 'Invalid submission ID.' });
    }

    const [rows] = await pool.query(
      `SELECT sub.submission_id, sub.submission_date, sub.marks_obtained,
              sub.std_id, s.std_name, sub.asg_id, a.title AS assignment_title, a.total_marks,
              c.course_name, ev.evaluation_id, ev.feedback, ev.evaluation_date, ev.instructor_id
       FROM Submission sub
       JOIN Student s ON sub.std_id = s.std_id
       JOIN Assignment a ON sub.asg_id = a.asg_id
       JOIN Course c ON a.course_id = c.course_id
       LEFT JOIN Evaluation ev ON sub.submission_id = ev.submission_id
       WHERE sub.submission_id = ?;`,
      [subId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Submission not found.' });
    }

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/submissions
 * Create submission
 */
router.post('/', async (req, res, next) => {
  try {
    const { std_id, asg_id, submission_date, marks_obtained } = req.body;
    const errors = await validateSubmissionInput({ std_id, asg_id, submission_date, marks_obtained });
    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    const formattedDate = submission_date
      ? new Date(submission_date).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

    const marks = marks_obtained !== undefined && marks_obtained !== null && marks_obtained !== ''
      ? parseInt(marks_obtained, 10)
      : null;

    const [result] = await pool.execute(
      'INSERT INTO Submission (std_id, asg_id, submission_date, marks_obtained) VALUES (?, ?, ?, ?);',
      [std_id, asg_id, formattedDate, marks]
    );

    const [created] = await pool.query(
      `SELECT sub.submission_id, sub.submission_date, sub.marks_obtained, s.std_name, a.title AS assignment_title
       FROM Submission sub
       JOIN Student s ON sub.std_id = s.std_id
       JOIN Assignment a ON sub.asg_id = a.asg_id
       WHERE sub.submission_id = ?;`,
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      message: 'Submission recorded successfully.',
      data: created[0],
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/submissions/:id
 * Update submission
 */
router.put('/:id', async (req, res, next) => {
  try {
    const subId = parseInt(req.params.id, 10);
    if (isNaN(subId)) {
      return res.status(400).json({ success: false, error: 'Invalid submission ID.' });
    }

    const { std_id, asg_id, submission_date, marks_obtained } = req.body;
    const errors = await validateSubmissionInput({ std_id, asg_id, submission_date, marks_obtained }, true);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    const [existing] = await pool.query('SELECT submission_id FROM Submission WHERE submission_id = ?;', [subId]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'Submission not found.' });
    }

    const formattedDate = submission_date ? new Date(submission_date).toISOString().split('T')[0] : null;
    const marks = marks_obtained !== undefined && marks_obtained !== null && marks_obtained !== ''
      ? parseInt(marks_obtained, 10)
      : null;

    await pool.execute(
      'UPDATE Submission SET std_id = ?, asg_id = ?, submission_date = ?, marks_obtained = ? WHERE submission_id = ?;',
      [std_id, asg_id, formattedDate, marks, subId]
    );

    const [updated] = await pool.query(
      `SELECT sub.submission_id, sub.submission_date, sub.marks_obtained, s.std_name, a.title AS assignment_title
       FROM Submission sub
       JOIN Student s ON sub.std_id = s.std_id
       JOIN Assignment a ON sub.asg_id = a.asg_id
       WHERE sub.submission_id = ?;`,
      [subId]
    );

    res.json({
      success: true,
      message: 'Submission updated successfully.',
      data: updated[0],
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/submissions/:id
 * Delete submission
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const subId = parseInt(req.params.id, 10);
    if (isNaN(subId)) {
      return res.status(400).json({ success: false, error: 'Invalid submission ID.' });
    }

    const [evals] = await pool.query('SELECT evaluation_id FROM Evaluation WHERE submission_id = ?;', [subId]);
    if (evals.length > 0) {
      return res.status(409).json({
        success: false,
        error: `Cannot delete submission #${subId} because an evaluation record is attached to it. Please remove the evaluation first.`,
      });
    }

    const [result] = await pool.execute('DELETE FROM Submission WHERE submission_id = ?;', [subId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: 'Submission not found.' });
    }

    res.json({
      success: true,
      message: `Submission #${subId} deleted successfully.`,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
