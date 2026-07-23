import { handleTask } from './_points';

// Trusted task-completion endpoint (Node serverless). Awards catalog-defined
// points once per task per user; on-chain tasks are verified against Horizon.
export default async function handler(req: any, res: any): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const { status, body: out } = await handleTask(body);
  res.status(status).json(out);
}
