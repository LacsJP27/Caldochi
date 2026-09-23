import type { FastifyPluginAsync } from 'fastify';

const healthResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['status'],
  properties: {
    status: { type: 'string', enum: ['ok'] },
  },
} as const;

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/healthz',
    {
      schema: {
        response: {
          200: healthResponseSchema,
        },
      },
    },
    async () => ({ status: 'ok' }),
  );
};
