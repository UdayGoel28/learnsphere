# LearnSphere — Online Learning Platform (RDBMS Semester Project)

A modern, full-stack Relational Database Management System (RDBMS) administration portal and learning platform built with **Node.js**, **Express.js**, and **MySQL**.

This project connects to an existing local MySQL server instance (`learnsphere` database) and provides an interactive, accessible dashboard with real-time analytics, relational reporting, and complete CRUD workflows across 10 relational entities.

---

## 1. System Architecture & Tech Stack

- **Backend**: Node.js (v24+) with Express.js (v5)
- **Database Driver**: `mysql2/promise` with connection pooling
- **Configuration**: `dotenv` for environment isolation
- **Frontend**: HTML5, Vanilla Modern CSS3 (Inter typography, CSS variables, glassmorphism badges), Vanilla JavaScript (native `<dialog>` modals, async `fetch`)
- **Testing**: Node.js built-in native test runner (`node:test`, `node:assert`)

```text
RDBMS LearnSphere/
├── server.js               # Express application entrypoint & routing
├── package.json            # Manifest & test scripts
├── .env                    # Local credentials (git-ignored)
├── .env.example            # Environment template
├── .gitignore              # Protects secrets & node_modules
├── README.md               # Complete project documentation
├── schema_dump.json        # Live verified schema snapshot
├── config/
│   └── db.js               # Connection pool & health checker
├── middleware/
│   └── errorHandler.js     # Centralized MySQL & API error handling
├── routes/
│   ├── dashboard.js        # Aggregate statistics & relational reports
│   ├── students.js         # Student CRUD & academic portfolio
│   ├── courses.js          # Course catalog & curriculum details
│   ├── instructors.js      # Faculty management & teaching load
│   ├── enrollments.js      # Student course enrollments
│   ├── lessons.js          # Course chapter & lesson units
│   ├── studyMaterials.js   # Notes, links & syllabus resources
│   ├── assignments.js      # Problem sets & submissions tracking
│   ├── submissions.js      # Student submissions & grading
│   ├── evaluations.js      # Instructor feedback & assessments
│   └── certificates.js     # Graduation credentials & printable certs
├── public/
│   ├── css/
│   │   └── style.css       # Responsive design system
│   └── js/
│       └── app.js          # Toasts, modals, health checker & search
├── views/
│   ├── dashboard.html      # Real-time metrics & relational overview
│   ├── students.html       # Student management & portfolio modal
│   ├── courses.html        # Course management & curriculum modal
│   ├── instructors.html    # Faculty directory & teaching loads
│   ├── enrollments.html    # Enrollment records
│   ├── lessons.html        # Lesson syllabus & filters
│   ├── study-materials.html# Learning assets & resources
│   ├── assignments.html    # Assignments & submission tracking
│   ├── submissions.html    # Turn-in records & scores
│   ├── evaluations.html    # Evaluator feedback & reviews
│   ├── certificates.html   # Issued credentials & printable preview
│   └── error.html          # Custom 404 handler
└── tests/
    └── api.test.js         # Automated test suite (22 test cases)
```

---

## 2. Verified Relational Database Schema (`learnsphere`)

The database contains 10 interrelated tables. Foreign key constraints and entity integrity are strictly preserved:

1. **`Student`** (`std_id`, `std_name`, `email` [UNIQUE], `contact`)
2. **`Instructor`** (`instructor_id`, `inst_name`, `email` [UNIQUE], `qualification`)
3. **`Course`** (`course_id`, `course_name`, `price`, `instructor_id` → `Instructor.instructor_id`)
4. **`Enrollment`** (`enrollment_id`, `std_id` → `Student.std_id`, `course_id` → `Course.course_id`, `enrollment_date`)
5. **`Lesson`** (`lesson_id`, `course_id` → `Course.course_id`, `lesson_title`)
6. **`Study_Material`** (`material_id`, `course_id` → `Course.course_id`, `material_title`, `material_type`, `resource_link`)
7. **`Assignment`** (`asg_id`, `course_id` → `Course.course_id`, `title`, `due_date`, `total_marks`)
8. **`Submission`** (`submission_id`, `std_id` → `Student.std_id`, `asg_id` → `Assignment.asg_id`, `submission_date`, `marks_obtained`)
9. **`Evaluation`** (`evaluation_id`, `submission_id` [UNIQUE] → `Submission.submission_id`, `feedback`, `evaluation_date`, `instructor_id` → `Instructor.instructor_id`)
10. **`Certificate`** (`certificate_id`, `std_id` → `Student.std_id`, `course_id` → `Course.course_id`, `issue_date`)

