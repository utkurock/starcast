import { handleClaim } from './_points';

// Trusted daily-claim endpoint (Node serverless — needs Firebase Admin, so NOT
// edge). Verifies the on-chain claim tx and awards points server-side.
export default async function handler(req: any, res: any): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const { status, body: out } = await handleClaim(body);
  res.status(status).json(out);
}
