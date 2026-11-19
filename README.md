# Mis finanzas

App personal para llevar tus cuentas: gastos, ingresos, tarjetas, presupuestos, metas, deudas, inversiones y patrimonio neto. Sin conexiones a bancos ni brokers: tú registras, la app calcula. Corre gratis en tu computador o, si quieres verla desde el celular en cualquier parte, en Vercel + Turso (también gratis).

## Qué hace

- **Registro rápido en español:** escribe «Gasté 25.000 en almuerzo con Nu», «Pagué 120.000 de la tarjeta», «Recibí salario por 4.000.000», «Compré 2 VOO a 510 USD» o «Ahorré 300.000 para el viaje». Entiende 25k, 25 mil, 1,5 millones, 2 palos, USD, «ayer», «el 3/10».
- **Categorías automáticas sin IA:** más de 150 reglas pensadas para Colombia (Éxito, Rappi, EPM, Claro, Uber…) y aprende una regla nueva cada vez que corriges una categoría.
- **Cuentas con saldo real:** Bancolombia, Nu, tarjeta de crédito, efectivo, Hapi, IBKR ya vienen creadas (renómbralas o archívalas). Pagar la tarjeta o fondear el broker es una transferencia: no infla tus gastos.
- **Presupuestos por categoría** con alertas al 80 % y al pasarte.
- **Metas** con fecha estimada de cumplimiento y aporte mensual necesario (tasas en % EA).
- **Deudas** con fecha de pago final, intereses totales y cuánto te ahorras pagando 25 % más.
- **Inversiones** con costo promedio, ganancia sin realizar, distribución por tipo de activo y dividendos. Precios y TRM se actualizan a mano.
- **Resumen** con patrimonio neto, flujo de caja de 12 meses, gasto por categoría y evolución del patrimonio.
- **Respaldo** en JSON (para restaurar o pasar del computador a la nube) y CSV para Excel o Power BI.

## Opción A: en tu computador (recomendada para empezar)

Necesitas [Node.js 22 LTS](https://nodejs.org). Nada más: la base de datos es un archivo.

```bash
npm install
npm run dev
```

Abre <http://localhost:3000>. La primera vez se crea `data/finanzas.db` con las categorías y cuentas iniciales.

Para usarla a diario (más rápida que el modo desarrollo):

```bash
npm run build
npm start
```

**Desde el celular en tu casa:** corre `npm run start:lan` (o `npm run dev:lan`) y abre `http://IP-DE-TU-PC:3000` desde el celular conectado al mismo wifi. En Windows ves la IP con `ipconfig` (Dirección IPv4). Si otras personas usan tu wifi, ponle contraseña (sección «Contraseña»).

**Tus datos** viven en `data/finanzas.db`. Descarga un respaldo cada mes desde Ajustes y guárdalo fuera del computador. No pongas la carpeta `data` dentro de OneDrive o Drive mientras la app está abierta: la sincronización puede dañar el archivo.

## Opción B: en internet gratis (Vercel + Turso)

1. **Base de datos.** Crea una cuenta en [turso.tech](https://turso.tech) (plan gratis, sin tarjeta), crea una base llamada `mis-finanzas`, copia su URL (`libsql://…turso.io`) y genera un token.
2. **Contraseña.** En tu computador corre `npm run hash-password -- "una-clave-larga"` y guarda las dos líneas que imprime.
3. **Código.** Sube tu copia a GitHub. Puede ser pública: el `.gitignore` deja fuera `data/`, los respaldos y el `.env`, así que tus datos y claves nunca se suben.
4. **Vercel.** En [vercel.com](https://vercel.com) importa el repositorio y agrega estas variables de entorno antes del primer deploy:
   - `DATABASE_URL` = la URL de Turso
   - `DATABASE_AUTH_TOKEN` = el token de Turso
   - `APP_PASSWORD_HASH` y `SESSION_SECRET` = las dos líneas del paso 2
5. Deploy. El build crea las tablas en Turso y carga los datos iniciales. Abre la URL, entra con tu clave y, en el celular, usa «Agregar a la pantalla de inicio».

**Pasar tus datos del computador a la nube:** en tu app local ve a Ajustes → Descargar respaldo completo. En la app de Vercel ve a Ajustes → Restaurar desde un respaldo. En Vercel el archivo puede pesar hasta 4,5 MB (decenas de miles de movimientos).

En internet la app exige contraseña: si falta `APP_PASSWORD_HASH`, se niega a abrir.

## Contraseña (opcional en local)

```bash
npm run hash-password -- "una-clave-larga"
```

Copia las dos líneas que imprime en un archivo `.env` (usa `.env.example` como guía) y reinicia la app. Cinco intentos fallidos bloquean el acceso por 15 minutos.

## Primeros pasos dentro de la app

1. **Cuentas:** abre cada cuenta y usa «Ajustar al saldo real» con el saldo que ves en el banco. En la tarjeta escribe lo que debes.
2. **Ajustes:** registra la TRM del día (pesos por dólar) para que Hapi e IBKR sumen al patrimonio.
3. **Inversiones:** registra tus posiciones actuales como compras (cantidad y precio promedio). Desde ahí, actualiza el precio cuando revises tu portafolio.
4. **Presupuestos y metas:** define cuánto quieres gastar por categoría y crea tu fondo de emergencia.
5. Desde ese momento, anota cada movimiento con el registro rápido.

## Estructura del código

```
src/
  app/                    Páginas (Next.js App Router)
    (app)/                Resumen, movimientos, cuentas, presupuestos, metas, deudas, inversiones, ajustes
    api/export/           Descarga de respaldo JSON y CSV
    login/                Entrada con contraseña
  components/             Formularios, gráficas y piezas de interfaz
  lib/                    Lógica pura y probada: montos, fechas, registro rápido, proyecciones
  server/
    db/                   Esquema (Drizzle + SQLite/Turso), conexión y datos iniciales
    services/             Reglas del negocio: libro mayor, saldos, reportes, metas, deudas, inversiones
    actions/              Acciones de los formularios (validan la sesión y los datos)
  proxy.ts                Redirige a /login si hay contraseña y no hay sesión
drizzle/                  Migraciones SQL
scripts/                  setup-db (migra y carga datos iniciales) y hash-password
test/                     Pruebas (npm test)
```

**Cómo se guardan los datos.** El dinero se guarda en enteros de centavos (exacto). Cada movimiento genera asientos con signo en las cuentas que toca: el saldo de una cuenta es su saldo inicial más la suma de sus asientos. Los montos en dólares se convierten a pesos con la TRM de la fecha.

## Comandos

| Comando | Para qué |
| --- | --- |
| `npm run dev` | Desarrollo en <http://localhost:3000> |
| `npm run build` y `npm start` | Uso diario, más rápido |
| `npm run start:lan` | Abrirla desde el celular en tu wifi |
| `npm test` | Corre las 49 pruebas |
| `npm run typecheck` | Revisa tipos de TypeScript |
| `npm run db:generate` | Crea una migración si cambias `src/server/db/schema.ts` |
| `npm run hash-password -- "clave"` | Genera la contraseña y el secreto de sesión |

`npm audit` reporta avisos moderados en `drizzle-kit` (solo herramienta de desarrollo, no llega a la app publicada).
