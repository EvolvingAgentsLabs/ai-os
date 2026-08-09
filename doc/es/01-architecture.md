# 01 · Arquitectura

<img src="../assets/01-architecture.jpg" alt="" width="100%">

<sub>Cuatro capas, unidas en unos pocos puntos precisos.</sub>

> **Referencia.** El sistema tal como corre, y dónde se enganchan las partes que no.


> **El inglés es canónico.** Traducción de [`doc/01-architecture.md`](../01-architecture.md).

## El stack

```
┌──────────────────────────────────────────────────────────────┐
│  ai-ui          canvas inteligente · interfaz a nivel de SO   │
│                 (plugin HTTP sobre el core, como web-ui)      │
├──────────────────────────────────────────────────────────────┤
│  ai-flows       flows · pasos · reanudación · fork y merge    │
│                 (servicio nuevo en el core + store de flows)  │
├──────────────────────────────────────────────────────────────┤
│  ai-storage     memoria: sistema / usuario / proyecto / flow  │
│                 (implementación de MemoryService + scopes)    │
├──────────────────────────────────────────────────────────────┤
│  ai-base (QM)   harness · scopes · sandbox · identidad ·      │
│                 política · auditoría · superficies · deploy   │
├──────────────────────────────────────────────────────────────┤
│  Postgres · Node 24 · Fastify · sandboxes por scope           │
└──────────────────────────────────────────────────────────────┘
```

Cada pilar se engancha en un tipo *distinto* de seam, y la diferencia importa para
cuán caro es construir y mantener cada uno contra un upstream en movimiento.

## Dónde se engancha cada pilar

| Pilar | Enganche | Costo de la deriva de upstream |
|---|---|---|
| `ai-storage` | Implementa el `MemoryService` existente de QM, registrado en `src/wiring.ts` | **Bajo** — interfaz estable y angosta |
| `ai-ui` | Plugin HTTP sobre la API del core, usando el contrato del chassis | **Bajo** — los plugins nunca importan el core (impuesto por upstream) |
| `ai-flows` | Servicio nuevo dentro del core + store nuevo + rutas nuevas | **Alto** — este es el que genuinamente diverge |
| `ai-base` | Es el upstream | n/a |

Esa tabla es la decisión de arquitectura real. Dos de los tres pilares se pueden
construir casi por completo *sin* forkear nada, porque los seams de extensión de
QM son reales y fueron diseñados para esto. Sólo `ai-flows` exige cortar dentro
del core — por eso existe el fork ([ADR-0001](adr/0001-fork-vs-dependency.md)) y
por eso `ai-flows` carga la deuda de mantenimiento de todo el proyecto.

**Regla de diseño que sale de esto:** todo lo que *pueda* construirse contra un
seam público se construye contra un seam público, incluso cuando editar el core
sea más rápido. Cada línea agregada a `ai-base/src/` es una línea que mergeamos a
mano para siempre.

## Los tres seams, verificados

Leídos en el commit `7f2c916` de `ai-base`.

### 1. `MemoryService` — el seam de storage

`ai-base/src/memory/memory-service.ts:28`

```ts
export interface MemoryService {
  recall(scopeId: ScopeId): Promise<string>;
  capture(scopeId: ScopeId, facts: string[], at: number, author?: string): Promise<number>;
  query(scopeId: ScopeId, q: string, limit?: number): Promise<string[]>;
  read(scopeId: ScopeId): Promise<string>;
  replace(scopeId: ScopeId, content: string, author?: string): Promise<void>;
  readHead?(scopeId: ScopeId): Promise<MemoryHead>;
  replaceIfRevision?(scopeId, content, revision, author?): Promise<boolean>;
  history?(scopeId: ScopeId, limit?: number): Promise<MemoryRevision[]>;
  restore?(scopeId, revision, expectedRevision, author?): Promise<boolean>;
  updatedAt?(scopeId: ScopeId): Promise<number | undefined>;
  metadata?(): Promise<Map<ScopeId, { bytes: number; updatedAt?: number }>>;
}
```

Cinco métodos requeridos, indexados por scope, más una historia de revisiones
opcional con concurrencia optimista (tokens sha256). `ai-storage` implementa esto.
Dos implementaciones existentes para estudiar: `memory-service.ts` (respaldada por
workspace) y `postgres-memory-service.ts`.

Junto a eso, `src/memory/strategy.ts:14` define `MemoryStrategy` —
`onTurnEnd` / `maintain` / `promptLines` — con cuatro estrategias incluidas
(`per-turn`, `scratch-promote`, `agent-only`, `consolidation`). La consolidación
entre niveles es una estrategia, no un subsistema nuevo.

### 2. El chassis de plugins — el seam de UI

`ai-base/plugins/chassis/package.json` declara el contrato en su propia
descripción: *"firma de source-auth, los helpers firmados de cliente del core,
helpers chicos de request/response de `node:http`, helpers de error, y el bloque
común de env `CORE_*`… nunca importa el core."*

