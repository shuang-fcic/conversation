import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { Global, Module } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';

import { rmqConfig } from './rmq.config';
import { RMQ_EXCHANGE } from './rmq.constant';
import { RmqService } from './rmq.service';

@Global()
@Module({
  imports: [
    RabbitMQModule.forRootAsync({
      inject: [rmqConfig.KEY],
      useFactory: (config: ConfigType<typeof rmqConfig>) => ({
        uri: config.uri,
        exchanges: [
          {
            name: RMQ_EXCHANGE.TOPIC,
            type: 'topic',
            options: { durable: true },
          },
          {
            name: RMQ_EXCHANGE.DEADLETTER,
            type: 'direct',
            options: { durable: true },
          },
          {
            name: RMQ_EXCHANGE.INTERNAL,
            type: 'direct',
            options: { durable: true },
          },
        ],
        // Consumers declare their own queues via @RabbitSubscribe, so they
        // self-assert on connect. Add durable dead-letter queues here as
        // subscribers are introduced.
        queues: [],
        channels: {
          default: {
            prefetchCount: 1,
            default: true,
          },
        },
        connectionInitOptions: { wait: false },
      }),
    }),
  ],
  providers: [RmqService],
  exports: [RmqService, RabbitMQModule],
})
export class RmqModule {}
