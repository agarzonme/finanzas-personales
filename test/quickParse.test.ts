import { describe, expect, it } from 'vitest';
import { quickParse, type QuickParseResult } from '@/lib/quickParse';

const today = '2026-10-14';
const accountAliases = ['nu', 'bancolombia', 'efectivo', 'tarjeta', 'hapi', 'ibkr', 'tarjeta nu'];
const parse = (t: string) => {
  const r = quickParse(t, { today, accountAliases });
  if (!r.ok) throw new Error(`No parseó "${t}": ${r.error}`);
  return r as QuickParseResult;
};

describe('quickParse — los ejemplos del enunciado', () => {
  it('Gasté 25.000 en almuerzo', () => {
    const r = parse('Gasté 25.000 en almuerzo');
    expect(r).toMatchObject({ intent: 'expense', amount: '25000', currency: null, description: 'Almuerzo', date: today });
  });

  it('Pagué 120.000 de la tarjeta', () => {
    const r = parse('Pagué 120.000 de la tarjeta');
    expect(r).toMatchObject({ intent: 'card_payment', amount: '120000', description: 'Pago de tarjeta' });
    expect(r.hints).toEqual([{ alias: 'tarjeta', role: 'from' }]);
  });

  it('Invertí 500 USD en VOO', () => {
    const r = parse('Invertí 500 USD en VOO');
    expect(r).toMatchObject({ intent: 'investment_buy', amount: '500', currency: 'USD', symbol: 'VOO', quantity: null });
  });

  it('Recibí salario por 4.000.000', () => {
    const r = parse('Recibí salario por 4.000.000');
    expect(r).toMatchObject({ intent: 'income', amount: '4000000', description: 'Salario' });
  });
});

describe('quickParse — montos', () => {
  it.each([
    ['Gasté 25000 en mercado', '25000'],
    ['gaste $25.000,50 en mercado', '25000.50'],
    ['Gasté 25k en uber', '25000'],
    ['Gasté 25 mil en uber', '25000'],
    ['Me costó 1,5 millones el computador', '1500000'],
    ['Pagué 2 palos de arriendo', '2000000'],
    ['Gasté 20 lucas en cine', '20000'],
    ['Gasté 1.234.567 en algo', '1234567'],
    ['Pagué 12.50 USD de Spotify', '12.50'],
  ])('%s → %s', (text, amount) => {
    expect(parse(text).amount).toBe(amount);
  });

  it('detecta dólares escritos al final', () => {
    expect(parse('Gasté 30 dólares en Amazon').currency).toBe('USD');
  });

  it('falla con un mensaje útil cuando no hay monto', () => {
    const r = quickParse('Gasté en almuerzo', { today });
    expect(r.ok).toBe(false);
  });
});

describe('quickParse — cuentas, fechas y otras intenciones', () => {
  it('cuenta de origen con "con"', () => {
    const r = parse('Gasté 18.000 en café con Nu');
    expect(r.description).toBe('Café');
    expect(r.hints).toEqual([{ alias: 'nu', role: 'from' }]);
  });

  it('pago en efectivo', () => {
    const r = parse('Pagué 9.000 de parqueadero en efectivo');
    expect(r.intent).toBe('expense');
    expect(r.description).toBe('Parqueadero');
    expect(r.hints).toEqual([{ alias: 'efectivo', role: 'to' }]);
  });

  it('transferencia entre cuentas', () => {
    const r = parse('Pasé 200.000 de Bancolombia a Nu');
    expect(r.intent).toBe('transfer');
    expect(r.hints).toEqual(expect.arrayContaining([{ alias: 'bancolombia', role: 'from' }, { alias: 'nu', role: 'to' }]));
  });

  it('retiro de cajero', () => {
    const r = parse('Saqué 100.000 del cajero');
    expect(r.intent).toBe('transfer');
    expect(r.amount).toBe('100000');
  });

  it('ayer y fechas explícitas', () => {
    expect(parse('Ayer gasté 40.000 en mercado').date).toBe('2026-10-13');
    expect(parse('Gasté 40.000 en mercado el 3/10').date).toBe('2026-10-03');
    expect(parse('Gasté 40.000 en regalos el 20 de diciembre').date).toBe('2025-12-20');
  });

  it('aporte a meta', () => {
    const r = parse('Ahorré 300.000 para el viaje a Japón');
    expect(r).toMatchObject({ intent: 'goal_contribution', amount: '300000' });
    expect(r.goalHint).toBe('viaje a japon');
  });

  it('compra con cantidad y precio', () => {
    const r = parse('Compré 2,5 VOO a 512 USD en Hapi');
    expect(r).toMatchObject({ intent: 'investment_buy', symbol: 'VOO', quantity: '2.5', price: '512', amount: '1280', currency: 'USD' });
    expect(r.hints).toEqual([{ alias: 'hapi', role: 'to' }]);
  });

  it('venta', () => {
    const r = parse('Vendí 3 acciones de AAPL a 230 dólares');
    expect(r).toMatchObject({ intent: 'investment_sell', symbol: 'AAPL', quantity: '3', price: '230', amount: '690' });
  });

  it('una sigla en un gasto no es un ticker', () => {
    const r = parse('Pagué 950.000 del SOAT');
    expect(r.intent).toBe('expense');
    expect(r.symbol).toBeNull();
    expect(r.description).toBe('SOAT');
  });

  it('ingreso con "me pagaron"', () => {
    const r = parse('Me pagaron 800.000 de un freelance');
    expect(r).toMatchObject({ intent: 'income', amount: '800000', description: 'Freelance' });
  });
});
