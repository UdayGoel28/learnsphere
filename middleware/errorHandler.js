/**
 * Centralized Error Handling Middleware
 */
function errorHandler(err, req, res, next) {
  // Safe logging for debugging on server side (never log sensitive database passwords)
  console.error(`[ERROR] ${req.method} ${req.originalUrl}:`, err.message);

  let statusCode = err.status || err.statusCode || 500;
  let message = err.message || 'Internal Server Error';

  // Handle specific MySQL errors gracefully
  if (err.code) {
    switch (err.code) {
      case 'ER_DUP_ENTRY':
        statusCode = 409;
        if (err.message.includes('email')) {
          message = 'A record with this email address already exists.';
        } else {
          message = 'Duplicate entry: A record with this unique value already exists.';
        }
        break;

      case 'ER_ROW_IS_REFERENCED':
      case 'ER_ROW_IS_REFERENCED_2':
        statusCode = 409;
        message = 'Cannot delete or modify this record because related records depend on it (Foreign Key Constraint).';
        break;

      case 'ER_NO_REFERENCED_ROW':
      case 'ER_NO_REFERENCED_ROW_2':
        statusCode = 400;
        message = 'Invalid reference: The referenced record (e.g. Student, Course, or Instructor ID) does not exist.';
        break;

      case 'ER_DATA_TOO_LONG':
        statusCode = 400;
        message = 'Data provided exceeds the maximum allowed length for one or more fields.';
        break;

      case 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD':
      case 'ER_PARSE_ERROR':
        statusCode = 400;
        message = 'Invalid input value or format.';
        break;

      case 'ECONNREFUSED':
        statusCode = 503;
        message = 'Database server is currently unreachable. Please check if MySQL is running.';
        break;

      default:
        // Keep status code as 500 for unhandled internal DB errors
        if (statusCode === 500) {
          message = 'A database error occurred while processing your request.';
        }
        break;
    }
  }

  // Return consistent JSON response
  res.status(statusCode).json({
    success: false,
    error: message,
    code: err.code || undefined,
  });
}

module.exports = errorHandler;
