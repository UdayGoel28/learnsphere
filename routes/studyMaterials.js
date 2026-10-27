const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');

/**
 * Validation helper for Study Material
 */
async function validateMaterialInput(data, isUpdate = false) {
  const errors = [];
  const { course_id, material_title, material_type, resource_link } = data;

  if (!isUpdate || course_id !== undefined) {
    const cId = parseInt(course_id, 10);
    if (isNaN(cId)) {
      errors.push('A valid Course ID is required.');
    } else {
      const [c] = await pool.query('SELECT course_id FROM Course WHERE course_id = ?;', [cId]);
      if (c.length === 0) errors.push(`Course with ID ${cId} does not exist.`);
    }
  }

  if (!isUpdate || material_title !== undefined) {
    if (!material_title || typeof material_title !== 'string' || material_title.trim().length === 0) {
      errors.push('Material title is required.');
    } else if (material_title.trim().length > 150) {
      errors.push('Material title must be 150 characters or fewer.');
    }
  }

  if (material_type !== undefined && material_type !== null && material_type !== '') {
    if (typeof material_type !== 'string' || material_type.trim().length > 50) {
      errors.push('Material type must be 50 characters or fewer.');
    }
  }

  if (resource_link !== undefined && resource_link !== null && resource_link !== '') {
    if (typeof resource_link !== 'string' || resource_link.trim().length > 500) {
      errors.push('Resource link must be 500 characters or fewer.');
    }
  }

  return errors;
}

/**
 * GET /api/study-materials
 * List all study materials with course details
 */
router.get('/', async (req, res, next) => {
  try {
    const { course_id, search } = req.query;
    let sql = `
      SELECT 
        sm.material_id,
        sm.material_title,
        sm.material_type,
        sm.resource_link,
        sm.course_id,
        c.course_name,
        i.inst_name AS instructor_name
      FROM Study_Material sm
      JOIN Course c ON sm.course_id = c.course_id
      LEFT JOIN Instructor i ON c.instructor_id = i.instructor_id
    `;
    const params = [];
    const conditions = [];

    if (course_id) {
      conditions.push('sm.course_id = ?');
      params.push(parseInt(course_id, 10));
    }
    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      conditions.push('(sm.material_title LIKE ? OR sm.material_type LIKE ? OR c.course_name LIKE ?)');
      params.push(term, term, term);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY sm.course_id ASC, sm.material_id ASC;';

    const [rows] = await pool.query(sql, params);
    res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/study-materials/:id
 * Get single study material
 */
router.get('/:id', async (req, res, next) => {
  try {
    const matId = parseInt(req.params.id, 10);
    if (isNaN(matId)) {
      return res.status(400).json({ success: false, error: 'Invalid study material ID.' });
    }

    const [rows] = await pool.query(
      `SELECT sm.material_id, sm.material_title, sm.material_type, sm.resource_link, sm.course_id, c.course_name
       FROM Study_Material sm
       JOIN Course c ON sm.course_id = c.course_id
       WHERE sm.material_id = ?;`,
      [matId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Study material not found.' });
    }

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/study-materials
 * Create study material
 */
router.post('/', async (req, res, next) => {
  try {
    const { course_id, material_title, material_type, resource_link } = req.body;
    const errors = await validateMaterialInput({ course_id, material_title, material_type, resource_link });
    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    const [result] = await pool.execute(
      'INSERT INTO Study_Material (course_id, material_title, material_type, resource_link) VALUES (?, ?, ?, ?);',
      [
        course_id,
        material_title.trim(),
        material_type ? material_type.trim() : null,
        resource_link ? resource_link.trim() : null,
      ]
    );

    const [created] = await pool.query(
      `SELECT sm.material_id, sm.material_title, sm.material_type, sm.resource_link, sm.course_id, c.course_name
       FROM Study_Material sm
       JOIN Course c ON sm.course_id = c.course_id
       WHERE sm.material_id = ?;`,
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      message: 'Study material added successfully.',
      data: created[0],
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/study-materials/:id
 * Update study material
 */
router.put('/:id', async (req, res, next) => {
  try {
    const matId = parseInt(req.params.id, 10);
    if (isNaN(matId)) {
      return res.status(400).json({ success: false, error: 'Invalid study material ID.' });
    }

    const { course_id, material_title, material_type, resource_link } = req.body;
    const errors = await validateMaterialInput({ course_id, material_title, material_type, resource_link }, true);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    const [existing] = await pool.query('SELECT material_id FROM Study_Material WHERE material_id = ?;', [matId]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'Study material not found.' });
    }

    await pool.execute(
      'UPDATE Study_Material SET course_id = ?, material_title = ?, material_type = ?, resource_link = ? WHERE material_id = ?;',
      [
        course_id,
        material_title.trim(),
        material_type ? material_type.trim() : null,
        resource_link ? resource_link.trim() : null,
        matId,
      ]
    );

    const [updated] = await pool.query(
      `SELECT sm.material_id, sm.material_title, sm.material_type, sm.resource_link, sm.course_id, c.course_name
       FROM Study_Material sm
       JOIN Course c ON sm.course_id = c.course_id
       WHERE sm.material_id = ?;`,
      [matId]
    );

    res.json({
      success: true,
      message: 'Study material updated successfully.',
      data: updated[0],
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/study-materials/:id
 * Delete study material
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const matId = parseInt(req.params.id, 10);
    if (isNaN(matId)) {
      return res.status(400).json({ success: false, error: 'Invalid study material ID.' });
    }

    const [result] = await pool.execute('DELETE FROM Study_Material WHERE material_id = ?;', [matId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: 'Study material not found.' });
    }

    res.json({
      success: true,
      message: `Study material #${matId} removed successfully.`,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
