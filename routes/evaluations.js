const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');

/**
 * Validation helper for Evaluation
 */
async function validateEvaluationInput(data, isUpdate = false, currentEvalId = null) {
  const errors = [];
  const { submission_id, feedback, evaluation_date, instructor_id } = data;

  if (!isUpdate || submission_id !== undefined) {
    const sId = parseInt(submission_id, 10);
    if (isNaN(sId)) {
      errors.push('A valid Submission ID is required.');
    } else {
      const [sub] = await pool.query('SELECT submission_id FROM Submission WHERE submission_id = ?;', [sId]);
      if (sub.length === 0) {
        errors.push(`Submission with ID ${sId} does not exist.`);
      } else {
        // Check uniqueness of submission_id in Evaluation
        let checkSql = 'SELECT evaluation_id FROM Evaluation WHERE submission_id = ?';
        const checkParams = [sId];
        if (isUpdate && currentEvalId) {
          checkSql += ' AND evaluation_id != ?';
          checkParams.push(currentEvalId);
        }
        const [existing] = await pool.query(checkSql, checkParams);
        if (existing.length > 0) {
          errors.push(`Submission #${sId} has already been evaluated.`);
        }
      }
    }
  }

  if (instructor_id !== undefined && instructor_id !== null && instructor_id !== '') {
    const instId = parseInt(instructor_id, 10);
    if (isNaN(instId)) {
      errors.push('Instructor ID must be a valid number.');
    } else {
      const [inst] = await pool.query('SELECT instructor_id FROM Instructor WHERE instructor_id = ?;', [instId]);
      if (inst.length === 0) {
        errors.push(`Instructor with ID ${instId} does not exist.`);
      }
    }
  }

  if (feedback !== undefined && feedback !== null && feedback !== '') {
    if (typeof feedback !== 'string' || feedback.trim().length > 500) {
      errors.push('Feedback must be 500 characters or fewer.');
    }
  }

  if (evaluation_date !== undefined && evaluation_date !== null && evaluation_date !== '') {
    if (isNaN(Date.parse(evaluation_date))) {
      errors.push('Evaluation date must be a valid date (YYYY-MM-DD).');
    }
  }

  return errors;
}

/**
 * GET /api/evaluations
 * List all evaluations with submission, student, assignment, course and instructor details
 */
