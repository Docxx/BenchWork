// @vitest-environment node
import type { ModuleContext } from '@core/api';
import { readStock } from './records';
import { sendStocks, stockCard } from './phone';

const stock = (data: Record<string, unknown>) =>
  readStock('Fly room/Stocks/Myd88-KO-CyO.flystock.yaml', {
    genotype: 'w ; Myd88[KO]/CyO ; + ; +',
    source: 'Bloomington',
    number: '93769',
    flybase: 'FBst0093769',
    status: 'Healthy',
    location: 'Rack 2',
    flipEvery: 14,
    lastFlipped: '2026-11-20',
    reference: 'Cao et al. 2013, PNAS. 10.1073/pnas.1306220110',
    code: 'K7M2Q9XA',
    ...data,
  });

function fakeCards(available = true) {
  const sent = new Map<string, unknown>();
  const failures: string[] = [];
  const ctx = {
    cards: {
      available: () => available,
      put: (kind: string, id: string, value: unknown) => {
        if (id === 'FAILFAIL') {
          failures.push(id);
          return Promise.reject(new Error('Relay unreachable'));
        }
        sent.set(`${kind}/${id}`, value);
        return Promise.resolve();
      },
      get: () => Promise.resolve(null),
      list: () => Promise.resolve([]),
      remove: () => Promise.resolve(),
    },
  } as unknown as ModuleContext;
  return { ctx, sent, failures };
}

it('shapes a stock for a phone screen, working out its links here', () => {
  const card = stockCard(stock({}), new Date('2026-11-26T12:00:00Z'));
  expect(card).toMatchObject({
    code: 'K7M2Q9XA',
    name: 'Myd88-KO-CyO',
    genotype: 'w ; Myd88[KO]/CyO ; + ; +',
    flybase: 'FBst0093769',
    location: 'Rack 2',
    sent: '2026-11-26',
  });
  expect(card.centre).toEqual({
    centre: 'Bloomington',
    url: 'https://bdsc.indiana.edu/Home/Search?presearch=93769',
  });
  expect(card.referenceUrl).toBe('https://doi.org/10.1073/pnas.1306220110');
});

it('splits the genotype by chromosome, marking the wild-type ones', () => {
  const card = stockCard(stock({ genotype: '+ ; Sco/CyO ; TM3/TM6 ; +' }));
  expect(card.chromosomes).toEqual([
    { name: 'X', copies: ['+'], plain: true },
    { name: '2', copies: ['Sco', 'CyO'], plain: false },
    { name: '3', copies: ['TM3', 'TM6'], plain: false },
    { name: '4', copies: ['+'], plain: true },
  ]);
  // One entry where both copies match, so the phone shows it once.
  expect(stockCard(stock({ genotype: 'w ; Myd88[KO] ; + ; +' })).chromosomes[1]).toEqual({
    name: '2',
    copies: ['Myd88[KO]'],
    plain: false,
  });
});

it('sends only stocks with a label code, and keeps going when one fails', async () => {
  const { ctx, sent } = fakeCards();
  const count = await sendStocks(ctx, [
    stock({}),
    stock({ code: '' }),
    stock({ code: 'not a code' }),
    stock({ code: 'FAILFAIL' }),
    stock({ code: 'B4N2M7XQ' }),
  ]);
  expect(count).toBe(2);
  expect([...sent.keys()]).toEqual(['stock/K7M2Q9XA', 'stock/B4N2M7XQ']);
});

it('sends nothing when the relay is not set up', async () => {
  const { ctx, sent } = fakeCards(false);
  expect(await sendStocks(ctx, [stock({})])).toBe(0);
  expect(sent.size).toBe(0);
});
