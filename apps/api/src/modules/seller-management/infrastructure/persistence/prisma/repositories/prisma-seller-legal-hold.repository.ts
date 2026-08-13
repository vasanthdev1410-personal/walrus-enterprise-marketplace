import { Injectable } from '@nestjs/common';
import { UuidV7 } from '../../../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { SellerEvidenceLegalHold } from '../../../../domain/entities/seller-evidence-legal-hold';
import type { SellerLegalHoldRepository } from '../../../../domain/ports/seller-legal-hold-repository.port';
import { sellerEvidenceLegalHoldMapper } from '../mappers/seller-management.mapper';
import { PrismaService } from '../../../../../identity-authentication/infrastructure/persistence/prisma/prisma.service';
import { assertVersionUpdated } from '../../../../../identity-authentication/infrastructure/persistence/prisma/repositories/repository-support';

/**
 * WEMP-M03-SPEC-001 / decision D-03. Prisma implementation of the legal-hold
 * repository. findActiveBySellerProfileId returns the active hold or null;
 * insert/save are version-guarded for the release transition. Holds are never
 * deleted. The seller_profile_id is a logical UUIDv7 reference — Module 03
 * never reads Module 01 or Module 02 storage.
 */
@Injectable()
export class PrismaSellerLegalHoldRepository implements SellerLegalHoldRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async findActiveBySellerProfileId(
    sellerProfileId: UuidV7,
  ): Promise<SellerEvidenceLegalHold | null> {
    const record = await this.prisma.sellerEvidenceLegalHold.findFirst({
      where: { sellerProfileId: sellerProfileId.value, active: true },
      orderBy: { placedAt: 'desc' },
    });
    return record === null ? null : sellerEvidenceLegalHoldMapper.toDomain(record);
  }

  public async insert(hold: SellerEvidenceLegalHold): Promise<void> {
    await this.prisma.sellerEvidenceLegalHold.create({
      data: sellerEvidenceLegalHoldMapper.toPersistence(hold),
    });
  }

  public async save(hold: SellerEvidenceLegalHold): Promise<void> {
    const persistence = sellerEvidenceLegalHoldMapper.toPersistence(hold);
    const result = await this.prisma.sellerEvidenceLegalHold.updateMany({
      where: {
        legalHoldId: hold.properties.legalHoldId.value,
        active: true,
      },
      data: { ...persistence, active: hold.properties.active },
    });
    assertVersionUpdated(result.count, 'SellerEvidenceLegalHold');
  }
}
