import { Injectable } from '@nestjs/common';
import { Clock } from '../../domain/clock';

@Injectable()
export class SystemClock extends Clock {
  now(): Date {
    return new Date();
  }
}
