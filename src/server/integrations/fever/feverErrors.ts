import { AppError, ServiceUnavailableError, UnauthorizedError } from '@/server/infra/http/errors';

export class FeverProtocolError extends AppError {
  constructor(message = 'Fever 响应格式无效') {
    super(message, 'fever_protocol_error', 502);
  }
}

export class FeverAuthError extends UnauthorizedError {
  constructor(message = 'Fever 认证失败') {
    super(message);
    this.code = 'fever_auth_failed';
  }
}

export function mapFeverError(error: unknown): Error {
  if (
    error instanceof TypeError
    || (
      error instanceof Error
      && /fetch failed|network|timed? out|econn|enotfound|socket/i.test(error.message)
    )
  ) {
    return new ServiceUnavailableError('Fever 服务暂时不可用，请稍后重试');
  }

  if (error instanceof Error) {
    return error;
  }

  return new ServiceUnavailableError('Fever 服务暂时不可用，请稍后重试');
}
