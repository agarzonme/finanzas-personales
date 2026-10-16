/** Minúsculas, sin tildes ni espacios repetidos: "Éxito  Laureles" → "exito laureles". */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function capitalize(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

/** Clave para aprender reglas: hasta 3 palabras, sin números. "Rappi pedido 4521" → "rappi pedido". */
export function ruleKey(description: string): string {
  return normalize(description)
    .replace(/[^a-z\s]/g, ' ')
    .split(' ')
    .filter((w) => w.length >= 3)
    .slice(0, 3)
    .join(' ')
    .trim();
}
