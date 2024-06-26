import {Injectable, OnApplicationBootstrap} from '@nestjs/common';
import {PaymentConfigService} from "../payment-config/payment-config.services";
import {ProxyConfig} from "./proxy.interfaces";
import axios from "axios";
@Injectable()
export class ProxyService implements OnApplicationBootstrap {
  private proxies:ProxyConfig[] = [];
  constructor(
      private readonly paymentConfigService: PaymentConfigService,
  ) {}


  async onApplicationBootstrap() {
    this.proxies = await this.paymentConfigService.getConfigPath<ProxyConfig>('proxies');
  }
  async getProxy(name: string): Promise<ProxyConfig> {
    if (!name || name.length == 0) {
      return null;
    }

    const proxy : ProxyConfig = this.proxies.find(value => value.name.toLowerCase() === name.toLowerCase());

    if (!proxy) {
      return null;
    }

    if (proxy.change_url && proxy.change_url.length > 0 && proxy.change_interval_in_sec > 0) {
      if (!proxy.last_change_ip) {
        proxy.last_change_ip = Date.now();
      }

      if (Date.now() - proxy.last_change_ip > proxy.change_interval_in_sec * 1000) {
        proxy.last_change_ip = Date.now();
        try {
          const response = await axios.get(proxy.change_url);
          console.info(`Refresh ip of proxy ${proxy.name} success:`, response);
        } catch (e) {
          console.error(`Error while refresh ip of proxy ${proxy.name}`, e);
        }
      }
    }

    return proxy;
  }
}
