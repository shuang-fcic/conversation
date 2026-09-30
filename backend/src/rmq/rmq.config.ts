import { registerAs } from '@nestjs/config';
import { IsNotEmpty, IsString } from 'class-validator';

export class RmqEnv {
  @IsString()
  @IsNotEmpty()
  RMQ_HOST!: string;

  @IsString()
  @IsNotEmpty()
  RMQ_USER!: string;

  @IsString()
  @IsNotEmpty()
  RMQ_PASS!: string;
}

export const rmqConfig = registerAs('rmq', () => ({
  host: process.env.RMQ_HOST as string,
  user: process.env.RMQ_USER as string,
  pass: process.env.RMQ_PASS as string,
  uri: `amqp://${process.env.RMQ_USER}:${process.env.RMQ_PASS}@${process.env.RMQ_HOST}`,
}));

export type RmqConfig = ReturnType<typeof rmqConfig>;
