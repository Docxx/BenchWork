/**
 * Cards: the readable things the relay carries between your own devices, as
 * opposed to the encrypted vault. Two kinds today: a fly stock, so scanning a
 * vial shows it on the phone, and a label, so designs reach the phone without
 * exporting a pack. A device credential is needed to read or write them.
 */
import { RelayClient, type RelayConnection } from './relayClient';
import type { PlatformAdapter } from '../platform';

export const CARD_KINDS = ['stock', 'label'] as const;
export type CardKind = (typeof CARD_KINDS)[number];

/** What a listing says about a card: enough to know whether to fetch it. */
export interface CardEntry {
  id: string;
  /** When the card was last written, as the relay's milliseconds. */
  updated: number;
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
/** The relay refuses more than this, so say so before sending. */
export const MAX_CARD_BYTES = 400000;

export class CardStore {
  private readonly client: RelayClient;
  constructor(platform: PlatformAdapter, connection: RelayConnection) {
    this.client = new RelayClient(platform, connection);
  }

  /** Writes a card, replacing any card of the same kind and id. */
  async put(kind: CardKind, id: string, value: unknown): Promise<void> {
    if (!ID.test(id)) throw new Error('That is not a card identifier.');
    const body = JSON.stringify(value);
    if (body.length > MAX_CARD_BYTES) throw new Error('This is too large to send to the phone.');
    await this.client.call('card_put', { kind, id, body });
  }

  /** A card's contents, or null when the relay has none. */
  async get<T>(kind: CardKind, id: string): Promise<T | null> {
    if (!ID.test(id)) return null;
    try {
      const { body } = await this.client.call<{ body: string }>('card_get', { kind, id });
      return JSON.parse(body) as T;
    } catch (err) {
      if (/unavailable/i.test(err instanceof Error ? err.message : '')) return null;
      throw err;
    }
  }

  /** What has changed since `since`, oldest first, so a phone can catch up in order. */
  async list(kind: CardKind, since = 0): Promise<CardEntry[]> {
    const { cards } = await this.client.call<{ cards: CardEntry[] }>('cards_list', { kind, since });
    return cards;
  }

  async remove(kind: CardKind, id: string): Promise<void> {
    if (!ID.test(id)) return;
    await this.client.call('card_delete', { kind, id });
  }
}
