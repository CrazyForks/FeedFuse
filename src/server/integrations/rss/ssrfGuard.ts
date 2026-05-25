import ipaddr from 'ipaddr.js';
import { lookup } from 'node:dns/promises';
import { getRssNetworkConfig, type RssNetworkConfig } from '@/server/infra/env';

const DOCKER_HOST_ALIAS = 'host.docker.internal';
const RESERVED_HOSTNAME_SUFFIXES = ['.localhost', '.local', '.test', '.example', '.invalid'];
const FAKE_IP_BENCHMARK_CIDR_BASE = ipaddr.parse('198.18.0.0');
const FAKE_IP_BENCHMARK_CIDR_PREFIX = 15;
const RFC1918_PRIVATE_CIDRS = [
  ipaddr.parseCIDR('10.0.0.0/8'),
  ipaddr.parseCIDR('172.16.0.0/12'),
  ipaddr.parseCIDR('192.168.0.0/16'),
] as const;

export interface SafeExternalUrlOptions {
  allowUnresolvedHostname?: boolean;
}

function getNetworkConfig(): RssNetworkConfig {
  return getRssNetworkConfig(process.env as Record<string, unknown>);
}

function isBenchmarkTestingIp(addr: ipaddr.IPv4 | ipaddr.IPv6): boolean {
  return addr.kind() === 'ipv4' && addr.match(FAKE_IP_BENCHMARK_CIDR_BASE, FAKE_IP_BENCHMARK_CIDR_PREFIX);
}

function isPrivateLanIp(addr: ipaddr.IPv4 | ipaddr.IPv6): boolean {
  return addr.kind() === 'ipv4' && RFC1918_PRIVATE_CIDRS.some(([base, prefix]) => addr.match(base, prefix));
}

function isExplicitlyAllowedByCidrs(addr: ipaddr.IPv4 | ipaddr.IPv6, cidrs: string[]): boolean {
  for (const cidr of cidrs) {
    const [base, prefix] = ipaddr.parseCIDR(cidr);
    if (addr.kind() === base.kind() && addr.match(base, prefix)) {
      return true;
    }
  }
  return false;
}

function isAllowedIp(ip: string, options?: { allowLoopback?: boolean }): boolean {
  if (!ipaddr.isValid(ip)) return false;
  const addr = ipaddr.parse(ip);
  const range = addr.range();
  const config = getNetworkConfig();
  if (range === 'unicast') return true;
  // 本地部署常见 fake-ip 会落到 198.18.0.0/15，这里只做定向兼容。
  if (range === 'reserved' && config.mode === 'fake-ip' && isBenchmarkTestingIp(addr)) {
    return true;
  }
  if (config.mode === 'lan' && isPrivateLanIp(addr)) {
    return true;
  }
  if (config.mode === 'custom' && isExplicitlyAllowedByCidrs(addr, config.allowedCidrs)) {
    return true;
  }
  if (options?.allowLoopback && range === 'loopback') return true;
  return false;
}

function looksLikePublicHostname(hostname: string): boolean {
  if (!hostname.includes('.')) return false;
  if (!/^[a-z0-9.-]+$/i.test(hostname)) return false;

  const labels = hostname.split('.');
  if (
    labels.some((label) => label.length === 0 || label.startsWith('-') || label.endsWith('-'))
  ) {
    return false;
  }

  return !RESERVED_HOSTNAME_SUFFIXES.some(
    (suffix) => hostname === suffix.slice(1) || hostname.endsWith(suffix),
  );
}

export async function isSafeExternalUrl(
  value: string,
  options?: SafeExternalUrlOptions,
): Promise<boolean> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;

  const hostname = url.hostname.toLowerCase();
  const config = getNetworkConfig();
  if (!hostname) return false;

  // Docker users may enter the host alias directly; treat it the same as localhost.
  if (hostname === DOCKER_HOST_ALIAS) {
    return true;
  }

  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    return true;
  }
  // `.local` 通常用于 mDNS，本地部署在 lan/custom 模式下需要继续解析后按 IP 策略判断。
  if (hostname.endsWith('.local') && config.mode === 'public') return false;
  if (hostname === '0.0.0.0') return false;

  if (ipaddr.isValid(hostname)) {
    return isAllowedIp(hostname, { allowLoopback: true });
  }

  try {
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    if (!addresses.length) return false;
    for (const record of addresses) {
      if (!isAllowedIp(record.address)) return false;
    }
    return true;
  } catch {
    // Some feed URLs are reachable via container/proxy networking even when
    // local DNS lookup fails inside Node. Let explicit callers opt into that fallback.
    return options?.allowUnresolvedHostname === true && looksLikePublicHostname(hostname);
  }
}
