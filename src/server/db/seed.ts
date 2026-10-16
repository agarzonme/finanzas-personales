/**
 * Datos iniciales: categorías pensadas para Colombia, reglas de categorización automática
 * y las cuentas que mencionaste (puedes renombrarlas, archivarlas o crear más).
 * Solo se ejecuta si la base está vacía.
 */
import { eq } from 'drizzle-orm';
import type { DbOrTx } from './connect';
import { accounts, categories, categoryRules, settings } from './schema';

const EXPENSE_CATEGORIES: Array<[name: string, icon: string, essential: boolean, keywords: string[]]> = [
  ['Mercado', '🛒', true, ['mercado', 'exito', 'carulla', 'jumbo', 'd1', 'ara', 'olimpica', 'makro', 'euro supermercado', 'supermercado', 'tienda', 'fruver']],
  ['Restaurantes y domicilios', '🍽️', false, ['almuerzo', 'desayuno', 'cena', 'comida', 'restaurante', 'rappi', 'ifood', 'domicilio', 'corrientazo', 'cafe', 'pizza', 'hamburguesa', 'helado', 'onces', 'mecato']],
  ['Transporte', '🚌', true, ['uber', 'didi', 'cabify', 'indrive', 'taxi', 'metro', 'bus', 'pasaje', 'civica', 'gasolina', 'terpel', 'primax', 'esso', 'parqueadero', 'peaje', 'soat', 'tecnomecanica']],
  ['Vivienda', '🏠', true, ['arriendo', 'administracion', 'predial']],
  ['Servicios públicos', '💡', true, ['epm', 'servicios', 'agua', 'energia', 'luz', 'gas natural']],
  ['Celular e internet', '📱', true, ['claro', 'movistar', 'tigo', 'wom', 'une', 'internet', 'plan celular', 'recarga']],
  ['Salud', '🩺', true, ['farmacia', 'drogueria', 'cruz verde', 'pasteur', 'medico', 'eps', 'prepagada', 'odontologo', 'examenes', 'cita']],
  ['Educación', '🎓', true, ['matricula', 'universidad', 'curso', 'libro', 'udemy', 'platzi', 'fotocopias']],
  ['Suscripciones', '🔁', false, ['netflix', 'spotify', 'youtube', 'disney', 'max', 'prime video', 'icloud', 'google one', 'chatgpt', 'claude', 'apple']],
  ['Entretenimiento', '🎬', false, ['cine', 'concierto', 'fiesta', 'rumba', 'bar', 'cerveza', 'trago', 'boletas', 'juego']],
  ['Ropa y compras', '🛍️', false, ['ropa', 'zapatos', 'tenis', 'falabella', 'zara', 'amazon', 'mercado libre', 'temu', 'shein']],
  ['Gimnasio y deporte', '🏋️', false, ['gimnasio', 'gym', 'smart fit', 'bodytech', 'proteina']],
  ['Cuidado personal', '💈', false, ['peluqueria', 'barberia', 'corte', 'cosmeticos']],
  ['Viajes', '✈️', false, ['viaje', 'hotel', 'airbnb', 'vuelo', 'tiquete', 'avianca', 'latam', 'wingo']],
  ['Regalos y donaciones', '🎁', false, ['regalo', 'donacion', 'cumpleanos']],
  ['Mascotas', '🐾', false, ['veterinaria', 'concentrado', 'mascota']],
  ['Bancos e impuestos', '🏦', true, ['cuota de manejo', '4x1000', 'gmf', 'comision', 'intereses', 'impuesto', 'dian', 'renta']],
  ['Otros gastos', '📦', false, []],
];

const INCOME_CATEGORIES: Array<[name: string, icon: string, keywords: string[]]> = [
  ['Salario', '💼', ['salario', 'sueldo', 'nomina', 'quincena']],
  ['Prima y bonificaciones', '🎉', ['prima', 'bonificacion', 'bono', 'cesantias']],
  ['Trabajos extra', '🧑‍💻', ['freelance', 'honorarios', 'proyecto', 'clase particular']],
  ['Rendimientos y dividendos', '📈', ['dividendo', 'rendimientos', 'intereses ganados', 'cajita']],
  ['Reembolsos', '↩️', ['reembolso', 'devolucion', 'me devolvieron']],
  ['Otros ingresos', '💰', []],
];

const DEFAULT_ACCOUNTS = [
  { key: 'bancolombia', name: 'Bancolombia', type: 'checking', institution: 'Bancolombia', currency: 'COP', aliases: ['bancolombia', 'debito', 'ahorros'] },
  { key: 'nu', name: 'Nu', type: 'checking', institution: 'Nu', currency: 'COP', aliases: ['nu', 'cajita'] },
  { key: 'card', name: 'Tarjeta de crédito', type: 'credit_card', institution: null, currency: 'COP', aliases: ['tarjeta', 'tc', 'credito'] },
  { key: 'cash', name: 'Efectivo', type: 'cash', institution: null, currency: 'COP', aliases: ['efectivo', 'cash', 'cajero'] },
  { key: 'hapi', name: 'Hapi', type: 'brokerage', institution: 'Hapi', currency: 'USD', aliases: ['hapi'] },
  { key: 'ibkr', name: 'Interactive Brokers', type: 'brokerage', institution: 'IBKR', currency: 'USD', aliases: ['ibkr', 'interactive'] },
] as const;

export async function seedIfEmpty(db: DbOrTx): Promise<boolean> {
  const existing = await db.select({ id: settings.id }).from(settings).where(eq(settings.id, 1));
  if (existing.length > 0) return false;

  const ids: Record<string, string> = {};
  let order = 0;
  for (const a of DEFAULT_ACCOUNTS) {
    const [row] = await db
      .insert(accounts)
      .values({ name: a.name, type: a.type, institution: a.institution, currency: a.currency, aliases: [...a.aliases], sortOrder: order++ })
      .returning({ id: accounts.id });
    ids[a.key] = row!.id;
  }

  for (const [name, icon, essential, keywords] of EXPENSE_CATEGORIES) {
    const [cat] = await db.insert(categories).values({ name, kind: 'expense', icon, isEssential: essential }).returning({ id: categories.id });
    for (const pattern of keywords) {
      await db.insert(categoryRules).values({ pattern, categoryId: cat!.id, source: 'seed' }).onConflictDoNothing();
    }
  }
  for (const [name, icon, keywords] of INCOME_CATEGORIES) {
    const [cat] = await db.insert(categories).values({ name, kind: 'income', icon }).returning({ id: categories.id });
    for (const pattern of keywords) {
      await db.insert(categoryRules).values({ pattern, categoryId: cat!.id, source: 'seed' }).onConflictDoNothing();
    }
  }

  await db.insert(settings).values({
    id: 1,
    defaultExpenseAccountId: ids.bancolombia,
    defaultIncomeAccountId: ids.bancolombia,
    defaultCardAccountId: ids.card,
    defaultInvestmentAccountId: ids.hapi,
    cashAccountId: ids.cash,
  });
  return true;
}
