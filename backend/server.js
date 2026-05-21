import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import dotenv from 'dotenv';
import { vanguardDocumentRoutes } from './routes/vanguard_documents.js';

dotenv.config();

const app = Fastify({
  logger: true,
  bodyLimit: Number(process.env.MAX_UPLOAD_MB || 35) * 1024 * 1024
});

await app.register(cors, {
  origin: true,
  methods: ['GET', 'POST', 'OPTIONS']
});

await app.register(multipart, {
  limits: {
    fileSize: Number(process.env.MAX_UPLOAD_MB || 35) * 1024 * 1024,
    files: 10
  }
});

app.get('/health', async () => {
  return {
    ok: true,
    service: 'nexus-vanguard-backend',
    aiEnabled: String(process.env.AI_ENABLED || 'true') === 'true' && !!process.env.OPENAI_API_KEY,
    ocrEnabled: String(process.env.OCR_ENABLED || 'true') === 'true'
  };
});

await app.register(vanguardDocumentRoutes, { prefix: '/api/vanguard' });

const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || '0.0.0.0';

try {
  await app.listen({ port, host });
  app.log.info(`NEXUS Vanguard backend listening on ${host}:${port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
