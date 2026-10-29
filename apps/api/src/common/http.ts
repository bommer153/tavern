import {
  ArgumentsHost,
  Catch,
  createParamDecorator,
  ExceptionFilter,
  ExecutionContext,
  HttpException,
  Logger,
  PipeTransform,
  SetMetadata,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { isValidObjectId, Types } from 'mongoose';
import type { ZodType } from 'zod';
import type { Role } from '@tavern/shared';

/** Domain error with a stable machine-readable code. */
export class AppError extends HttpException {
  constructor(status: number, public code: string, message: string, public details?: unknown) {
    super({ statusCode: status, code, message, details }, status);
  }
}
export const notFound = (what = 'Resource') => new AppError(404, 'NOT_FOUND', `${what} not found`);
export const forbidden = (msg = 'You do not have permission to do that') => new AppError(403, 'FORBIDDEN', msg);
export const badRequest = (code: string, msg: string, details?: unknown) => new AppError(400, code, msg, details);
export const conflict = (code: string, msg: string) => new AppError(409, code, msg);

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private log = new Logger('HTTP');
  catch(err: unknown, host: ArgumentsHost) {
    if (host.getType() !== 'http') throw err;
    const res = host.switchToHttp().getResponse<Response>();
    const req = host.switchToHttp().getRequest<Request>();
    if (err instanceof HttpException) {
      const status = err.getStatus();
      const body = err.getResponse();
      const payload =
        typeof body === 'object' && body && 'code' in body
          ? body
          : { statusCode: status, code: status === 429 ? 'RATE_LIMITED' : 'HTTP_ERROR', message: err.message };
      return res.status(status).json(payload);
    }
    // Mongo duplicate key -> 409 instead of leaking internals.
    if (typeof err === 'object' && err && (err as { code?: number }).code === 11000) {
      return res.status(409).json({ statusCode: 409, code: 'DUPLICATE', message: 'That already exists' });
    }
    this.log.error(`${req.method} ${req.url}`, (err as Error)?.stack ?? String(err));
    res.status(500).json({ statusCode: 500, code: 'INTERNAL', message: 'Something went wrong' });
  }
}

export class ZodPipe<T> implements PipeTransform {
  constructor(private schema: ZodType<T>) {}
  transform(value: unknown): T {
    const r = this.schema.safeParse(value ?? {});
    if (!r.success)
      throw badRequest(
        'VALIDATION_FAILED',
        r.error.issues[0]?.message ?? 'Invalid request',
        r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      );
    return r.data;
  }
}

export class ObjectIdPipe implements PipeTransform {
  transform(v: string) {
    if (!isValidObjectId(v)) throw notFound();
    return v;
  }
}
export const oid = (id: string | Types.ObjectId) => (typeof id === 'string' ? new Types.ObjectId(id) : id);

export interface AuthUser {
  id: string;
  roles: Role[];
}
export const IS_PUBLIC = 'isPublic';
export const IS_OPTIONAL_AUTH = 'optionalAuth';
export const ROLES_KEY = 'roles';
/** No authentication required. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** Authentication is read when present but not required. */
export const OptionalAuth = () => SetMetadata(IS_OPTIONAL_AUTH, true);
/** Any of the listed roles is required (admin always passes). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>().user,
);

export const paginate = (page = 1, limit = 20) => ({ skip: (page - 1) * limit, limit });
