import { createServer } from '../server';

export default async function handler(req: any, res: any) {
  try {
    const app = await createServer();
    return app(req, res);
  } catch (error) {
    console.error('Vercel Handler Error:', error);
    res.status(500).json({ 
      error: 'Internal Server Error', 
      details: error instanceof Error ? error.message : String(error) 
    });
  }
}
