/**
 * Categorización automática SIN IA: reglas "si la descripción contiene X → categoría Y".
 * Vienen más de 150 reglas para Colombia y la app aprende una nueva cada vez que corriges una categoría.
 */
import { eq, sql } from 'drizzle-orm';
import type { DbOrTx } from '../db/connect';
import { categories, categoryRules } from '../db/schema';
import type { CategoryKind } from '@/lib/constants';
import { normalize, ruleKey } from '@/lib/text';

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function suggestCategory(db: DbOrTx, text: string, kind: CategoryKind): Promise<string | null> {
  const haystack = ` ${normalize(text)} `;
  const rules = await db
    .select({ id: categoryRules.id, pattern: categoryRules.pattern, categoryId: categoryRules.categoryId, kind: categories.kind, source: categoryRules.source })
    .from(categoryRules)
    .innerJoin(categories, eq(categories.id, categoryRules.categoryId))
    .where(eq(categories.archived, false));

  let best: (typeof rules)[number] | undefined;
  for (const r of rules) {
    if (r.kind !== kind) continue;
    if (!new RegExp(`(^|[^a-z0-9])${escape(r.pattern)}([^a-z0-9]|$)`).test(haystack)) continue;
    // Gana la regla más específica (más larga); a igual longitud, la aprendida de ti.
    if (!best || r.pattern.length > best.pattern.length || (r.pattern.length === best.pattern.length && r.source !== 'seed')) best = r;
  }
  if (!best) return null;
  await db.update(categoryRules).set({ hits: sql`${categoryRules.hits} + 1` }).where(eq(categoryRules.id, best.id));
  return best.categoryId;
}

/** Aprende de una corrección: "Rappi pedido 4521" → regla "rappi pedido" → categoría elegida. */
export async function learnRule(db: DbOrTx, description: string, categoryId: string) {
  const pattern = ruleKey(description);
  if (pattern.length < 3) return;
  await db
    .insert(categoryRules)
    .values({ pattern, categoryId, source: 'learned' })
    .onConflictDoUpdate({ target: categoryRules.pattern, set: { categoryId, source: 'learned' } });
}
