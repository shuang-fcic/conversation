import { MessagingClient } from './messaging.client';
describe('MessagingClient contract', () => {
  const client = new MessagingClient({
    messagingBaseUrl: 'http://messaging.test/',
  });
  const payload = {
    recipientEmail: 'agent@example.com',
    recipientName: 'Agent',
    recipientRole: 'agent' as const,
    conversationPublicId: 'id',
  };
  it('calls the generic workflow with the dedicated caller identity', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{}'));
    await client.notifyReply(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://messaging.test/messages',
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
          'x-app-source': 'ms-conversations',
        },
        body: JSON.stringify({
          workflowName: 'conversation-reply',
          data: payload,
        }),
      }),
    );
  });
  it('rejects delivery failures for the notifier to isolate', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('', { status: 503 }));
    await expect(client.notifyReply(payload)).rejects.toThrow('503');
  });
});
