import { classifyEmail } from '@/backend/ai/detector';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const text = String(body?.text || '');

    if (!text.trim()) {
      return Response.json({ error: 'Text is required' }, { status: 400 });
    }

    return Response.json(classifyEmail(text));
  } catch {
    return Response.json({ error: 'Invalid request' }, { status: 400 });
  }
}