router.get('/', async (req, res, next) => {
  try {
    const { instructor_id, search } = req.query;
    let sql = `
      SELECT 
        ev.evaluation_id,
        ev.submission_id,
        ev.feedback,
        ev.evaluation_date,
        ev.instructor_id,
        inst.inst_name AS instructor_name,
        sub.submission_date,
        sub.marks_obtained,
        s.std_id,
        s.std_name,
        s.email AS student_email,
        a.asg_id,
        a.title AS assignment_title,
        a.total_marks,
        c.course_name
      FROM Evaluation ev
      JOIN Submission sub ON ev.submission_id = sub.submission_id
      JOIN Student s ON sub.std_id = s.std_id
      JOIN Assignment a ON sub.asg_id = a.asg_id
      JOIN Course c ON a.course_id = c.course_id
      LEFT JOIN Instructor inst ON ev.instructor_id = inst.instructor_id
    `;
    const params = [];
    const conditions = [];

    if (instructor_id) {
      conditions.push('ev.instructor_id = ?');
      params.push(parseInt(instructor_id, 10));
    }
    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      conditions.push('(s.std_name LIKE ? OR a.title LIKE ? OR inst.inst_name LIKE ? OR ev.feedback LIKE ?)');
      params.push(term, term, term, term);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY ev.evaluation_date DESC, ev.evaluation_id DESC;';

    const [rows] = await pool.query(sql, params);
    res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/evaluations/:id
 * Get single evaluation
 */
router.get('/:id', async (req, res, next) => {
  try {
    const evalId = parseInt(req.params.id, 10);
    if (isNaN(evalId)) {
      return res.status(400).json({ success: false, error: 'Invalid evaluation ID.' });
    }

    const [rows] = await pool.query(
      `SELECT ev.evaluation_id, ev.submission_id, ev.feedback, ev.evaluation_date, ev.instructor_id,
              inst.inst_name AS instructor_name, sub.marks_obtained, s.std_name, a.title AS assignment_title
       FROM Evaluation ev
       JOIN Submission sub ON ev.submission_id = sub.submission_id
       JOIN Student s ON sub.std_id = s.std_id
       JOIN Assignment a ON sub.asg_id = a.asg_id
       LEFT JOIN Instructor inst ON ev.instructor_id = inst.instructor_id
       WHERE ev.evaluation_id = ?;`,
      [evalId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Evaluation record not found.' });
    }

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/evaluations
 * Create evaluation
 */
router.post('/', async (req, res, next) => {
  try {
    const { submission_id, feedback, evaluation_date, instructor_id } = req.body;
    const errors = await validateEvaluationInput({ submission_id, feedback, evaluation_date, instructor_id });
    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    const formattedDate = evaluation_date
      ? new Date(evaluation_date).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

    const instId = instructor_id ? parseInt(instructor_id, 10) : null;

    const [result] = await pool.execute(
      'INSERT INTO Evaluation (submission_id, feedback, evaluation_date, instructor_id) VALUES (?, ?, ?, ?);',
      [submission_id, feedback ? feedback.trim() : null, formattedDate, instId]
    );

    const [created] = await pool.query(
      `SELECT ev.evaluation_id, ev.submission_id, ev.feedback, ev.evaluation_date, ev.instructor_id,
              inst.inst_name AS instructor_name
       FROM Evaluation ev
       LEFT JOIN Instructor inst ON ev.instructor_id = inst.instructor_id
       WHERE ev.evaluation_id = ?;`,
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      message: 'Evaluation submitted successfully.',
      data: created[0],
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/evaluations/:id
 * Update evaluation
 */
router.put('/:id', async (req, res, next) => {
  try {
    const evalId = parseInt(req.params.id, 10);
    if (isNaN(evalId)) {
      return res.status(400).json({ success: false, error: 'Invalid evaluation ID.' });
    }

    const { submission_id, feedback, evaluation_date, instructor_id } = req.body;
    const errors = await validateEvaluationInput(
      { submission_id, feedback, evaluation_date, instructor_id },
      true,
      evalId
    );
    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    const [existing] = await pool.query('SELECT evaluation_id FROM Evaluation WHERE evaluation_id = ?;', [evalId]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'Evaluation not found.' });
    }

    const formattedDate = evaluation_date ? new Date(evaluation_date).toISOString().split('T')[0] : null;
    const instId = instructor_id ? parseInt(instructor_id, 10) : null;

    await pool.execute(
      'UPDATE Evaluation SET submission_id = ?, feedback = ?, evaluation_date = ?, instructor_id = ? WHERE evaluation_id = ?;',
      [submission_id, feedback ? feedback.trim() : null, formattedDate, instId, evalId]
    );

    const [updated] = await pool.query(
      `SELECT ev.evaluation_id, ev.submission_id, ev.feedback, ev.evaluation_date, ev.instructor_id,
              inst.inst_name AS instructor_name
       FROM Evaluation ev
       LEFT JOIN Instructor inst ON ev.instructor_id = inst.instructor_id
       WHERE ev.evaluation_id = ?;`,
      [evalId]
    );

    res.json({
      success: true,
      message: 'Evaluation updated successfully.',
      data: updated[0],
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/evaluations/:id
 * Delete evaluation
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const evalId = parseInt(req.params.id, 10);
    if (isNaN(evalId)) {
      return res.status(400).json({ success: false, error: 'Invalid evaluation ID.' });
    }

    const [result] = await pool.execute('DELETE FROM Evaluation WHERE evaluation_id = ?;', [evalId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: 'Evaluation not found.' });
    }

    res.json({
      success: true,
      message: `Evaluation #${evalId} removed successfully.`,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
