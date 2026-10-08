import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  REQUEST_ID_HEADER,
  type ErrorCode,
  type PublicErrorResponse,
  type ValidationIssue,
} from '@sync/contracts';

const PUBLIC_MESSAGES: Record<ErrorCode, string> = {
  BAD_REQUEST: 'The request was malformed.',
  VALIDATION_FAILED: 'The request did not pass validation.',
  NOT_FOUND: 'The requested resource was not found.',
  PAYLOAD_TOO_LARGE: 'The request body is too large.',
  UNSUPPORTED_MEDIA_TYPE: 'The request content type is not supported.',
  RATE_LIMITED: 'Too many requests. Please try again later.',
  REQUEST_REJECTED: 'The request could not be processed.',
  INTERNAL_ERROR: 'An unexpected error occurred.',
};

function codeForStatus(status: number): ErrorCode {
  switch (status) {
    case 400:
      return 'BAD_REQUEST';
    case 404:
      return 'NOT_FOUND';
    case 413:
      return 'PAYLOAD_TOO_LARGE';
    case 415:
      return 'UNSUPPORTED_MEDIA_TYPE';
    case 429:
      return 'RATE_LIMITED';
    default:
      return status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_REJECTED';
  }
}

function validationDetails(error: FastifyError): ValidationIssue[] | undefined {
  if (!error.validation) return undefined;
  return error.validation.map((issue) => {
    const missing = issue.params?.missingProperty;
    const location = [
      error.validationContext,
      issue.instancePath.replace(/^\//, ''),
      typeof missing === 'string' ? missing : undefined,
    ]
      .filter((part) => part)
      .join('/');
    // Only the schema's own message is exposed; submitted values are never echoed.
    return { path: location, message: issue.message ?? 'is invalid' };
  });
}

function send(
  reply: FastifyReply,
  request: FastifyRequest,
  status: number,
  code: ErrorCode,
  details?: ValidationIssue[],
) {
  const body: PublicErrorResponse = {
    error: {
      code,
      message: PUBLIC_MESSAGES[code],
      requestId: request.id,
      ...(details ? { details } : {}),
    },
  };
  return reply.status(status).header(REQUEST_ID_HEADER, request.id).send(body);
}

/**
 * Every failure leaves the API as a `PublicErrorResponse`; internal details are logged only.
 * Must be called BEFORE registering plugins: routes capture the error handler when they are
 * defined, so a plugin route (e.g. the CORS preflight) defined earlier would keep Fastify's default.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    const status =
      Number.isInteger(error.statusCode) && error.statusCode! >= 400 && error.statusCode! <= 599
        ? error.statusCode!
        : 500;

    if (status >= 500) {
      request.log.error({ err: error }, 'Unhandled request error');
      return send(reply, request, 500, 'INTERNAL_ERROR');
    }

    const details = validationDetails(error);
    request.log.info({ statusCode: status, errorCode: error.code }, 'Request rejected');
    return send(
      reply,
      request,
      status,
      details ? 'VALIDATION_FAILED' : codeForStatus(status),
      details,
    );
  });
}

/**
 * Unknown paths answer with the public 404 body and count against the rate limit, so scanning
 * for routes is bounded. Requires the rate-limit plugin to be registered first.
 */
export function registerNotFoundHandler(app: FastifyInstance): void {
  app.setNotFoundHandler({ preHandler: app.rateLimit() }, (request, reply) =>
    send(reply, request, 404, 'NOT_FOUND'),
  );
}
