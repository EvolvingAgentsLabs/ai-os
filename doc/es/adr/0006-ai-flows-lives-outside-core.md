# ADR-0006 · `ai-flows` se construye contra el seam HTTP firmado, no adentro del core

> **El inglés es canónico.** Traducción de
> [`doc/adr/0006-ai-flows-lives-outside-core.md`](../../adr/0006-ai-flows-lives-outside-core.md).

- **Fecha:** 2026-08-02
- **Estado:** Aceptada

## Contexto

[01-architecture](../01-architecture.md) pone a `ai-flows` en su tabla de
divergencia como _"nuevo servicio adentro del core + store nuevo + rutas de API
nuevas"_, costo **Alto**, y lo llama _"el único que diverge de verdad"_. Esa
línea carga peso mucho más allá de este pilar: es la razón declarada de que el
fork exista ([ADR-0001](0001-fork-vs-dependency.md)), y por la que se decía que
`ai-flows` carga la deuda de mantenimiento de todo el proyecto.

El mismo documento enuncia la regla que la contradice:

> **todo lo que _se pueda_ construir contra un seam público se construye contra
> un seam público, aunque editar el core sea más rápido. Cada línea agregada a
> `ai-base/src/` es una línea que mergeamos a mano para siempre.**

Nadie había chequeado cuál de las dos aplica, porque chequearlo exige leer la
tabla de rutas y no la arquitectura. Leída en `7f2c916`
(`src/api/routes/turns.ts:154-161`), la superficie pública es **[read]**:

| Ruta                          | Auth     | Para qué la necesita un flow                                       |
| ----------------------------- | -------- | ------------------------------------------------------------------ |
| `POST /v1/turns`              | `source` | Correr un paso. Con `async`, devuelve `{ status: "queued", runId }` |
| `GET /v1/runs/:id`            | `source` | Pollear ese run hasta un estado terminal y leer su resultado        |
| `POST /v1/runs/:id/signal`    | `source` | `steer` o `abort` sobre un paso en vuelo                            |
| `GET /v1/runs?threadRef=`     | `source` | Encontrar el run vivo de un hilo                                    |

`auth: "source"` es el ingreso firmado con HMAC que M1 ejercitó contra una
instancia corriendo **[ran]** — `v0:{segundos-unix}:{MÉTODO}\n{path}\n{body}`,
ventana de replay de cinco minutos.

**Eso es crear, avanzar, inspeccionar, steerear y abortar — todo
[M2](../08-roadmap.md).** No hace falta modificar el core para construir el
primer flow.

## Decisión

**`ai-flows` es un paquete propio, Apache 2.0, en `/ai-flows`. Tiene sus propias
tablas `flow_` y su propio handle de base, y avanza un paso llamando a la API
HTTP firmada. No importa nada de `ai-base`.**

Consecuencias directas:

- Al `Harness` se llega _a través_ de la API, nunca se construye. La regla "una
  llamada al modelo pasa por `Harness`, nunca por un SDK del proveedor" se
  cumple no haciendo ninguna llamada al modelo: la hace el core.
- La recuperación ante caída dentro de un intento **no** se reimplementa ni se
  importa. `src/core/turn-resume.ts` corre detrás del seam, sobre el run que el
  flow encoló; el flow observa el estado terminal del run y mantiene sus propios
  `attempts[]`. El entregable de M2 decía "reutilizar, no reconstruir"; el seam
  hace que reutilizar sea la única opción, que es más fuerte que una regla.
- `tasks` queda intacto por construcción y no por disciplina
  ([ADR-0004](0004-flows-and-the-subagent-record.md)): no hay ruta hacia ahí.

## Alternativas rechazadas

**Un servicio adentro de `ai-base/src/flows/`** — el plan de registro, y lo que
`AI-OS-PATCHES.md` listaba como "planeado, todavía no hecho". Rechazado por la
regla de diseño del propio proyecto, ahora que se sabe que el seam alcanza.
Habría dejado el subsistema más grande del proyecto en MIT y no en Apache 2.0
([06](../06-licensing.md)), mergeado a mano para siempre, y habría clausurado la
reevaluación de [ADR-0001](0001-fork-vs-dependency.md) que el roadmap agenda
exactamente en este milestone.

**Un plugin bajo `deploy/layers/evolvingagents/`.** Rechazado: ese directorio es
material de deployment de la organización, nunca se upstreamea ni se publica, y
`ai-flows` es el pilar por el que existe el repositorio.

**Importar `ai-base` como librería desde `/ai-flows`.** Rechazado: es la opción
in-core con pasos extra. Lo que crea la deuda de merge es el grafo de imports, no
el directorio.

## Consecuencias

**Ganancia — el ítem de mayor riesgo del proyecto deja de ser de alto riesgo.**
El `Alto` de `ai-flows` en la tabla de divergencia pasa a `Bajo`, y la
divergencia total sigue siendo los dos archivos registrados. Este ADR reemplaza
esa fila de [01-architecture](../01-architecture.md); el documento se actualiza
apuntando acá, no se reescribe en silencio.

**Costo — el motor de flows es un cliente, y un cliente ve menos.** Obtiene lo
que la API devuelve, no el estado interno del core. Para M2 alcanza y está
verificado. Puede no alcanzar para el canvas vivo de `ai-ui`, ni para el
reconciliador del merge.

**Riesgo, y la señal a vigilar:** _la primera vez que `ai-flows` necesite de
verdad algo que la API no expone, lo correcto es proponer esa ruta upstream, no
importar el core._ Si la propuesta se rechaza y la necesidad es real, este ADR se
revisa. Meter mano en `ai-base/src/` sin esa secuencia es la erosión que este ADR
existe para evitar — la misma forma que el "leer pero no poseer" de ADR-0004.

**También necesario:** el cliente de requests firmadas pasa a ser código
first-party de ai-os sin equivalente upstream que heredar. Es chico — HMAC sobre
un string canónico — y es la única plomería que compra esta decisión.
