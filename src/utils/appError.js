class AppError extends Error {
  constructor(statusCode, message, payload = {}) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.payload = payload;
  }
}

module.exports = AppError;