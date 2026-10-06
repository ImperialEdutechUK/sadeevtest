import type { FastifyInstance } from 'fastify';
import { authRoutes } from './auth.js';
import { healthRoutes } from './health.js';
import { meetingRoutes } from './meetings.js';
import { performanceRoutes } from './performance.js';
import { rubricRoutes } from './rubrics.js';
import { systemRoutes } from './system.js';
import { uploadRoutes } from './uploads.js';
import { userRoutes } from './users.js';

export async function registerRoutes(app: FastifyInstance) {
  await app.register(
    async (api) => {
      await api.register(healthRoutes);
      await api.register(authRoutes);
      await api.register(userRoutes);
      await api.register(rubricRoutes);
      await api.register(meetingRoutes);
      await api.register(performanceRoutes);
      await api.register(systemRoutes);
      await api.register(uploadRoutes);
    },
    { prefix: '/api' },
  );
}
