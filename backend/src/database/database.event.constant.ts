// Emitted once per reachability transition, not once per connection attempt.
export const DB2_HEALTH_CHANGED_EVENT = 'db2.health.changed';

export interface Db2HealthChangedEvent {
  status: 'up' | 'down';
  error?: string;
}
