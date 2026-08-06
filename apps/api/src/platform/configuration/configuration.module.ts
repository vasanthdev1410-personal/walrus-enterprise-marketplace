import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnvironment } from '@walrus/config';
import { ConfigurationService } from './configuration.service';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: ['../../.env.local', '.env.local', '.env'],
      isGlobal: true,
    }),
  ],
  providers: [
    {
      provide: ConfigurationService,
      useFactory: (): ConfigurationService =>
        new ConfigurationService(validateEnvironment(process.env)),
    },
  ],
  exports: [ConfigurationService],
})
// NestJS modules are declarative metadata containers and intentionally have no members.
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class ConfigurationModule {}
