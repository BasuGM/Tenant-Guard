import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { startTelemetry } from './telemetry/telemetry';

async function bootstrap(): Promise<void> {
  await startTelemetry('tenantguard-api');

  const app = await NestFactory.create(AppModule, { rawBody: false });
  const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:3100';

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(cookieParser());
  app.enableCors({
    origin: webOrigin,
    credentials: true,
  });

  const port = Number(process.env.API_PORT ?? 3101);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`TenantGuard API listening on ${port}`);
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