---

## 3. Getting Started

### Prerequisites

Verify that Node.js and npm are installed:

```bash
node -v   # Recommended v18+ (Verified on v24+)
npm -v    # Recommended v9+
```

Verify that MySQL Server is running on port 3306:

```bash
nc -zv 127.0.0.1 3306
```

### Installation

Install dependencies:

```bash
npm install
```

### Configuration (`.env`)

Create or update `.env` in the project root:

```ini
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=YOUR_LOCAL_MYSQL_PASSWORD
DB_NAME=learnsphere
PORT=3000
```

> **Note**: Database credentials and `.env` are excluded from version control via `.gitignore`.

---

## 4. Running the Application

### Start the Server (Production Mode)

```bash
npm start
```

### Start in Development Mode (Live Watch)

```bash
npm run dev
```

Open your browser at: **`http://localhost:3000`**

---

## 5. Running Automated Tests

Run the full automated test suite using Node.js built-in test runner:

```bash
npm test
```

All 22 test cases cover:
- Server and database health checks (`/api/health`, `/api/health/db`)
- Live aggregate statistics from MySQL
- Relational joins and reporting queries
- Input validation and duplicate handling
- Safe error handling for foreign key constraints
- HTML view delivery and 404 routing

---

## 6. REST API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Application status & uptime |
| `GET` | `/api/health/db` | Live MySQL connection check (`SELECT 1`) |
| `GET` | `/api/dashboard/stats` | Live counts for all 10 tables |
| `GET` | `/api/dashboard/reports` | Relational reports across courses & faculty |
| `GET` | `/api/students` | List/search students (`?search=`) |
| `GET` | `/api/students/:id/details` | Student portfolio (enrollments, grades, certs) |
| `POST` | `/api/students` | Register student |
| `PUT` | `/api/students/:id` | Update student profile |
| `DELETE` | `/api/students/:id` | Delete student (with dependency checks) |
| `GET` | `/api/courses` | List/search courses with instructor details |
| `GET` | `/api/courses/:id/details` | Course curriculum, syllabus, and roster |
| `POST` | `/api/courses` | Create new course |
| `PUT` | `/api/courses/:id` | Update course details |
| `DELETE` | `/api/courses/:id` | Delete course (with dependency checks) |
| `GET` | `/api/instructors` | Faculty directory with course counts |
| `GET` | `/api/enrollments` | Enrollment records with student & course info |
| `GET` | `/api/lessons` | Lessons with course filter |
| `GET` | `/api/study-materials` | Study materials and resource links |
| `GET` | `/api/assignments` | Assignments and submission counts |
| `GET` | `/api/submissions` | Student submissions and marks |
| `GET` | `/api/evaluations` | Faculty grading and feedback |
| `GET` | `/api/certificates` | Issued completion credentials |

---

## 7. Troubleshooting

- **`ECONNREFUSED 127.0.0.1:3306`**:
  Ensure MySQL Server is started. On macOS: `brew services start mysql` or verify MySQL preference pane.
- **`ER_ACCESS_DENIED_ERROR`**:
  Check `DB_USER` and `DB_PASSWORD` in `.env`. Ensure they match the credentials configured in MySQL Workbench.
- **`ER_ROW_IS_REFERENCED_2` (409 Conflict)**:
  An attempt was made to delete a record that has active foreign key dependencies (e.g. deleting a course with enrolled students). Remove or reassign child records first.
- **Port 3000 In Use**:
  Update `PORT=3001` (or another port) in `.env` and restart the server.
