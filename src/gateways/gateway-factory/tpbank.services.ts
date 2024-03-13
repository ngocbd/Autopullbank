import axios from 'axios';
import * as moment from 'moment-timezone';
import { Injectable } from '@nestjs/common';

import { GateType, Payment } from '../gate.interface';
import { Gate } from '../gates.services';

@Injectable()
export class TPBankService extends Gate {
  private accessToken: string | null | undefined;

  private deviceId: string;

  makeDeviceId(t: number): string {
    let e = '';
    const n = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const o = n.length;
    for (let i = 0; i < t; i++) {
      e += n.charAt(Math.floor(Math.random() * o));
    }
    return e;
  }

  getDeviceId(): string {
    return this.makeDeviceId(45);
  }

  private async login() {
    this.deviceId = this.getDeviceId();

    const dataSend = {
      username: this.config.login_id,
      password: this.config.password,
      step_2FA: 'VERIFY',
      deviceId: this.deviceId,
    };
    const config = {
      headers: {
        APP_VERSION: '2024.02.24',
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'vi',
        Authorization: 'Bearer',
        Connection: 'keep-alive',
        'Content-Type': 'application/json',
        DEVICE_ID: this.deviceId,
        DEVICE_NAME: 'Chrome',
        Origin: 'https://ebank.tpb.vn',
        PLATFORM_NAME: 'WEB',
        PLATFORM_VERSION: '122',
        Referer: 'https://ebank.tpb.vn/retail/vX/',
        SOURCE_APP: 'HYDRO',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'sec-ch-ua':
          '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"macOS"',
      },
    };
    try {
      const response = await axios.post(
        'https://ebank.tpb.vn/gateway/api/auth/login',
        dataSend,
        config,
      );
      this.accessToken = response.data.access_token;
      if (!this.accessToken) {
        console.log('Không có token');
      } else {
        console.log('Đã lấy được token');
      }
    } catch (error) {
      console.error('Login failed:', error);
      throw new Error('Login failed');
    }
  }

  async getHistory(): Promise<Payment[]> {
    if (!this.accessToken) await this.login();
    const fromDate = moment()
      .tz('Asia/Ho_Chi_Minh')
      .subtract(14, 'days')
      .format('YYYYMMDD');
    const toDate = moment().tz('Asia/Ho_Chi_Minh').format('YYYYMMDD');

    const config = {
      headers: {
        APP_VERSION: '2024.02.24',
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'vi,en-US;q=0.9,en;q=0.8',
        Authorization: `Bearer ${this.accessToken}`,
        Connection: 'keep-alive',
        'Content-Type': 'application/json',
        DEVICE_ID: this.deviceId,
        DEVICE_NAME: 'Chrome',
        Origin: 'https://ebank.tpb.vn',
        PLATFORM_NAME: 'WEB',
        PLATFORM_VERSION: '122',
        SOURCE_APP: 'HYDRO',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'sec-ch-ua':
          '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"macOS"',
      },
    };

    const dataSend = {
      pageNumber: 1,
      pageSize: 400,
      accountNo: this.config.account,
      currency: 'VND',
      maxAcentrysrno: '',
      fromDate: fromDate,
      toDate: toDate,
      keyword: '',
    };

    try {
      const response = await axios.post(
        'https://ebank.tpb.vn/gateway/api/smart-search-presentation-service/v2/account-transactions/find',
        dataSend,
        config,
      );

      const transactionInfosList = response.data.transactionInfos || [];      
      
      // Lọc các giao dịch có creditDebitIndicator là 'CRDT'
      const filteredTransactions = transactionInfosList.filter(
        transactionInfo => transactionInfo.creditDebitIndicator === 'CRDT'
      );      
      // Chuyển đổi các giao dịch đã lọc thành định dạng mới
      const transactionsWithout = filteredTransactions.map(
        (transactionInfos) => ({
          transaction_id: 'tbbank-' + transactionInfos.id,
          amount: Number(transactionInfos.amount),
          content: transactionInfos.description,
          date: moment
            .tz(transactionInfos.valueDate, 'DD-MM-YYYY', 'Asia/Ho_Chi_Minh')
            .toDate(),
          account_receiver: transactionInfos.ofsAcctNo,
          gate: GateType.TPBANK,
        }),
      );
      return transactionsWithout;
    } catch (error) {
      console.error('Error while fetching transaction history:', error);
      throw new Error('Error while fetching transaction history');
    }
  }
}
