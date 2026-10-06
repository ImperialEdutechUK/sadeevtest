export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code: string = 'APP_ERROR',
    public details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
export class NotFoundError extends AppError {
  constructor(what = 'Item') {
    super(404, `${what} not found`, 'NOT_FOUND');
  }
}
export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to do this') {
    super(403, message, 'FORBIDDEN');
  }
}
export class UnauthorizedError extends AppError {
  constructor(message = 'Please sign in') {
    super(401, message, 'UNAUTHORIZED');
  }
}
export class BadRequestError extends AppError {
  constructor(message: string, details?: unknown) {
    super(400, message, 'BAD_REQUEST', details);
  }
}
export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, message, 'CONFLICT');
  }
}
