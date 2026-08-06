import { Injectable, type LoggerService } from '@nestjs/common';
import pino, { type Logger } from 'pino';
import { ConfigurationService } from '../configuration/configuration.service';
import { currentRequestContext } from '../request-context/request-context';

@Injectable()
export class PlatformLogger implements LoggerService {
  private readonly logger: Logger;

  public constructor(configuration: ConfigurationService) {
    this.logger = pino({
      level: configuration.values.LOG_LEVEL,
      base: { service: 'api', environment: configuration.values.APP_ENV },
      redact: {
        paths: [
          'password',
          '*.password',
          'token',
          '*.token',
          'authorization',
          'headers.authorization',
        ],
        censor: '[REDACTED]',
      },
      timestamp: pino.stdTimeFunctions.isoTime,
    });
  }

  public log(message: unknown, context?: string): void {
    this.logger.info(this.fields(context), this.message(message));
  }

  public error(message: unknown, trace?: string, context?: string): void {
    this.logger.error({ ...this.fields(context), trace }, this.message(message));
  }

  public warn(message: unknown, context?: string): void {
    this.logger.warn(this.fields(context), this.message(message));
  }

  public debug(message: unknown, context?: string): void {
    this.logger.debug(this.fields(context), this.message(message));
  }

  public verbose(message: unknown, context?: string): void {
    this.logger.trace(this.fields(context), this.message(message));
  }

  public fatal(message: unknown, context?: string): void {
    this.logger.fatal(this.fields(context), this.message(message));
  }

  private fields(context?: string): Record<string, string | undefined> {
    return { ...currentRequestContext(), module: context };
  }

  private message(value: unknown): string {
    return value instanceof Error ? value.message : String(value);
  }
}
