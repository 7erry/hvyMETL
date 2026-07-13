import type { Request } from 'express';

/** True when the API is serving hvymetl.studio (or explicitly marked hosted). */
export function isHostedStudioRequest(req: Request): boolean {
  const requestHost = String(req.get('host') ?? '').toLowerCase();
  return (
    process.env.HVYMETL_HOSTED === '1' ||
    Boolean(process.env.HVYMETL_HOSTED_URL?.trim()) ||
    requestHost.includes('hvymetl.studio')
  );
}

/** Public hosted URL shown in UI hints. */
export function hostedStudioUrl(): string {
  return process.env.HVYMETL_HOSTED_URL?.trim() || 'https://hvymetl.studio';
}
