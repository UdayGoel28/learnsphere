const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');

/**
 * Validation helper for Course
 */
async function validateCourseInput(data, isUpdate = false) {
  const errors = [];
  const { course_name, price, instructor_id } = data;

  if (!isUpdate || course_name !== undefined) {
    if (!course_name || typeof course_name !== 'string' || course_name.trim().length === 0) {
      errors.push('Course name is required and cannot be empty.');
    } else if (course_name.trim().length > 100) {
      errors.push('Course name must be 100 characters or fewer.');
    }
  }

  if (!isUpdate || price !== undefined) {
    const numPrice = Number(price);
    if (isNaN(numPrice) || numPrice < 0) {
      errors.push('Price must be a non-negative number.');
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

  return errors;
}

/**
 * GET /api/courses
 * List all courses with instructor name and enrollment count
 */
router.get('/', async (req, res, next) => {
  try {
    const { search } = req.query;
    let sql = `
      SELECT 
        c.course_id,
        c.course_name,
        c.price,
        c.instructor_id,
        i.inst_name AS instructor_name,
        i.email AS instructor_email,
        COUNT(DISTINCT e.enrollment_id) AS enrolled_count,
        COUNT(DISTINCT l.lesson_id) AS lesson_count,
        COUNT(DISTINCT a.asg_id) AS assignment_count
      FROM Course c
      LEFT JOIN Instructor i ON c.instructor_id = i.instructor_id
      LEFT JOIN Enrollment e ON c.course_id = e.course_id
      LEFT JOIN Lesson l ON c.course_id = l.course_id
      LEFT JOIN Assignment a ON c.course_id = a.course_id
    `;
    const params = [];

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      sql += ` WHERE c.course_name LIKE ? OR i.inst_name LIKE ? OR CAST(c.course_id AS CHAR) = ? `;
      params.push(term, term, search.trim());
    }

    sql += ` GROUP BY c.course_id, c.course_name, c.price, c.instructor_id, i.inst_name, i.email ORDER BY c.course_id DESC;`;

    const [rows] = await pool.query(sql, params);
    res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/courses/:id
 * Get single course by ID
 */
router.get('/:id', async (req, res, next) => {
  try {
    const courseId = parseInt(req.params.id, 10);
    if (isNaN(courseId)) {
      return res.status(400).json({ success: false, error: 'Invalid course ID parameter.' });
    }

    const [rows] = await pool.query(
      `SELECT c.course_id, c.course_name, c.price, c.instructor_id, i.inst_name AS instructor_name
       FROM Course c
       LEFT JOIN Instructor i ON c.instructor_id = i.instructor_id
       WHERE c.course_id = ?;`,
      [courseId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Course not found.' });
    }

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/courses/:id/details
 * Get comprehensive course curriculum: lessons, study materials, assignments, enrollments
 */
router.get('/:id/details', async (req, res, next) => {
  try {
    const courseId = parseInt(req.params.id, 10);
    if (isNaN(courseId)) {
      return res.status(400).json({ success: false, error: 'Invalid course ID parameter.' });
    }

    const [courseRows] = await pool.query(
      `SELECT c.course_id, c.course_name, c.price, c.instructor_id, i.inst_name, i.email AS instructor_email
       FROM Course c
       LEFT JOIN Instructor i ON c.instructor_id = i.instructor_id
       WHERE c.course_id = ?;`,
      [courseId]
    );

    if (courseRows.length === 0) {
      return res.status(404).json({ success: false, error: 'Course not found.' });
    }

    // Lessons
    const [lessons] = await pool.query(
      'SELECT lesson_id, lesson_title FROM Lesson WHERE course_id = ? ORDER BY lesson_id ASC;',
      [courseId]
    );

    // Study materials
    const [studyMaterials] = await pool.query(
      'SELECT material_id, material_title, material_type, resource_link FROM Study_Material WHERE course_id = ? ORDER BY material_id ASC;',
      [courseId]
    );

    // Assignments
    const [assignments] = await pool.query(
      'SELECT asg_id, title, due_date, total_marks FROM Assignment WHERE course_id = ? ORDER BY asg_id ASC;',
      [courseId]
    );

    // Enrolled students
    const [enrolledStudents] = await pool.query(
      `SELECT e.enrollment_id, e.enrollment_date, s.std_id, s.std_name, s.email, s.contact
       FROM Enrollment e
       JOIN Student s ON e.std_id = s.std_id
       WHERE e.course_id = ?
       ORDER BY e.enrollment_date DESC;`,
      [courseId]
    );

    res.json({
      success: true,
      data: {
        course: courseRows[0],
        lessons,
        studyMaterials,
        assignments,
        enrolledStudents,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/courses
 * Create a new course
 */
router.post('/', async (req, res, next) => {
  try {
    const { course_name, price, instructor_id } = req.body;
    const errors = await validateCourseInput({ course_name, price, instructor_id });
    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    const formattedPrice = Number(price || 0).toFixed(2);
    const instId = instructor_id ? parseInt(instructor_id, 10) : null;

    const [result] = await pool.execute(
      'INSERT INTO Course (course_name, price, instructor_id) VALUES (?, ?, ?);',
      [course_name.trim(), formattedPrice, instId]
    );

    const newCourseId = result.insertId;
    const [createdRows] = await pool.query(
      `SELECT c.course_id, c.course_name, c.price, c.instructor_id, i.inst_name AS instructor_name
       FROM Course c
       LEFT JOIN Instructor i ON c.instructor_id = i.instructor_id
       WHERE c.course_id = ?;`,
      [newCourseId]
    );

    res.status(201).json({
      success: true,
      message: 'Course created successfully.',
      data: createdRows[0],
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/courses/:id
 * Update an existing course
 */
router.put('/:id', async (req, res, next) => {
  try {
    const courseId = parseInt(req.params.id, 10);
    if (isNaN(courseId)) {
      return res.status(400).json({ success: false, error: 'Invalid course ID parameter.' });
    }

    const { course_name, price, instructor_id } = req.body;
    const errors = await validateCourseInput({ course_name, price, instructor_id }, true);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    // Check existence
    const [existing] = await pool.query('SELECT course_id FROM Course WHERE course_id = ?;', [courseId]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'Course not found.' });
    }

    const formattedPrice = Number(price || 0).toFixed(2);
    const instId = instructor_id ? parseInt(instructor_id, 10) : null;

    await pool.execute(
      'UPDATE Course SET course_name = ?, price = ?, instructor_id = ? WHERE course_id = ?;',
      [course_name.trim(), formattedPrice, instId, courseId]
    );

    const [updatedRows] = await pool.query(
      `SELECT c.course_id, c.course_name, c.price, c.instructor_id, i.inst_name AS instructor_name
       FROM Course c
       LEFT JOIN Instructor i ON c.instructor_id = i.instructor_id
       WHERE c.course_id = ?;`,
      [courseId]
    );

    res.json({
      success: true,
      message: 'Course updated successfully.',
      data: updatedRows[0],
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/courses/:id
 * Delete a course (checks for dependencies)
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const courseId = parseInt(req.params.id, 10);
    if (isNaN(courseId)) {
      return res.status(400).json({ success: false, error: 'Invalid course ID parameter.' });
    }

    // Check dependencies
    const [enrollments] = await pool.query('SELECT COUNT(*) as count FROM Enrollment WHERE course_id = ?;', [courseId]);
    const [lessons] = await pool.query('SELECT COUNT(*) as count FROM Lesson WHERE course_id = ?;', [courseId]);
    const [materials] = await pool.query('SELECT COUNT(*) as count FROM Study_Material WHERE course_id = ?;', [courseId]);
    const [assignments] = await pool.query('SELECT COUNT(*) as count FROM Assignment WHERE course_id = ?;', [courseId]);
    const [certificates] = await pool.query('SELECT COUNT(*) as count FROM Certificate WHERE course_id = ?;', [courseId]);

    const activeDeps = [];
    if (enrollments[0].count > 0) activeDeps.push(`${enrollments[0].count} enrollment(s)`);
    if (lessons[0].count > 0) activeDeps.push(`${lessons[0].count} lesson(s)`);
    if (materials[0].count > 0) activeDeps.push(`${materials[0].count} study material(s)`);
    if (assignments[0].count > 0) activeDeps.push(`${assignments[0].count} assignment(s)`);
    if (certificates[0].count > 0) activeDeps.push(`${certificates[0].count} certificate(s)`);

    if (activeDeps.length > 0) {
      return res.status(409).json({
        success: false,
        error: `Cannot delete course #${courseId} because active records depend on it: ${activeDeps.join(', ')}. Please remove or transfer dependent records first.`,
      });
    }

    const [result] = await pool.execute('DELETE FROM Course WHERE course_id = ?;', [courseId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: 'Course not found.' });
    }

    res.json({
      success: true,
      message: `Course #${courseId} deleted successfully.`,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
