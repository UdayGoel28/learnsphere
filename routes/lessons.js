const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');

/**
 * Validation helper for Lesson
 */
async function validateLessonInput(data, isUpdate = false) {
  const errors = [];
  const { course_id, lesson_title } = data;

  if (!isUpdate || course_id !== undefined) {
    const cId = parseInt(course_id, 10);
    if (isNaN(cId)) {
      errors.push('A valid Course ID is required.');
    } else {
      const [c] = await pool.query('SELECT course_id FROM Course WHERE course_id = ?;', [cId]);
      if (c.length === 0) errors.push(`Course with ID ${cId} does not exist.`);
    }
  }

  if (!isUpdate || lesson_title !== undefined) {
    if (!lesson_title || typeof lesson_title !== 'string' || lesson_title.trim().length === 0) {
      errors.push('Lesson title is required.');
    } else if (lesson_title.trim().length > 150) {
      errors.push('Lesson title must be 150 characters or fewer.');
    }
  }

  return errors;
}

/**
 * GET /api/lessons
 * List all lessons with Course name
 */
router.get('/', async (req, res, next) => {
  try {
    const { course_id, search } = req.query;
    let sql = `
      SELECT 
        l.lesson_id,
        l.lesson_title,
        l.course_id,
        c.course_name,
        i.inst_name AS instructor_name
      FROM Lesson l
      JOIN Course c ON l.course_id = c.course_id
      LEFT JOIN Instructor i ON c.instructor_id = i.instructor_id
    `;
    const params = [];
    const conditions = [];

    if (course_id) {
      conditions.push('l.course_id = ?');
      params.push(parseInt(course_id, 10));
    }
    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      conditions.push('(l.lesson_title LIKE ? OR c.course_name LIKE ?)');
      params.push(term, term);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY l.course_id ASC, l.lesson_id ASC;';

    const [rows] = await pool.query(sql, params);
    res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/lessons/:id
 * Get single lesson
 */
router.get('/:id', async (req, res, next) => {
  try {
    const lessonId = parseInt(req.params.id, 10);
    if (isNaN(lessonId)) {
      return res.status(400).json({ success: false, error: 'Invalid lesson ID.' });
    }

    const [rows] = await pool.query(
      `SELECT l.lesson_id, l.lesson_title, l.course_id, c.course_name
       FROM Lesson l
       JOIN Course c ON l.course_id = c.course_id
       WHERE l.lesson_id = ?;`,
      [lessonId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Lesson not found.' });
    }

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/lessons
 * Create lesson
 */
router.post('/', async (req, res, next) => {
  try {
    const { course_id, lesson_title } = req.body;
    const errors = await validateLessonInput({ course_id, lesson_title });
    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    const [result] = await pool.execute(
      'INSERT INTO Lesson (course_id, lesson_title) VALUES (?, ?);',
      [course_id, lesson_title.trim()]
    );

    const [created] = await pool.query(
      `SELECT l.lesson_id, l.lesson_title, l.course_id, c.course_name
       FROM Lesson l
       JOIN Course c ON l.course_id = c.course_id
       WHERE l.lesson_id = ?;`,
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      message: 'Lesson created successfully.',
      data: created[0],
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/lessons/:id
 * Update lesson
 */
router.put('/:id', async (req, res, next) => {
  try {
    const lessonId = parseInt(req.params.id, 10);
    if (isNaN(lessonId)) {
      return res.status(400).json({ success: false, error: 'Invalid lesson ID.' });
    }

    const { course_id, lesson_title } = req.body;
    const errors = await validateLessonInput({ course_id, lesson_title }, true);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    const [existing] = await pool.query('SELECT lesson_id FROM Lesson WHERE lesson_id = ?;', [lessonId]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'Lesson not found.' });
    }

    await pool.execute(
      'UPDATE Lesson SET course_id = ?, lesson_title = ? WHERE lesson_id = ?;',
      [course_id, lesson_title.trim(), lessonId]
    );

    const [updated] = await pool.query(
      `SELECT l.lesson_id, l.lesson_title, l.course_id, c.course_name
       FROM Lesson l
       JOIN Course c ON l.course_id = c.course_id
       WHERE l.lesson_id = ?;`,
      [lessonId]
    );

    res.json({
      success: true,
      message: 'Lesson updated successfully.',
      data: updated[0],
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/lessons/:id
 * Delete lesson
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const lessonId = parseInt(req.params.id, 10);
    if (isNaN(lessonId)) {
      return res.status(400).json({ success: false, error: 'Invalid lesson ID.' });
    }

    const [result] = await pool.execute('DELETE FROM Lesson WHERE lesson_id = ?;', [lessonId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: 'Lesson not found.' });
    }

    res.json({
      success: true,
      message: `Lesson #${lessonId} deleted successfully.`,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
