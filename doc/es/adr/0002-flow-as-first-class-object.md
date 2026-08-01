# ADR-0002 · El flow es un objeto persistido de primera clase, no un patrón de prompt

> **El inglés es canónico.** Traducción de
> [`doc/adr/0002-flow-as-first-class-object.md`](../../adr/0002-flow-as-first-class-object.md).

- **Fecha:** 2026-08-01
- **Estado:** **Reemplazada** por [ADR-0004](0004-flows-and-the-subagent-record.md) (2026-08-01)

> **Reemplazada el mismo día, y conservada sin editar a propósito.**
>
> La conclusión de abajo — un flow es un objeto persistido de primera clase en
> tablas propias — sobrevive. El razonamiento no. Este ADR describe `src/tasks/`
> como *"una fila de estado con eventos y sin semántica de ejecución"* y rechaza
> extenderlo sobre esa base. Es falso: `TaskStore` es el tracker de ejecución de
> subagentes, con máquina de estados, log de transiciones y compare-and-swap. La
> pregunta real nunca se hizo acá.
>
> Queda legible porque una decisión tomada desde una premisa equivocada es el tipo
> de registro más útil que puede guardar esta organización — y porque editarlo en
> silencio es exactamente el hábito que prohíbe `doc/README.md`.
>
> Leer [ADR-0004](0004-flows-and-the-subagent-record.md) en su lugar.

## Contexto

"Trabajo multi-paso de agentes" se implementa habitualmente como un **patrón de
prompt**: se le dice al modelo que planifique, mantiene su plan en contexto y lo
va recorriendo. Barato, sin esquema, sin migraciones — y es lo que hace casi todo
producto de agentes.

Falla de tres formas que importan a nivel de sistema operativo:

1. El plan vive en la ventana de contexto, así que la compactación
   (`ai-base/src/harness/context-compaction.ts`) lo degrada a un resumen.
2. No es direccionable. Nada fuera de la conversación puede preguntar cuál es el
   estado, y ningún segundo agente ni superficie puede sumarse.
3. No tiene linaje. Dos intentos no se pueden comparar porque ninguno es un objeto.

Las primitivas propias de QM están un nivel más abajo: `runs` (un turno), `tasks`
(una fila de estado), `triggers`/`cron` (formas de arrancar un turno). Ninguna es
una unidad de trabajo.

## Decisión

**Un flow es un objeto persistido en base de datos** con identidad, objetivo,
estado, pasos ordenados, artefactos y linaje — en tablas nuevas con prefijo
`flow_`, direccionable por la API independientemente de cualquier sesión.

**Corolarios:**

- Cada intento de un paso se conserva (`attempts[]`). El fracaso es historia, no
  sobrescritura. Es la respuesta directa a `skill-store.ts:142` (`version += 1`
  sin contenido previo — un contador que no se puede diffear ni revertir).
- `forkedFrom { flowId, atStep }` se registra desde el primer commit, no se agrega
  después. El fork de sesión de upstream no persiste un padre
  (`app-sessions.ts:392` sólo escribe una fila de auditoría), y ese es justamente
  el hueco que vuelve imposible diffear sesiones. No lo reproducimos.
- `waiting` y `blocked` son estados distintos — el sistema tiene que poder
  distinguir "funcionando como se diseñó" de "trabado desde el martes".

## Consecuencias

**Costo:** esquema, migraciones, una superficie de API, y una porción real de
modificación del core — es la decisión que vuelve necesaria la carga de merge de
ADR-0001.

**Ganancia:** el flow sobrevive a la compactación y al reinicio; otros agentes y
superficies pueden sumarse; `ai-ui` tiene algo que proyectar; `ai-storage` tiene
un scope al que colgar memoria de nivel flow; diff y merge se vuelven posibles.

**Riesgo:** sobre-modelar. Mitigado entregando en M2 sólo la forma `Open` — la que
es apenas una sesión con objetivo, linaje y memoria — y agregando estructura sólo
cuando el trabajo real la exija.

## Alternativas rechazadas

**Patrón de prompt.** Falla en los tres puntos de arriba; no queda nada que
proyectar ni diffear.

**Extender `tasks`.** `src/tasks/` es una fila de estado con eventos y sin
semántica de ejecución. Convertirla en un motor de flows implica reescribirla
heredando su esquema — lo peor de ambos mundos. Tablas nuevas, y esa se deja en paz.

**Un flow es una sesión con metadatos.** Tentador y equivocado: suelda la unidad
de trabajo a una conversación, cuando el punto es que el trabajo abarca sesiones,
agentes y superficies. Un flow *referencia* sesiones.
