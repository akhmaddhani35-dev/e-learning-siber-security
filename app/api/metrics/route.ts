import emails from '@/backend/data/emails.json';
import { classifyEmail } from '@/backend/ai/detector';

export async function GET() {
  const rows = emails.map((item) => {
    const predicted = classifyEmail(item.text);
    const correct = predicted.label === item.label;
    return { ...item, predicted: predicted.label, correct };
  });

  const total = rows.length;
  const correct = rows.filter((row) => row.correct).length;
  const accuracy = total > 0 ? Number(((correct / total) * 100).toFixed(2)) : 0;

  return Response.json({
    total,
    correct,
    accuracy,
    target: 70,
    passed: accuracy >= 70,
  });
}