Cuatro plugins corren contra él: `web-ui`, `admin`, `portal`, `auth`. `ai-ui` es
un quinto. El `web-ui` existente es Vite + Lit + `dockview-core` +
`@earendil-works/pi-web-ui` — `dockview-core` es un motor de layout de paneles
acoplables, que es lo más cercano a un canvas que tiene upstream y un punto de
partida razonable en vez de un rival.

### 3. `Harness` — el seam de modelos

`ai-base/src/harness/harness.ts:167`. `profile` / `turns` / `models` / `tools`,
construido mediante `defineHarness()`. Seis implementaciones: `claude`, `codex`,
`opencode`, `pi`, `mock`, `replay`.

ai-os **no** agrega un harness. Este seam se lista porque restringe a `ai-flows`:
un paso de flow tiene que poder expresarse como `HarnessTurnInput` y su resultado
leerse de un `HarnessTurnResult`, o el motor de flows termina soldado a un
proveedor de modelos — que es justo lo que QM evitó deliberadamente.

## Dónde ai-flows corta el core

No hay motor de flows para extender. Verificado: `src/processes/` es *reaping de
procesos del SO dentro del sandbox* (`process-reaper.ts` manda TERM y después
KILL), no workflow. Lo que existe está una capa más abajo:

| Subsistema | Qué hace | Por qué no es un motor de flows |
|---|---|---|
| `src/runs/` | Ejecuta un turno; run store, señales, actividad, ledger de tools | Acotado a un solo turno |
| `src/tasks/` | **Registra ejecuciones de subagentes** — estados, log de eventos, transiciones con CAS | Propiedad del harness, atado a un `originRunId`, vacío en la mitad de los harness. Ver abajo |
| `src/triggers/` | Triggers de webhook / monitor / consentimiento | Dispara turnos; no los secuencia |
| `src/monitors/` | Broker, poller y store de watches (489 líneas) | Se dispara ante cambio externo; no lleva el trabajo adelante |
| `src/cron/` | Disparo agendado | Dispara turnos por reloj |
| `src/sessions/` | Persistencia de conversación, entradas, leases, fork | Log de eventos de sólo-agregado |
| `src/core/turn-resume.ts` | **Reanuda un turno interrumpido** — `findTrailingPartialTurn`, conteo de intentos, acción de auditoría `turn.resume` | Recupera *un turno* tras una caída; no lleva nada entre turnos |

Así que `ai-flows` es construcción genuinamente nueva, no un re-skin — y tiene que
*componer* estas piezas en vez de reemplazarlas: el paso de un flow termina siendo
un run, un flow puede despertarse por un trigger, un monitor o un cron, y la
conversación de un flow es una sesión.

**Dos correcciones que vale decir sin vueltas**, porque la primera versión de este
documento se equivocó en ambas y una de ellas moldeó un ADR:

- `src/tasks/` no es una lista de pendientes. Es el **tracker de ejecución de
  subagentes**: `pending | in_progress | completed | skipped | failed`, un log
  `TaskEvent` con `fromStatus`/`toStatus`, y `transitionStatus()` con
  compare-and-swap. El harness lo escribe a partir de los eventos
  `task_started` / `task_updated` / `task_notification` del CLI de agentes. Esta es
  la dimensión de enjambre, y ya existe. Lo que cambia para nosotros es
  [ADR-0004](adr/0004-flows-and-the-subagent-record.md).
- QM **sí** reanuda. No trabajo multi-turno — pero un turno interrumpido a mitad
  de vuelo se recupera, con los intentos contados y la reanudación auditada. Decir
  "nada reanuda" era falso.

## La matriz de capacidades por harness

Esta es la restricción que más moldea a `ai-flows`, y es invisible hasta que lo
corrés. Las capacidades **no son uniformes entre harness**:

| Harness | Delegación | Agentes definidos por | Filas `tasks` | Modelos de OpenRouter |
|---|:--:|---|:--:|:--:|
| `pi` (default) | **sí** | **el workspace** (`agents/*.md`) | no | **sí** |
| `mock` | no | — | no | sí |
| `claude` | sí | el harness (3 fijos) | sí | no |
| `codex` | sí | la CLI | sí | no |
| `opencode` | sí | la CLI | sí | no |

Columna de delegación: `pi-tools.ts:2415` define una tool `delegate`, admitida a
la lista de tools sólo cuando el harness provee `runChild`, cosa que
`pi-harness.ts:1345` hace. Columna `tasks`: referencias a `TaskStore` por harness
— `pi` y `mock` tienen cero; `claude` y `codex` tienen tres cada uno, `opencode`
dos. Columna derecha: `selectableCatalogForHarness`
(`model/model-catalog.ts:109`) sólo admite `provider === "openrouter"` para `pi` y
`mock`. **[read]**

