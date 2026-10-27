const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');

/**
 * GET /api/dashboard/stats
 * Return counts for all 10 verified tables using single or efficient aggregate queries
 */
router.get('/stats', async (req, res, next) => {
  try {
    const [
      [studentCount],
      [instructorCount],
      [courseCount],
      [enrollmentCount],
      [lessonCount],
      [materialCount],
      [assignmentCount],
      [submissionCount],
      [evaluationCount],
      [certificateCount],
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) AS count FROM Student;'),
      pool.query('SELECT COUNT(*) AS count FROM Instructor;'),
      pool.query('SELECT COUNT(*) AS count FROM Course;'),
      pool.query('SELECT COUNT(*) AS count FROM Enrollment;'),
      pool.query('SELECT COUNT(*) AS count FROM Lesson;'),
      pool.query('SELECT COUNT(*) AS count FROM Study_Material;'),
      pool.query('SELECT COUNT(*) AS count FROM Assignment;'),
      pool.query('SELECT COUNT(*) AS count FROM Submission;'),
      pool.query('SELECT COUNT(*) AS count FROM Evaluation;'),
      pool.query('SELECT COUNT(*) AS count FROM Certificate;'),
    ]);

    res.json({
      success: true,
      data: {
        students: studentCount[0].count,
        instructors: instructorCount[0].count,
        courses: courseCount[0].count,
        enrollments: enrollmentCount[0].count,
        lessons: lessonCount[0].count,
        studyMaterials: materialCount[0].count,
        assignments: assignmentCount[0].count,
        submissions: submissionCount[0].count,
        evaluations: evaluationCount[0].count,
        certificates: certificateCount[0].count,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/dashboard/reports
 * Return relational reports across courses, instructors, submissions, enrollments
 */
router.get('/reports', async (req, res, next) => {
  try {
    // 1. Course enrollment distribution
    const [courseEnrollments] = await pool.query(`
      SELECT 
        c.course_id,
        c.course_name,
        c.price,
        i.inst_name AS instructor_name,
        COUNT(e.enrollment_id) AS total_enrolled
      FROM Course c
      LEFT JOIN Instructor i ON c.instructor_id = i.instructor_id
      LEFT JOIN Enrollment e ON c.course_id = e.course_id
      GROUP BY c.course_id, c.course_name, c.price, i.inst_name
      ORDER BY total_enrolled DESC;
    `);

    // 2. Instructor course load
    const [instructorCourses] = await pool.query(`
      SELECT 
        i.instructor_id,
        i.inst_name,
        i.email,
        i.qualification,
        COUNT(c.course_id) AS total_courses
      FROM Instructor i
      LEFT JOIN Course c ON i.instructor_id = c.instructor_id
      GROUP BY i.instructor_id, i.inst_name, i.email, i.qualification
      ORDER BY total_courses DESC;
    `);

    // 3. Recent enrollments (student + course + date)
    const [recentEnrollments] = await pool.query(`
      SELECT 
        e.enrollment_id,
        e.enrollment_date,
        s.std_name AS student_name,
        s.email AS student_email,
        c.course_name
      FROM Enrollment e
      JOIN Student s ON e.std_id = s.std_id
      JOIN Course c ON e.course_id = c.course_id
      ORDER BY e.enrollment_date DESC, e.enrollment_id DESC
      LIMIT 5;
    `);

    // 4. Recent submissions & grades
    const [recentSubmissions] = await pool.query(`
      SELECT 
        sub.submission_id,
        sub.submission_date,
        sub.marks_obtained,
        s.std_name AS student_name,
        a.title AS assignment_title,
        a.total_marks,
        c.course_name,
        ev.feedback
      FROM Submission sub
      JOIN Student s ON sub.std_id = s.std_id
      JOIN Assignment a ON sub.asg_id = a.asg_id
      JOIN Course c ON a.course_id = c.course_id
      LEFT JOIN Evaluation ev ON sub.submission_id = ev.submission_id
      ORDER BY sub.submission_date DESC, sub.submission_id DESC
      LIMIT 5;
    `);

    res.json({
      success: true,
      data: {
        courseEnrollments,
        instructorCourses,
        recentEnrollments,
        recentSubmissions,
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
