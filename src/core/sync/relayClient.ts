import type { PlatformAdapter } from '../platform';
import { PROTOCOL, randomKey, fromBase64 } from './relayCrypto';

export interface RelayAddress {
  endpoint: string;
  certificate: string;
}
export interface RelayConnection extends RelayAddress {
  protocol: number;
  vault: string;
  token: string;
  key: string;
  owner: boolean;
  name: string;
}
export interface RelayInvite extends RelayAddress {
  protocol: number;
  vault: string;
  invitation: string;
  key: string;
  expires: number;
}
export function address(value: RelayAddress): void {
  const url = new URL(value.endpoint);
  if (
    url.protocol !== 'https:' ||
    !/^\d+\.\d+\.\d+\.\d+$/.test(url.hostname) ||
    url.port ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    !value.certificate.includes('BEGIN CERTIFICATE') ||
    value.certificate.length > 8192
  )
    throw new Error('Invalid relay address or certificate.');
}
export class RelayClient {
  constructor(
    readonly platform: PlatformAdapter,
    readonly connection: RelayConnection,
  ) {
    address(connection);
  }
  async call<T>(action: string, data: Record<string, unknown> = {}): Promise<T> {
    return request<T>(this.platform, this.connection, {
      action,
      vault: this.connection.vault,
      token: this.connection.token,
      ...data,
    });
  }
  async invitation(): Promise<string> {
    const value = await this.call<{ invitation: string; expires: number }>('invite');
    return JSON.stringify({
      protocol: PROTOCOL,
      endpoint: this.connection.endpoint,
      certificate: this.connection.certificate,
      vault: this.connection.vault,
      key: this.connection.key,
      ...value,
    } satisfies RelayInvite);
  }
}
export async function request<T>(
  platform: PlatformAdapter,
  target: RelayAddress,
  data: Record<string, unknown>,
): Promise<T> {
  address(target);
  if (!platform.relay) throw new Error('Cloud sync needs the installed BenchWork app.');
  return JSON.parse(
    await platform.relay.request(target.endpoint, target.certificate, JSON.stringify(data)),
  ) as T;
}
export async function createRelay(
  platform: PlatformAdapter,
  target: RelayAddress,
  setup: string,
  name: string,
): Promise<RelayConnection> {
  const result = await request<{ vault: string; token: string }>(platform, target, {
    action: 'create',
    setup,
    name,
  });
  return {
    endpoint: target.endpoint,
    certificate: target.certificate,
    ...result,
    protocol: 1,
    key: randomKey(),
    owner: true,
    name,
  };
}
export async function joinRelay(
  platform: PlatformAdapter,
  text: string,
  name: string,
): Promise<RelayConnection> {
  if (text.length > 16000) throw new Error('Pairing details are too large.');
  const invite = JSON.parse(text) as RelayInvite;
  address(invite);
  if (
    invite.protocol !== 1 ||
    typeof invite.vault !== 'string' ||
    typeof invite.invitation !== 'string' ||
    typeof invite.key !== 'string' ||
    fromBase64(invite.key).length !== 32 ||
    !Number.isFinite(invite.expires) ||
    invite.expires * 1000 < Date.now()
  )
    throw new Error('Pairing details are invalid or have expired.');
  const result = await request<{ token: string }>(platform, invite, {
    action: 'join',
    vault: invite.vault,
    invitation: invite.invitation,
    name,
  });
  return {
    endpoint: invite.endpoint,
    certificate: invite.certificate,
    vault: invite.vault,
    key: invite.key,
    token: result.token,
    protocol: 1,
    owner: false,
    name,
  };
}
