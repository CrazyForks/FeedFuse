import ipaddr from 'ipaddr.js';
import { lookup } from 'node:dns/promises';
import { getRssNetworkConfig } from '@/server/infra/env';

const FAKE_IP_BENCHMARK_CIDR_BASE = ipaddr.parse('198.18.0.0');
const FAKE_IP_BENCHMARK_CIDR_PREFIX = 15;

function isBenchmarkTestingIp(addr: ipaddr.IPv4 | ipaddr.IPv6): boolean {
  return addr.kind() === 'ipv4' && addr.match(FAKE_IP_BENCHMARK_CIDR_BASE, FAKE_IP_BENCHMARK_CIDR_PREFIX);
}

function isPublicIp(ip: string): boolean {
  if (!ipaddr.isValid(ip)) return false;

  const addr = ipaddr.parse(ip);
  const range = addr.range();
  if (range === 'unicast') return true;

  const config = getRssNetworkConfig(process.env as Record<string, unknown>);
  // 本地代理软件的 fake-ip DNS 会把公网媒体域名解析到 198.18.0.0/15。
  return range === 'reserved' && config.mode === 'fake-ip' && isBenchmarkTestingIp(addr);
}

export async function isSafeMediaUrl(value: string): Promise<boolean> {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;

  const hostname = url.hostname.toLowerCase();
  if (!hostname) return false;
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) return false;
  if (hostname.endsWith('.local')) return false;
  if (hostname === '0.0.0.0') return false;

  if (ipaddr.isValid(hostname)) {
    return isPublicIp(hostname);
  }

  const records = await lookup(hostname, { all: true, verbatim: true }).catch(() => []);
  if (!records.length) return false;

  return records.every((record) => isPublicIp(record.address));
}
