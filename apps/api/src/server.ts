import Fastify, { type FastifyInstance } from 'fastify';
import fastifySwagger from '@fastify/swagger';
import fastifyCookie from '@fastify/cookie';
import fastifyMultipart from '@fastify/multipart';
import { loadConfig, type AppConfig } from './config.js';
import { createDatabase, type Database } from './db/client.js';
import { createStorage } from './storage/index.js';
import { makeGuards } from './auth/context.js';
import { LoginThrottle } from './auth/rate-limit.js';
import { csrfHook, issueCsrf } from './auth/csrf.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerContentRoutes } from './routes/content.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerChildrenRoutes } from './routes/children.js';
import { registerSessionRoutes } from './routes/sessions.js';
import { registerGovernanceRoutes } from './routes/governance.js';
import { registerStudioRoutes } from './routes/studio.js';
import { registerAdmissionsRoutes } from './routes/admissions.js';
import { registerReadinessRoutes } from './routes/readiness.js';
import { registerSpecialisationRoutes } from './routes/specialisation.js';
import { registerScholarRoutes } from './routes/scholar.js';
import { registerShareRoutes } from './routes/shares.js';
import { makeGateway } from './learning/coach.js';
import { MAX_UPLOAD_BYTES } from './storage/validate-upload.js';

export interface BuildOptions {
  config?: AppConfig;
  db?: Database;
  loginThrottle?: LoginThrottle;
}

/** Dựng app Fastify (không listen). Dùng cho test và cho index.ts. */
export async function buildServer(opts: BuildOptions = {}): Promise<{
  app: FastifyInstance;
  db: Database;
  config: AppConfig;
}> {
  const config = opts.config ?? loadConfig();
  const db = opts.db ?? (await createDatabase(config));
  const storage = createStorage(config);
  const gateway = makeGateway(config);
  const isProd = config.NODE_ENV === 'production';

  const app = Fastify({
    bodyLimit: 2 * 1024 * 1024, // JSON tối đa 2MB (multipart có giới hạn riêng)
    logger:
      config.NODE_ENV === 'test'
        ? false
        : {
            level: 'info',
            redact: [
              'req.headers.authorization',
              'req.headers.cookie',
              'res.headers["set-cookie"]',
            ],
          },
  });

  await app.register(fastifyCookie);
  await app.register(fastifyMultipart, {
    limits: { fileSize: MAX_UPLOAD_BYTES + 1024, files: 1 },
  });
  await app.register(fastifySwagger, {
    openapi: { info: { title: 'Hành trình Tự làm được — API', version: '0.3.0' } },
  });

  const guards = makeGuards(db);
  const loginThrottle = opts.loginThrottle ?? new LoginThrottle();

  app.addHook('preHandler', csrfHook);
  app.get('/auth/csrf', async (_req, reply) => {
    const token = issueCsrf(reply, isProd);
    return { token };
  });

  registerHealthRoutes(app, db);
  registerAuthRoutes(app, db, guards, { isProd, loginThrottle });
  registerChildrenRoutes(app, db, guards, { isProd });
  registerContentRoutes(app, db, guards);
  registerSessionRoutes(app, db, guards, { storage, gateway });
  registerGovernanceRoutes(app, db, guards, { storage });
  registerStudioRoutes(app, db, guards);
  registerAdmissionsRoutes(app, db, guards);
  registerReadinessRoutes(app, db, guards);
  registerSpecialisationRoutes(app, db, guards);
  registerScholarRoutes(app, db, guards);
  registerShareRoutes(app, db, guards);

  app.get('/openapi.json', async () => app.swagger());

  return { app, db, config };
}
