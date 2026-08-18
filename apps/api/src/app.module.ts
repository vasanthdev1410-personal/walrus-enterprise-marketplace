import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ConfigurationModule } from './platform/configuration/configuration.module';
import { PrismaModule } from './modules/identity-authentication/infrastructure/persistence/prisma/prisma.module';
import { GlobalExceptionFilter } from './platform/errors/global-exception.filter';
import { HealthController } from './platform/health/health.controller';
import { HealthService } from './platform/health/health.service';
import { PlatformLogger } from './platform/logging/platform-logger.service';
import { RequestLoggingMiddleware } from './platform/logging/request-logging.middleware';
import { MetricsService } from './platform/metrics/metrics.service';
import { RequestContextMiddleware } from './platform/request-context/request-context.middleware';
import { SecurityHeadersMiddleware } from './platform/security/security-headers.middleware';
import { IdentityAuthenticationModule } from './modules/identity-authentication/identity-authentication.module';
import { AuthorizationModule } from './modules/authorization/authorization.module';
import { AuthorizationCoreModule } from './modules/authorization/authorization-core.module';
import { SellerManagementModule } from './modules/seller-management/seller-management.module';
import { ProductCatalogModule } from './modules/product-catalog/product-catalog.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { CustomerModule } from './modules/customer/customer.module';

@Module({
  imports: [
    ConfigurationModule,
    PrismaModule,
    AuthorizationCoreModule,
    IdentityAuthenticationModule,
    AuthorizationModule,
    SellerManagementModule,
    ProductCatalogModule,
    InventoryModule,
    CustomerModule,
  ],
  controllers: [HealthController],
  providers: [
    HealthService,
    MetricsService,
    PlatformLogger,
    GlobalExceptionFilter,
    SecurityHeadersMiddleware,
  ],
  exports: [PlatformLogger],
})
export class AppModule implements NestModule {
  public configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestContextMiddleware, RequestLoggingMiddleware, SecurityHeadersMiddleware)
      .forRoutes('*');
  }
}
