import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';
import type { Request } from 'express';
import { createHash } from 'node:crypto';
import { ReadinessInboxService } from '../application/services/readiness-inbox.service';
import { DirectMtlsIngressService } from '../infrastructure/trusted-workload/direct-mtls-ingress.service';

class ReadinessDeliveryDto {
  @IsString() @IsNotEmpty() public readonly messageId!: string;
  @IsString() @IsNotEmpty() public readonly sagaId!: string;
  @IsInt() @Min(1) public readonly expectedSagaVersion!: number;
}

@Controller('internal/authorization')
export class ReadinessController {
  public constructor(
    private readonly ingress: DirectMtlsIngressService,
    private readonly inbox: ReadinessInboxService,
  ) {}

  @Post('identity-readiness')
  @HttpCode(HttpStatus.OK)
  public async receive(
    @Body() body: ReadinessDeliveryDto,
    @Headers('walrus-readiness-assertion') assertion: string | undefined,
    @Req() request: Request,
  ): Promise<{ readonly assignmentId: string; readonly duplicate: boolean }> {
    if (!assertion || assertion.includes(',')) throw new ForbiddenException('READINESS_DENIED');
    try {
      const attestationDigest = createHash('sha256').update(assertion, 'utf8').digest('base64url');
      const workload = await this.ingress.verify(request, 'IDENTITY_READINESS', {
        version: 'walrus.request-binding.v1',
        httpMethod: 'POST',
        routeTemplate: '/api/v1/internal/authorization/identity-readiness',
        contractVersion: 'wemp.m01-m02.authorization.v2',
        body: {
          messageId: body.messageId,
          sagaId: body.sagaId,
          expectedSagaVersion: body.expectedSagaVersion,
          attestationDigest,
        },
        targetReferences: [body.sagaId],
      });
      return await this.inbox.receive({
        messageId: body.messageId,
        sagaId: body.sagaId,
        expectedSagaVersion: body.expectedSagaVersion,
        compactAttestation: assertion,
        workload,
      });
    } catch {
      throw new ForbiddenException('READINESS_DENIED');
    }
  }
}
