# ADR-0004 · Un flow es un objeto de primera clase que lee el registro de subagentes pero no lo posee

> **El inglés es canónico.** Traducción de
> [`doc/adr/0004-flows-and-the-subagent-record.md`](../../adr/0004-flows-and-the-subagent-record.md).

- **Fecha:** 2026-08-01
- **Estado:** Aceptada
- **Reemplaza a:** [ADR-0002](0002-flow-as-first-class-object.md)

## Por qué reemplaza a ADR-0002

ADR-0002 llegó a la conclusión correcta — los flows tienen tablas propias — desde
una premisa falsa. Describía `src/tasks/` como *"una fila de estado con eventos y
sin semántica de ejecución"* y descartaba extenderlo por ser "lo peor de ambos
mundos".

Esa caracterización estaba equivocada. `TaskStore` es el **tracker de ejecución de
subagentes**:

```ts
TASK_STATUSES = ["pending", "in_progress", "completed", "skipped", "failed"]

interface Task      { id; sessionId; originRunId; title; status; createdAt; updatedAt }
interface TaskEvent { id; taskId; runId; type; fromStatus; toStatus; createdAt }

transitionStatus(id, expectedStatus, nextStatus, runId): Promise<Task | null>
```

Un ítem de trabajo persistido con máquina de estados, log completo de
transiciones, y compare-and-swap en cada transición. `claude-harness.ts:612-654`
lo escribe a partir de los eventos `task_started` / `task_updated` /
`task_notification` del CLI de agentes.

Así que la pregunta real — *¿extender `tasks` o construir al lado?* — nunca se
hizo. ADR-0002 respondió una pregunta sobre un muñeco de paja. Este ADR hace la
real, y llega a un destino parecido por razones completamente distintas, que es
exactamente por qué el archivo viejo se reemplaza y no se edita: el razonamiento
es la parte que vale corregir.

## Contexto

Tres propiedades de `tasks`, todas verificadas:

**Es propiedad del harness.** Referencias a `TaskStore` por harness: `pi` 0,
`mock` 0, `claude` 4, `codex` 4, `opencode` 4. En `pi` — el default, y el único
harness que alcanza modelos de OpenRouter — la tabla queda vacía. Un motor de
flows construido sobre `tasks` funcionaría bajo Claude Code y no haría nada bajo
DeepSeek.

**Está atado a un run, y se borra con su sesión.** `Task` lleva `sessionId` y
`originRunId`, y el esquema impone la vida útil en la propia base de datos
(`postgres-task-store.ts`):

```sql
ALTER TABLE tasks ADD CONSTRAINT tasks_session_id_cascade_fkey
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
```

Se borra una sesión y sus tasks se van con ella. Un flow tiene que sobrevivir a
runs, sesiones y reinicios — ese es todo el punto del objeto — así que esta
restricción sola zanja la pregunta. No es una cuestión de gusto sobre dónde van
los registros de trabajo: guardar flows en `tasks` significaría que los flows los
recolecta la limpieza de sesiones.

**No tiene orden, objetivo ni linaje.** Estados y transiciones, pero sin
secuencia, sin condición de éxito, sin puntero al padre. Responde *"¿qué hicieron
los subagentes de este run?"* — una pregunta genuinamente útil, y no la que hace un
flow.

## Decisión

**Un flow es un objeto persistido de primera clase en tablas propias con prefijo
`flow_`. Lee y enlaza filas de `tasks`; nunca las escribe, ni extiende el esquema,
ni depende de que existan.**

Concretamente:

- Un paso de flow que se abre en subagentes sobre un harness con CLI **enlaza**
  los ids de `task` resultantes. Esa es la dimensión de enjambre, ya capturada
  upstream, y duplicarla sería la tercera vez que esta organización reconstruye el
  tracking de subagentes.
- El mismo paso en `pi` no enlaza nada y **debe completar igual**. La ausencia de
  filas de task es un estado normal, no degradado.
- Las tablas `flow_` llevan lo que `tasks` no puede: objetivo, orden, linaje
  (`forkedFrom { flowId, atStep }`), artefactos, y una vida independiente de
  cualquier run.

**Se conserva de ADR-0002**, sigue siendo correcto y sigue cargando peso:

- Cada intento de un paso se guarda (`attempts[]`). El fracaso es historia, no
  sobrescritura — la lección de `skill-store.ts:142` (`version += 1`, sin
  contenido previo, así que nada se puede diffear ni revertir).
- `forkedFrom` se registra desde el primer commit, no se agrega después. El fork
  de sesión de upstream no persiste padre (`app-sessions.ts:392` sólo escribe una
  fila de auditoría) y por eso las sesiones no se pueden diffear. No lo repetimos.
- `waiting` y `blocked` siguen siendo estados distintos.
- Ninguna tabla de upstream se altera.

**Agregado acá:** un flow reutiliza `src/core/turn-resume.ts` para recuperación
ante caída dentro del intento de un paso. ADR-0002 se escribió creyendo que no
existía reanudación, así que implicaba construirla. Existe; construimos la capa de
arriba.

## Consecuencias

**Costo.** Algo de duplicación en los bordes: un paso y una task tienen ambos un
estado. Aceptado — responden preguntas distintas sobre vidas distintas, y
fusionarlos acoplaría el motor de flows al harness.

**Ganancia.** `ai-flows` es portable entre los cinco harness. Dado que el harness
de modelo barato y los de subagentes son conjuntos disjuntos, la portabilidad no
es un detalle — es la diferencia entre un diseño que corre sobre lo que podemos
pagar y uno que no.

**Riesgo.** "Enlazar pero no poseer" es un límite que se erosiona bajo presión. La
primera vez que un flow necesite *escribir* una fila de task es la señal de que
hay que revisar este ADR, no de que hay que doblar la regla en silencio.

**Test que lo impone.** La suite de flows corre contra `mock` — que, como `pi`, no
tiene `TaskStore`. Si un flow alguna vez requiere filas de task para completar,
esa suite falla. El límite lo chequea CI y no la buena intención.

## Alternativas rechazadas

**Extender `tasks` hacia el motor de flows.** La pregunta que ADR-0002 debería
haber hecho. Rechazada por portabilidad entre harness: el store lo escriben tres
de cinco harness, y los dos que lo saltean son los dos sobre los que corremos. Un
motor de trabajo que está vacío en su propia configuración por defecto no es un
motor.

**Un paso de flow *es* una task.** Más limpio en el papel, y equivocado en la vida
útil: las tasks mueren con su run. Además implicaría escribir en un store que el
harness considera propio, lo que se rompe en el próximo `git subtree pull` que lo
toque.

**Ignorar `tasks` por completo** (el efecto práctico de ADR-0002). Rechazada: es
la dimensión de enjambre, ya persistida, con un log de eventos que si no
reconstruiríamos. Leerla es gratis; no leerla es una tercera reimplementación.
