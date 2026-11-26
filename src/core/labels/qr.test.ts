// @vitest-environment node
import { mmToPoints, pointsToMm } from './model';
import { fitQr, qrMatrix, qrSizeWarning } from './qr';

describe('QR codes for labels', () => {
  it('keeps a stock link small enough for a 15 mm label', () => {
    expect(qrMatrix('benchwork://s/K7M2Q9XA').size).toBe(25);
  });
  it('gives every module a whole number of printer dots', () => {
    const fit = fitQr(25, 12, 203);
    expect(fit.dotsPerModule).toBe(3);
    expect(fit.dots).toBe(87);
    expect(fit.minimumMm).toBe(10.9);
  });
  it('warns when a code is too small to scan, and not otherwise', () => {
    const link = 'benchwork://s/K7M2Q9XA';
    expect(qrSizeWarning(link, 8, 203)).toMatch(/may not scan.*10.9 mm/);
    expect(qrSizeWarning(link, 2, 203)).toMatch(/too small to print/);
    expect(qrSizeWarning(link, 12, 203)).toBeNull();
    expect(qrSizeWarning('{link}', 4, 203)).toBeNull();
  });
});

describe('text sizes in points', () => {
  it('converts between points and stored millimetres', () => {
    expect(pointsToMm(72)).toBe(25.4);
    expect(mmToPoints(pointsToMm(9))).toBe(9);
    expect(mmToPoints(2.5)).toBe(7.1);
  });
});
