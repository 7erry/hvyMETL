import { Router } from 'express';

/**
 * High Availability Agent API — studio-driven topology today; LLM tools can extend this router later.
 */
export function createHaAssistantRouter(): Router {
  const router = Router();

  router.get('/status', (_req, res) => {
    res.json({
      configured: false,
      mode: 'studio',
      message: 'HA topology is configured in Migration Studio (Developer sidebar and Copilot HA tab).',
    });
  });

  return router;
}
