# 03 · ai-flows

<img src="../assets/03-ai-flows.jpg" alt="" width="100%">

<sub>Seis formas. La última no termina nunca, a propósito.</sub>


> **El inglés es canónico.** Traducción de [`doc/03-ai-flows.md`](../03-ai-flows.md).
>
> **Estado: especificado, no implementado.**

## El problema

El objeto de primer nivel de QM es la sesión — una conversación. Las
conversaciones son la unidad equivocada para el trabajo, de cuatro formas
concretas:

1. **Sin objetivo declarado.** Una sesión es lo que se haya dicho en ella. Nada
   establece qué significa "listo", así que nada puede decirte si pasó.
2. **Sin supervivencia.** La compactación resume la conversación
   (`ai-base/src/harness/context-compaction.ts`). El trabajo que vivía sólo en la
   transcripción ahora es una paráfrasis de sí mismo.
3. **Sin estructura por encima del turno.** Los `runs` ejecutan un turno; `cron`,
   `triggers` y `monitors` disparan turnos. Nada los secuencia ni razona sobre un
   paso que falló hace tres días.
4. **Sin linaje.** El fork copia entradas y se olvida de que bifurcó
   (`app-sessions.ts:392`).

**Una cosa que esta lista afirmaba y no debería.** Un borrador anterior decía que
nada se reanuda después de un reinicio. Es falso: `src/core/turn-resume.ts`
recupera un turno interrumpido, cuenta intentos y audita la reanudación. El hueco
es más angosto y más preciso que la exageración — *un turno* es recuperable, *una
pieza de trabajo* no. Exagerarlo hacía sonar más fuerte el caso y empeoraba el
diseño, porque escondía que la recuperación a nivel de turno es maquinaria sobre
la que `ai-flows` debe apoyarse en vez de duplicar.

## Definición

> Un **flow** es una unidad de trabajo declarada, persistida y reanudable, con un
> objetivo, una forma, un estado y un linaje. Sobrevive a cualquier sesión, run o
> proceso que lo sirva.

El turno deja de ser el objeto de primer nivel y pasa a ser un detalle de
implementación de un paso.

## El modelo

```
Flow
├─ id, scopeId, título
├─ goal          — qué significa "listo", en texto y (opcionalmente) como chequeo
├─ shape         — la forma del flow (ver abajo); determina cómo se eligen los pasos
├─ state         — draft | running | waiting | blocked | done | abandoned
├─ lineage       — forkedFrom { flowId, atStep } | null   ← de primera clase
├─ steps[]       — ordenados, cada uno con su estado y resultado
├─ artifacts[]   — archivos, apps, mensajes que produjo (referenciados, no incrustados)
└─ memory        — scope de nivel flow en ai-storage (ver 05)
```

`waiting` y `blocked` son distintos a propósito. **Waiting** es una decisión del
propio flow — una continuación agendada, una aprobación pendiente, un evento
externo. **Blocked** es no poder avanzar. Colapsarlos es cómo un sistema termina
sin poder distinguir "funcionando como se diseñó" de "trabado desde el martes",
que es justo la pregunta que un sistema operativo tiene que responder.

### Un paso

```
Step
├─ intent       — para qué es este paso
├─ execution    — cómo corre (ver la pregunta abierta)
├─ state        — pending | running | waiting | done | failed | skipped
├─ result       — salida estructurada + puntero al run que la produjo
└─ attempts[]   — cada intento, conservado; el fracaso es historia, no sobrescritura
      └─ observation — qué se observó que produjo este intento, capturado al
                       cerrarlo. Opcional, nunca inferido (ADR-0007)
```

Conservar `attempts[]` en vez de sobrescribir es la lección directa de
`skill-store.ts:142` (`version += 1`, sin historia): un contador que descarta su
pasado no se puede diffear, ni revertir, ni explicar.

## Formas de flow

