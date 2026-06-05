import { ChatInterface } from '@/components/ChatInterface';

export const metadata = {
  title: 'Chat — FinSight',
};

export default function ChatPage({
  searchParams,
}: {
  searchParams: { ticker?: string };
}) {
  const ticker = searchParams.ticker ? searchParams.ticker.toUpperCase() : undefined;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-100">Research Assistant</h1>
      <ChatInterface initialTicker={ticker} />
    </div>
  );
}
