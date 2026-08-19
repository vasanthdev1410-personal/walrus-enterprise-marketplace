import { Global, Module } from '@nestjs/common';
import { IdentityAuthenticationModule } from '../identity-authentication/identity-authentication.module';
import { CART_RETENTION_CONFIGURATION } from './cart.tokens';
import { CartRetentionPolicy } from './domain/policy/cart-retention.policy';
import { RecordedCartRetentionConfigurationAdapter } from './infrastructure/configuration/recorded-cart-retention-configuration.adapter';
import { PrismaCartRepository } from './infrastructure/persistence/prisma/repositories/prisma-cart-repository';

/**
 * WEMP-M07-PLAN-001 M07-M2. Module 07 persistence wiring only. No
 * application services, controllers, or authorization integration
 * (A-13 / M07-M3…M07-M5 NOT AUTHORIZED).
 *
 * Provides:
 * - PrismaCartRepository (implements CartRepository port)
 * - CartRetentionPolicy (domain policy, reused by M07-M3 retention processor)
 * - CartRetentionConfigurationPort (env-configurable, default 90 days per D-11)
 *
 * The repository is @Global so that M07-M3 application services can inject it
 * through the port token when that milestone is authorized.
 */
@Global()
@Module({
  imports: [IdentityAuthenticationModule],
  providers: [
    {
      provide: CART_RETENTION_CONFIGURATION,
      useClass: RecordedCartRetentionConfigurationAdapter,
    },
    CartRetentionPolicy,
    PrismaCartRepository,
  ],
  exports: [PrismaCartRepository, CartRetentionPolicy, CART_RETENTION_CONFIGURATION],
})
// NestJS modules are declarative metadata containers and intentionally have no members.
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class CartModule {}