**Trabajos distintos tienen formas distintas, y el sistema debería saber en cuál
está.** Una forma es un objeto real, no una etiqueta: determina cómo se elige el
paso siguiente, qué significa "listo", qué renderiza el canvas y — la parte que
importa para [el problema multijugador](../../README.es.md#el-problema-la-ia-sigue-siendo-de-un-solo-jugador)
— *qué puede hacerle una segunda persona al flow sin romperlo*.

Seis formas. Cada una se define abajo sobre los mismos siete campos, porque una
forma cuyo handoff y terminación no están especificados es un nombre, no una
definición.

### Plantilla de definición

| Campo | Por qué está en toda definición |
|---|---|
| **Para** | El tipo de trabajo. Si no lo podés nombrar en una frase, la forma está mal |
| **Paso siguiente** | Cómo elige el motor qué corre después |
| **Listo** | La condición de éxito. Una forma sin condición de terminación es un bug, no una feature |
| **Falla cuando** | El estado que significa *trabado*, distinto de `waiting` |
| **Handoff** | Qué puede hacer una segunda persona — el contrato multijugador |
| **Sin subagentes** | Cómo completa en `pi`. Todas deben poder, por la [restricción de portabilidad](#la-restricción-de-portabilidad) |
| **No usar para** | El mal uso que la colapsa en otra forma |

---

### `Open` — el default

- **Para:** trabajo cuya forma todavía no se conoce. Investigación exploratoria,
  una pregunta que se convierte en proyecto.
- **Paso siguiente:** lo decide el agente cada vez.
- **Listo:** lo declara el agente, o una persona.
- **Falla cuando:** el objetivo no se movió en N pasos — deriva, no fracaso.
  **Y "no se movió" es una medición, no una observación**: dos intentos de trabajo
  idéntico no producen de manera confiable el mismo estado, así que esta regla
  tiene una tasa de cambio falso y hay que conocerla antes de que la regla
  signifique algo. La división que esconde — *deriva* (legible, detenido) contra
  *ilegible* (moviéndose hasta donde se puede saber) — es
  [10-observabilidad](10-observability.md).
- **Handoff:** cualquiera dentro del scope lee el objetivo y el historial de pasos
  y continúa. Este es el contrato multijugador mínimo y todas las demás formas lo
  heredan.
- **Sin subagentes:** nativamente — es un agente trabajando.
- **No usar para:** trabajo que ya sabés que es un `Sequence`. `Open` es honesto
  sobre la incertidumbre, no una forma de evitar declarar estructura que tenés.

**`Open` es la que tiene que existir.** Es lo que ya es una sesión común,
expresada como flow para que gane objetivo, linaje y memoria gratis. Nadie
debería tener que elegir una forma para empezar a trabajar; debería poder
**promover** un flow abierto a uno estructurado cuando la forma se vuelve obvia,
conservando su historia. Exigir la forma por adelantado es cómo las herramientas
de workflow se vuelven cosas que nadie arranca.

### `Sequence` — orden declarado

- **Para:** trabajo con pasos conocidos en orden conocido. Onboarding, un
  checklist de release, un procedimiento de cumplimiento.
- **Paso siguiente:** el siguiente paso sin hacer, en el orden declarado.
- **Listo:** el último paso está hecho.
- **Falla cuando:** un paso falla y no le quedan reintentos. Los pasos posteriores
  quedan `blocked`, no `skipped` — esa distinción es lo que hace diagnosticable al
  flow.
- **Handoff:** a nivel de paso. Una persona puede ser dueña del paso 4 mientras el
  agente corre el 5, y la propiedad es un atributo del paso. Es la forma más
  cercana a cómo los equipos ya se reparten el trabajo.
- **Sin subagentes:** nativamente — los pasos son secuenciales por definición.
- **No usar para:** trabajo donde el orden es una suposición. Un `Sequence` que se
  reordena en cada corrida era un flow `Open`.

### `Loop` — hasta que esté suficientemente bien

- **Para:** mejora contra una condición medible. "Iterar hasta que pase el eval".
- **Paso siguiente:** repetir el cuerpo con el resultado del intento anterior.
- **Listo:** se cumple la condición.
- **Falla cuando:** se agota el presupuesto, o la métrica deja de mejorar durante
  N iteraciones. **Un `Loop` sin presupuesto declarado no es un flow válido** — el
  motor se niega a arrancarlo.
- **Handoff:** una persona puede cambiar la *condición* en vuelo. Esa es la jugada
  multijugador interesante: redirigir el objetivo sin descartar los intentos ya
  hechos.

  **Asentado como riesgo, todavía no diseñado contra él.** Dos personas ajustando
  el objetivo de un mismo lazo, cada una reaccionando a resultados producidos
  antes de que aterrizara el cambio de la otra, es realimentación con retardo
  alrededor de un lazo cerrado, y oscila. Dentro de un mismo run esto no puede
  pasar — los runs están serializados por sesión y `steer` interfolia a través de
  un único run vivo (ver la restricción de concurrencia) — así que la exposición
  es *entre* runs y entre días, que es precisamente el handoff que este campo
  publicita. Los remedios estándar son un controlador por vez, redirección con
  límite de tasa, o amortiguamiento explícito. **Ninguno se elige acá.** `Loop` es
  M6; elegir un remedio antes de observar la falla es adivinar con pasos de más.
- **Sin subagentes:** nativamente — las iteraciones son secuenciales.
- **No usar para:** trabajo sin condición medible. Sin ella esto es un flow `Open`
  con una falsa promesa de terminación.

### `Fan-out` — un paso por ítem

- **Para:** el mismo trabajo sobre muchos ítems. Triage de 40 hilos, migrar 200
  archivos.
- **Paso siguiente:** cada ítem es independiente; el orden no significa nada.
- **Listo:** todos los ítems llegan a un estado terminal — incluido `skipped`.
- **Falla cuando:** la *tasa* de fallo cruza un umbral. Un ítem fallado es dato;
  cuarenta es un flow roto, y la forma debería decirlo en vez de moler hasta el
  final.
- **Handoff:** por ítem. Dos personas y un agente pueden tomar cada uno una
  porción, y el flow sigue siendo un objeto. Es la forma que más obviamente le
  gana a un chat.
- **Sin subagentes:** secuencialmente, más lento. El fan-out con subagentes es el
  camino rápido, **nunca un requisito** — un `Fan-out` que no hace nada en `pi`
  está roto.
- **No usar para:** ítems que dependen entre sí. Eso es un `Sequence` disfrazado, y
  va a trabarse o corromper datos.

### `Deliberation` — N intentos, después un juez

- **Para:** decisiones con espacio de soluciones amplio. Elegir una arquitectura,
  una estrategia de migración.
- **Paso siguiente:** N intentos independientes desde ángulos declarados, y
  después un paso de juicio.
- **Listo:** se selecciona un ganador **y se registra la razón.** Una elección sin
  registrar vuelve inútil a toda la forma — nadie puede revisitarla.
- **Falla cuando:** el juez no logra separar los intentos. Eso es un resultado
  real ("son equivalentes"), no un error, y tiene que poder reportarse como tal.
- **Handoff:** **una persona puede ser uno de los intentos, o ser el juez.** Es la
  forma donde humano y agente participan como pares, y no como operador y
  herramienta.
- **Sin subagentes:** los intentos corren secuencialmente con los otros ocultos —
  la independencia es una propiedad del *aislamiento de contexto*, no del
  paralelismo.
- **No usar para:** decisiones ya tomadas. Una `Deliberation` montada para
  justificar una conclusión predeterminada es peor que ningún flow, porque lava
  la decisión.

### `Watch` — trabajo permanente

- **Para:** reaccionar a cambios externos. Monitorear CI, vigilar una cola,
  seguir una casilla.
- **Paso siguiente:** un evento externo, vía `src/triggers/` o `src/monitors/`.
- **Listo:** **nunca.** Es trabajo permanente, y el modelo de estados tiene que
  aceptarlo en vez de tratarlo como inconcluso.
- **Falla cuando:** la fuente del trigger es inalcanzable, o la reacción falla
  repetidamente. El silencio tiene que ser distinguible de la salud — un `Watch`
  que no vio nada en una semana está tranquilo o está roto, y sólo el flow lo sabe.
- **Handoff:** la propiedad se transfiere; el watch no se reinicia. Delegar una
  responsabilidad permanente sin que se caiga es exactamente el problema operativo
  que un chat compartido no resuelve.
- **Sin subagentes:** nativamente — las reacciones son turnos sueltos.
- **No usar para:** una espera puntual. Eso es un paso `waiting` dentro de otro flow.

---

### Cuáles pagan el linaje

`Deliberation` y `Loop` producen múltiples intentos que hay que comparar, y
comparar necesita un ancestro común — ahí es donde `forkedFrom` se gana su lugar.
`Fan-out` genera el mayor tráfico de handoff, y es la mejor primera prueba de que
un flow le gana a un chat. `Open` es la que tiene que salir primero, porque todo
lo demás es una promoción de ella.

## Linaje: fork, diff, merge

Bifurcar un flow registra `forkedFrom { flowId, atStep }`. Como el ancestro es
explícito, se vuelven posibles dos cosas que QM hoy no puede:

- **diff** — comparar dos flows: qué pasos divergieron, qué artefactos difieren,
  qué conclusiones chocan.
- **merge** — traer una rama de vuelta. Artefactos que difieren en archivos
  distintos es mecánico. **Dos conclusiones distintas sobre el mismo archivo es el
  caso interesante**, y está sin resolver: necesita un reconciliador, no un merge
  de texto.

Esto se declara como problema abierto, no como feature. La organización ya
construyó exactamente este seam de reconciliación, y la lección honesta es que el
algoritmo de merge es fácil y *decidir qué es un conflicto* es toda la dificultad.

**Orden de construcción: `diff` primero, y se sostiene solo.** Si merge nunca
sale, el diff entre dos flows bifurcados sigue siendo lo más útil de acá.

## Cómo se apoya en ai-base

Un flow **compone** las primitivas de upstream; no las reemplaza.

| Concepto de flow | Corre sobre |
|---|---|
| Ejecución de un paso | `src/runs/` — el intento de un paso es un run |
| Recuperación de turno ante caída | `src/core/turn-resume.ts` — **reutilizado, no reconstruido** |
| Llamada al modelo | `Harness` (`src/harness/harness.ts:167`) — nunca un SDK de un proveedor |
| Conversación | `src/sessions/` — un flow referencia sesiones, no las reimplementa |
| Despertar | `src/cron/`, `src/triggers/`, `src/monitors/` |
| Fan-out de subagentes dentro de un paso | `src/tasks/` — **leído y enlazado, nunca poseído** ([ADR-0004](adr/0004-flows-and-the-subagent-record.md)) |
| Superficie de tools | `execute, read, write, publish, memory, history, background` |
| Aprobación / política | Sin cambios. Un flow **no** tiene exención de la postura de seguridad |
| Aislamiento | El sandbox existente del scope (**necesita imagen Docker construida**) |
| Registros de flow y pasos | **Tablas nuevas, prefijo `flow_`, ninguna tabla de upstream alterada** |

## La restricción de portabilidad

**Revisado el 2026-08-06.** Esta sección abría con: *"la delegación en subagentes
y los modelos de OpenRouter viven en conjuntos disjuntos de harness — `pi` tiene
modelos baratos y ningún subagente"*. Esa premisa está muerta. Hoy `pi` delega,
mediante agentes markdown definidos en el workspace, y conserva OpenRouter (matriz
corregida en
[01-architecture](01-architecture.md#la-matriz-de-capacidades-por-harness)). Las
tres reglas de diseño de abajo sobreviven a la corrección, pero sólo una conserva
su razón original.

1. **Un flow debe completar en un harness sin subagentes.** Sin cambios, y ahora
   quien la hace morder es `mock`, no `pi`. El fan-out es una optimización que un
   paso *puede* usar, nunca un requisito. Un flow que no hace nada donde la
   delegación está ausente es un flow roto.
2. **Las formas `Fan-out` y `Deliberation` no pueden asumir subagentes.** Sin
   cambios. Ambas pueden resolverse con pasos secuenciales; el paralelismo es el
   camino rápido, no el único.
3. **El eval tiene que correr en ambos.** Sin cambios en su fuerza, con un cambio
   en qué significa "ambos". La disyunción que lo hacía un trade-off de costo ya no
   está; lo que sigue siendo disjunto es **dónde se define el agente** — un archivo
   en el workspace del scope en `pi`, una definición hardcodeada o propiedad de la
   CLI en todos los demás. Un eval afinado en uno generaliza al otro sólo por
   suerte.

La consecuencia genuinamente nueva, y la que esta sección antes no podía tener:
**la delegación en el harness por defecto no deja registro durable.** `pi` no
escribe filas en `tasks`, así que un paso que hace fan-out devuelve los reportes de
sus hijos y nada más. ADR-0004 decía que un flow lee el registro de subagentes y
nunca lo posee; en `pi` no hay registro que leer. Un flow que quiera saber qué
hicieron sus hijos tiene que capturarlo en la observación del intento
([ADR-0007](adr/0007-observation-captured-not-derived.md)), que es el mecanismo que
ya existe exactamente por esta razón.

Es además el argumento más fuerte hasta ahora a favor del seam `Harness`: apenas
un flow mete la mano más allá, hacia la maquinaria de subagentes de un harness
puntual, `ai-flows` pasa a ser portable sólo de nombre.

## La restricción de concurrencia

Una segunda restricción, encontrada en el run store y no en la capa de harness, y
acota a todo flow con más de un participante. `postgres-run-store.ts:149`
**[read]**:

```sql
SELECT id FROM runs WHERE status='pending'
  AND session_id NOT IN (SELECT session_id FROM runs WHERE status='running')
ORDER BY created_at ASC FOR UPDATE SKIP LOCKED LIMIT 1
```

**Los runs se serializan por sesión.** Dos personas no pueden tener dos runs
ejecutando contra una misma sesión, así que un flow atado a una sola sesión es
mono-hilo por más participantes que tenga. Lo que upstream ofrece en su lugar es
intercalado: un segundo mensaje hacia un run vivo llega como señal
(`RunSignalKind = "abort" | "steer"`, `run-signal-store.ts:3`), ruteada en
`app-turn.ts:326-338` y aplicada a mitad de turno.

Dos consecuencias de diseño:

1. **El paralelismo dentro de un flow exige varias sesiones**, lo que convierte la
   pregunta abierta #2 de abajo en un prerequisito para cualquier forma que
   abanique — `Fan-out` y `Deliberation`, las dos.
2. **El contrato multiplayer del campo Handoff de cada forma lo sirve `steer`
   hoy, no la concurrencia.** Una forma que asume dos participantes actuando
   simultáneamente está especificando una primitiva que no existe.

La guarda de membresía también está decidida: si la versión del roster de un
proyecto se mueve a mitad del trabajo, el turno se rechaza en vez de continuar en
silencio (`app-turn.ts:102-106,337`). Un motor de flows que encola runs pasa por
esa guarda; no la vuelve a decidir. El detalle escala por escala está en
[09-scales](09-scales.md).

## Preguntas abiertas

No se responden acá a propósito — contestarlas antes de que corra el primer flow
es adivinar.

1. **¿Qué puede ser un paso?** ¿Sólo un turno de modelo (caro, y a veces absurdo
   — un paso que renombra un archivo no debería costar un turno) o código
   arbitrario (lo que convierte esto en un runtime de workflows general, un
   proyecto mucho más grande)? Inclinación: arrancar sólo con turnos, y agregar un
   conjunto acotado de pasos nativos cuando el dolor sea real.
2. **¿Una sesión o varias?** ¿Un flow posee una sesión, o referencia varias entre
   agentes y superficies? El trabajo multi-agente es lo segundo; la simplicidad es
   lo primero. **Afilada por [la restricción de concurrencia](#la-restricción-de-concurrencia):**
   una sola sesión significa que el flow es mono-hilo, así que hay que responderla
   antes de cualquier trabajo colectivo o de fan-out, no durante.
3. **¿Quién avanza el flow — el agente o el motor?** Que avance el motor es
   predecible; que avance el agente es lo que lo hace un SO *de agentes*.
   Probablemente dependa de la forma, lo cual es un argumento a favor de que las
   formas sean objetos reales.
4. **¿Qué es un conflicto entre dos conclusiones?** Sin resolver, arriba.

## Cómo se falsifica

**La medición:** tomar trabajo real, multi-día y multi-paso. Correrlo como una
sesión común de QM y como un flow. Comparar completitud, y comparar la
recuperación después de una interrupción (reinicio, compactación, una semana de
pausa).

**La afirmación:** la sesión pierde trabajo en la interrupción y el flow no.

**Si rinden igual, ai-flows no vale su costo de mantenimiento** — es el pilar que
obliga al fork, así que carga la mayor exigencia de prueba de los cuatro. Ese
veredicto es aceptable y hay que reportarlo si ocurre.