**Corregido el 2026-08-06.** Esta tabla antes leía "Subagentes + `tasks`" como una
sola columna y concluía *"las dos columnas nunca se solapan — un modelo barato o
no-Anthropic y el fan-out con subagentes no se pueden tener al mismo tiempo"*. Esa
conclusión ya no es cierta, y sostenía a
[03-ai-flows § portabilidad](03-ai-flows.md#la-restricción-de-portabilidad) y a
[08-roadmap](08-roadmap.md). El commit de upstream que la rompió se llama
`Agents as markdown, and subagents on the harness that reaches cheap models`.
Confundir delegación con `tasks` es lo que dejó que una columna se pudriera sin
que nadie lo viera; ahora son columnas separadas porque son capacidades separadas.

Lo que sobrevive de la afirmación vieja: **`pi` delega pero no registra nada.** No
escribe filas en `tasks`, así que en el harness por defecto la ejecución de un
subagente no deja rastro durable — sólo el reporte que el hijo devuelve, plegado
en el turno del padre.

**La columna que más importa para cualquier cosa por encima del turno es la
tercera.** En `pi`, un agente es un archivo markdown en el workspace del propio
scope — `agents/<name>.md`, con frontmatter declarando `description` y `tools`, el
cuerpo como instrucciones, parseado por `parseAgentDefinition`
(`agents/agent-definition.ts`). `pi-tools.ts` es el **único** llamador de ese
parser en todo el árbol **[read]**: en `claude` los tres agentes hijos están
hardcodeados en `claude-harness.ts:341` (`research`, `code`, `consult`), y `codex`
/ `opencode` delegan dentro de su propia CLI. Así que un workspace que define sus
propios agentes como archivos es un hecho de `pi`, no de la base — ver
[12-conformation](12-conformation.md#la-carpeta-inerte).

Todo harness que delega acota el árbol a un nivel. En `pi` el mecanismo es
explícito y es una línea: el conjunto de tools del hijo se construye sin
`runChild`, "que es lo que le niega `delegate`" (`pi-harness.ts:1313-1318`), y
`CHILD_POLICY` lo dice en prosa — *"You cannot delegate further."*

## El hueco de linaje, y por qué le pertenece a ai-os

`forkSession` (`src/api/app-sessions.ts:392`) copia entradas hasta `upToSeq` en
una sesión nueva. Buscando en todo el árbol `forkedFrom`, `parentSessionId` y
`upToSeq` sólo aparecen los puntos de llamada del fork y una fila de auditoría
(`action: "session.fork"`). **Nada persiste el padre.**

La misma forma aparece en skills: `src/skills/skill-store.ts:142` hace
`s.version += 1` al actualizar — un contador monótono sin retener la versión
previa, así que no hay diff ni rollback.

Ambos son la misma idea faltante: *bifurcar sin linaje*. ai-os necesita linaje
para los flows de todos modos (bifurcar un flow, comparar dos intentos, mergear el
bueno). La consecuencia de diseño está en [03-ai-flows](03-ai-flows.md): **el
linaje de flows se construye en `ai-flows` como propiedad de primera clase, y el
arreglo a nivel de sesión se ofrece upstream como una propuesta chica, separada y
escrita a mano** — registrar `forkedFrom: { sessionId, upToSeq }` — en vez de
colarlo como parte de nuestro fork.

## Propiedad de los datos

| Datos | Dueño | Store |
|---|---|---|
| Identidad, scopes, grants, auditoría | ai-base | Postgres (esquema de upstream) |
| Sesiones, entradas, runs | ai-base | Postgres (esquema de upstream) |
| Skills, packs, bundles | ai-base | Postgres (esquema de upstream) |
| **Flows, pasos, linaje de flows** | ai-flows | Postgres, **tablas nuevas, prefijo `flow_`** |
| **Memoria en cuatro niveles** | ai-storage | Postgres, tablas nuevas, detrás de `MemoryService` |
| Layout del canvas, estado de vista | ai-ui | Por scope, vía la API del core |

Las tablas nuevas llevan prefijo y nunca alteran tablas de upstream. Una migración
que toque una tabla de upstream es un conflicto de merge esperando en cada pull
futuro, y se trata como una falla de diseño y no como un atajo.

## Preguntas abiertas

Sin resolver y deliberadamente sin responder todavía, porque contestarlas antes de
que corra el primer flow sería adivinar:

1. **¿Un paso de flow es un turno, o puede ser una función común?** Hacer que cada
   paso sea un turno de modelo es caro y a veces absurdo; hacer que los pasos sean
   código arbitrario convierte el motor de flows en un runtime de workflows
   general, que es un proyecto mucho más grande.
2. **¿Un flow posee una sesión, o referencia varias?** Poseer una es más simple;
   referenciar varias es cómo se ve realmente el trabajo multi-agente.
3. **¿Qué es un conflicto cuando dos flows bifurcados no coinciden?** Dos archivos
   editados es fácil. Dos conclusiones sobre el mismo archivo es el caso
   interesante y el que ninguna herramienta existente responde.
4. **¿La memoria por scopes le gana a un archivo plano?** Abierto, y el diseño
   tiene que sobrevivir a que la respuesta sea *no* — ya fue *no* antes, sobre una
   afirmación muy cercana.
