import axios from 'axios';
import { Injectable } from '@nestjs/common';
import { HttpsProxyAgent } from 'https-proxy-agent';

import { GateType, Payment } from '../gate.interface';
import { Gate } from '../gates.services';
import * as https from 'https';
import * as crypto from 'crypto';

interface TronTransaction {
  data: TronTransactionData[];
  success: boolean;
  meta: Meta;
}

interface Meta {
  at: number;
  page_size: number;
}

interface TronTransactionData {
  transaction_id: string;
  token_info: Tokeninfo;
  block_timestamp: number;
  from: string;
  to: string;
  type: string;
  value: string;
}

interface Tokeninfo {
  symbol: string;
  address: string;
  decimals: number;
  name: string;
}

@Injectable()
export class TronUsdtBlockchainService extends Gate {
  private exchangeRateUsdtToVnd: number = 0;
  private exchangeRateUsdtToVNdLastUpdate: number = 0;

  getAgent() {
    if (this.proxy != null) {
      if (this.proxy.username && this.proxy.username.length > 0) {
        return new HttpsProxyAgent(
          `${this.proxy.schema}://${this.proxy.username}:${this.proxy.password}@${this.proxy.ip}:${this.proxy.port}`,
        );
      }
      return new HttpsProxyAgent(
        `${this.proxy.schema}://${this.proxy.ip}:${this.proxy.port}`,
      );
    }
    return new https.Agent({
      secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
    });
  }

  private async updateExchangeRate() {
    if (Date.now() - this.exchangeRateUsdtToVNdLastUpdate < 1000 * 30) {
      return;
    }

    try {
      const { data } = await axios.get<{
        tether: {
          vnd: number;
        };
      }>(
        `https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=vnd`,
        {
          httpsAgent: this.getAgent(),
        },
      );

      this.exchangeRateUsdtToVnd = data.tether.vnd;
      this.exchangeRateUsdtToVNdLastUpdate = Date.now();
      console.log(
        'Updated exchange rate tether to vnd:',
        this.exchangeRateUsdtToVnd,
      );
    } catch (error: any) {
      console.error(
        'Error while fetching exchange rate: ' + error.message,
        error,
      );
      throw new Error('Error while fetching exchange rate');
    }
  }

  usdtToVnd(usdt: number): number {
    // Giá bán usdt thường sẽ bị lỗ 1%
    return Math.floor(usdt * this.exchangeRateUsdtToVnd * 1.01);
  }
  getUsdtFromTransactionValueAndTokenDecimals(
    value: string,
    decimals: number,
  ): number {
    const usdt = +value / Math.pow(10, decimals);
    return usdt;
  }
  async getHistory(): Promise<Payment[]> {
    try {
      await this.updateExchangeRate();
      const transactions = await axios.get<TronTransaction>(
        `https://api.trongrid.io/v1/accounts/${this.config.account}/transactions/trc20`,
        {
          httpsAgent: this.getAgent(),
          // headers: {
          //   'TRON-PRO-API-KEY': '91cba7d4-7939-49cc-af68-3491d2131f25',
          // },
        },
      );

      const transactionFilterUsdtAndInbound = transactions.data.data.filter(
        (transaction) =>
          transaction.token_info.symbol === 'USDT' &&
          transaction.to === this.config.account,
      );

      const payments: Payment[] = transactionFilterUsdtAndInbound.map(
        (transaction) => {
          const usdt = this.getUsdtFromTransactionValueAndTokenDecimals(
            transaction.value,
            transaction.token_info.decimals,
          );
          const vnd = this.usdtToVnd(usdt);
          return {
            transaction_id: transaction.transaction_id,
            content: `Received ${usdt} usdt (${vnd} vnd) from ${transaction.from}`,
            amount: vnd,
            date: new Date(transaction.block_timestamp),
            gate: GateType.TRON_USDT_BLOCKCHAIN,
            account_receiver: this.config.account,
          };
        },
      );

      return payments;
    } catch (error) {
      console.error('Error while fetching transaction history:', error);
      throw new Error('Error while fetching transaction history');
    }
  }
}
