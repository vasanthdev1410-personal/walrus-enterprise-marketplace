import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, Matches } from 'class-validator';

const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Part 6.2 §9 (Module 02 source material). Role assignment is server-controlled:
 * the target identity is a server-validated UUID and the role is restricted to
 * the approved Phase-1 role set. No client-controlled privilege escalation is
 * possible through this shape.
 */
export class AssignRoleRequestDto {
  @ApiProperty({ example: '0191310f-789a-7123-8123-000000000001' })
  @Matches(UUID_V7_PATTERN)
  public readonly targetIdentityId!: string;

  @ApiProperty({ enum: ['CUSTOMER', 'SELLER', 'ADMIN', 'SUPER_ADMIN'] })
  @IsEnum(['CUSTOMER', 'SELLER', 'ADMIN', 'SUPER_ADMIN'])
  public readonly roleName!: 'CUSTOMER' | 'SELLER' | 'ADMIN' | 'SUPER_ADMIN';
}
