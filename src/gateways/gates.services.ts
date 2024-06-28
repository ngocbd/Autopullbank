import { EventEmitter2 } from '@nestjs/event-emitter';
import { GateConfig, Payment } from './gate.interface';
import { Injectable, Logger } from '@nestjs/common';
import {
  GATEWAY_CRON_ERROR_STREAK,
  PAYMENT_HISTORY_UPDATED,
} from 'src/shards/events';
import { CaptchaSolverService } from 'src/captcha-solver/captcha-solver.service';
import { sleep } from 'src/shards/helpers/sleep';
import { ProxyService } from '../proxy/proxy.service';
import { ProxyConfig } from '../proxy/proxy.interfaces';

@Injectable()
export abstract class Gate {
  private isCronRunning = true;
  private logger = new Logger(Gate.name);
  protected proxy: ProxyConfig;
  constructor(
    protected readonly config: GateConfig,
    protected readonly eventEmitter: EventEmitter2,
    protected readonly captchaSolver: CaptchaSolverService,
    protected readonly proxies: ProxyService,
  ) {
    this.cron();
  }

  abstract getHistory(): Promise<Payment[]>;
  getName() {
    return this.config.name;
  }
  async getHistoryAndPublish() {
    this.proxy = null;
    if (this.config.proxy && this.config.proxy.length > 0) {
      this.proxy = await this.proxies.getProxy(this.config.proxy);
    }
    const payments = await this.getHistory();
    this.eventEmitter.emit(PAYMENT_HISTORY_UPDATED, payments);
    this.logger.log(
      JSON.stringify({
        label: 'CronInfo',
        type: this.config.type,
        payments: payments.length,
      }),
    );
  }

  private errorStreak = 0;
  private async handleError(error: any) {
    this.logger.error(this.getName() + error);
    await sleep(10000);
    this.errorStreak++;
    this.logger.error(error);
    if (this.errorStreak > 5) {
      this.stopCron();
      this.eventEmitter.emit(GATEWAY_CRON_ERROR_STREAK, {
        name: this.getName(),
        error: error.message,
      });
      setTimeout(
        () => {
          this.errorStreak = 0;
          this.startCron();
        },
        5 * 60 * 1000,
      );
    }
  }
  async cron() {
    while (true) {
      if (!this.isCronRunning) {
        await sleep(5000);
        continue;
      }

      try {
        await this.getHistoryAndPublish();
        this.errorStreak = 0;
        await sleep(this.config.repeat_interval_in_sec * 1000);
      } catch (error) {
        await this.handleError(error);
      }
    }
  }
  stopCron() {
    this.isCronRunning = false;
  }
  startCron() {
    this.isCronRunning = true;
  }
}
