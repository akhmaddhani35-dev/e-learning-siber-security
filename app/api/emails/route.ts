import emails from '@/backend/data/emails.json';

export async function GET() {
  return Response.json(emails);
}
