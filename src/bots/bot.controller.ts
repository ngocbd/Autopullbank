import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { Payment } from 'src/gateways/gate.interface';
import { PAYMENT_CREATED } from 'src/shards/events';
import { BotManagerService } from './bots-manager.service';

@Controller('bot')
export class BotController {
  constructor(
    private readonly botSetupService: BotManagerService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @OnEvent(PAYMENT_CREATED)
  handlePaymentCreatedEvent(payments: Payment[]) {
    this.botSetupService.onPaymentsCreated(payments);
  }

  @Post(':token')
  async processUpdate(
    @Param('token') token: string,
    @Body() update: any,
    @Req() req: any,
  ) {
    const secretToken = req.headers['x-telegram-bot-api-secret-token'];
    this.eventEmitter.emit('tele:update', { update, token, secretToken });
    return { status: 'ok' };
  }
}
