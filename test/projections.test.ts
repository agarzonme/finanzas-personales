import { describe, expect, it } from 'vitest';
import { monthlyRateFromEA, monthsToReach, projectGoal, projectPayoff, requiredMonthly } from '@/lib/projections';

describe('tasas', () => {
  it('convierte EA a mensual', () => {
    // 12 % EA ≈ 0,9489 % mensual
    expect(monthlyRateFromEA(0.12)).toBeCloseTo(0.009489, 5);
  });
});

describe('metas', () => {
  it('sin rendimiento: meses = faltante / aporte, redondeado hacia arriba', () => {
    expect(monthsToReach(1_000_000, 10_000_000, 1_000_000)).toBe(9);
    expect(monthsToReach(0, 1_000_000, 300_000)).toBe(4);
  });

  it('con rendimiento llega antes', () => {
    const sin = monthsToReach(0, 12_000_000, 500_000, 0)!;
    const con = monthsToReach(0, 12_000_000, 500_000, 0.1)!;
    expect(con).toBeLessThan(sin);
  });

  it('sin aportes ni rendimiento nunca llega', () => {
    expect(monthsToReach(100, 1000, 0, 0)).toBeNull();
  });

  it('aporte requerido y monthsToReach son consistentes', () => {
    const pmt = requiredMonthly(2_000_000, 20_000_000, 24, 0.09);
    expect(monthsToReach(2_000_000, 20_000_000, pmt, 0.09)).toBe(24);
  });

  it('proyección completa con fecha objetivo', () => {
    const p = projectGoal({ current: 3_000_000, target: 12_000_000, monthly: 500_000, ea: 0, today: '2026-10-14', targetDate: '2027-10-01' });
    expect(p.pct).toBeCloseTo(0.25);
    expect(p.monthsLeft).toBe(18);
    expect(p.projectedDate).toBe('2028-04-14');
    expect(p.monthlyNeeded).toBeCloseTo(750_000);
    expect(p.onTrack).toBe(false);
  });
});

describe('deudas', () => {
  it('pago que no cubre intereses nunca termina', () => {
    const p = projectPayoff(5_000_000, 0.28, 50_000, '2026-10-14');
    expect(p.months).toBeNull();
  });

  it('calcula meses e intereses', () => {
    const p = projectPayoff(5_000_000, 0.28, 500_000, '2026-10-14');
    expect(p.months).toBe(12);
    expect(p.totalInterest).toBeGreaterThan(0);
    expect(p.totalInterest).toBeLessThan(1_000_000);
  });

  it('sin interés', () => {
    expect(projectPayoff(1_000_000, 0, 250_000, '2026-01-31').payoffDate).toBe('2026-05-31');
  });
});
