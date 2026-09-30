// Pure helper: the caller passes the app id (from `app` config) so this stays
// free of env/constant coupling.
export function queue(
  appId: string,
  name: string,
  ...params: string[]
): string {
  let queue_name = `${appId}-${name}`;

  params.forEach((name) => {
    queue_name = `${queue_name}--${name}`;
  });

  return queue_name;
}

export const dlq = (queueName: string) => `dlq--${queueName}`;
