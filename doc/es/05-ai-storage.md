# 05 · ai-storage — memoria con espacio de direcciones

> **El inglés es canónico.** Traducción de [`doc/05-ai-storage.md`](../05-ai-storage.md).
>
> **Estado: especificado, no implementado.**
>
> **Leer la sección "Resultado previo" antes de diseñar nada acá.** Una
> afirmación muy cercana de esta organización midió *igual que el enfoque
> ingenuo*, y ese resultado moldea este documento más que ninguna otra entrada.

## Resultado previo, dicho primero

El flagship anterior (`evolving-agents`) indexaba cada componente dos veces — una
por lo que *es*, otra por para qué *sirve* — con la hipótesis de que mejoraría la
recuperación. Reconstruido y medido en julio de 2026:

| Configuración | acc@1 | MRR |
|---|---:|---:|
| Matching por descripción (baseline) | **80%** | 0.900 |
| Ambos ejes, peso parejo | **80%** | 0.900 |
| Sólo aplicabilidad | **80%** | 0.900 |

Ninguna diferencia. Y **no** era un bug de plomería:
`cosine(content, applicability) = 0.753`, o sea que el segundo eje sí era
información genuinamente distinta. Simplemente no cambió la respuesta en un
encoder moderno.

**La lección que toma ai-storage:** *agregar un eje a la memoria no es
automáticamente una mejora, y la carga de la prueba está sobre el eje.* Por eso
este documento especifica la versión más barata posible de cada idea y nombra qué
la falsaría, en vez de especificar la versión elaborada y asumir que gana.

## Ya existe un benchmark de memoria upstream

Encontrado después de escribir la primera versión de este documento, lo cual es
su propia pequeña lección: **`npm run bench:memory`** — `src/memory/bench.ts`
(151 líneas) más `scripts/memory-bench.ts`.

Corre conversaciones guionadas a través de cada `MemoryStrategyKind` y juzga el
cuaderno resultante en tres ejes:

| Métrica | Qué pregunta |
|---|---|
| `signalToNoise` | cuánto de lo guardado vale la pena guardar |
| `staleness` | cuánto de eso ya no es cierto |
| `inferenceVsObservation` | cuánto se infirió en vez de observarse |

**`staleness` es una de las dos métricas que este documento proponía inventar.**
La tercera, `inferenceVsObservation`, es una que no habíamos pensado y
posiblemente sea más filosa que ambas — un sistema de memoria que promueve
inferencia a hecho en silencio falla de una forma que la precisión de recuperación
no puede ver.

Así que el plan de medición de abajo se reescribió alrededor de extender ese
harness en vez de construir uno paralelo. Inventar nuestra propia escala habría
vuelto nuestros números incomparables con los de upstream, que es la manera
específica en que un benchmark termina halagando a su autor.

## Qué existe hoy

`ai-base/src/memory/memory-service.ts`. Un archivo markdown por scope:

- `memory/MEMORY.md`, bullets como `- (YYYY-MM-DD) hecho`
- tope de `MAX_FACTS = 300`; **al desbordar se descartan los más viejos**
- deduplicación por texto normalizado
- la procedencia no confiable se desactiva textualmente (`(said in X)` →
  `[claimed source: X]`)
- tokens de revisión sha256, con `history` / `restore` / `replaceIfRevision`
  opcionales

Es un diseño mejor de lo que parece. Sus límites reales son dos: **FIFO es la
única política de olvido**, y **un scope es la única dirección**.

## Los cuatro niveles

| Nivel | Scope | Vida | Contiene | Visibilidad |
|---|---|---|---|---|
| **Sistema** | el deployment | permanente | Cómo opera este SO: convenciones, defaults, hechos operativos ganados a pulso | todos |
| **Usuario** | una persona | larga | Preferencias, voz, acuerdos de trabajo, contexto permanente | esa persona |
| **Proyecto** | un equipo / canal / proyecto | la del proyecto | Decisiones, restricciones, hechos de dominio, quién hace qué | los miembros |
| **Flow** | un flow | la del flow, después promovida o descartada | Lo que aprendió esta pieza de trabajo puntual | el flow |

Dos propiedades importan más que la taxonomía:

**La vida difiere por nivel.** Se *espera* que la memoria de flow muera. Ese es el
punto: hoy, cada hecho aprendido en cualquier lado pasa a ser algo que el sistema
cree para siempre, y un FIFO de 300 bullets es lo único que separa eso de una
deriva sin límite.

**La promoción es explícita y reversible.** Un hecho de flow se vuelve hecho de
proyecto sólo por promoción, que registra por qué y quién, y se puede deshacer. La
promoción silenciosa es cómo un parche puntual se convierte en creencia
organizacional.

## Promoción

```
flow ──promover──▶ proyecto ──promover──▶ sistema
  │                   │
usuario ◀─────────────┘   (un hecho sobre una persona, aprendido en trabajo compartido)
```

Reglas:

1. **Nunca automática sin registro.** La promoción automática se permite; la
   promoción sin registrar no. Cada promoción lleva nivel origen, id de origen,
   actor (humano o agente), timestamp y motivo.
2. **Reversible.** La degradación restaura el estado previo en todos los niveles
   tocados.
3. **Sin saltos.** Los hechos de flow no se vuelven hechos de sistema
   directamente. Son dos decisiones independientes, no una.
4. **El conflicto se expone, no se fusiona.** Si un hecho promovido contradice uno
   ya guardado, el sistema no elige en silencio. La detección de contradicciones es
   la parte cara y queda explícitamente diferida al v2.

Nota de implementación: esto es una `MemoryStrategy`
(`ai-base/src/memory/strategy.ts:14` — `onTurnEnd` / `maintain` / `promptLines`),
no un subsistema nuevo. Las estrategias seleccionables son
`per-turn | scratch-promote | agent-only` (`strategy.ts:28`), y la maquinaria de
consolidación que comparten vive en `strategies/consolidation.ts` — un módulo
sobre el que construir, no un cuarto kind para imitar.

**Una flecha de este diagrama ya está construida.** `ccTargetFor` /
`ccCaptureToPersonal` (`memory-service.ts:158,166`) copian un hecho aprendido en
un scope compartido al scope `personal:` de quien actuó, con la fuente
etiquetada; disparan sólo para orígenes `channel` / `group` y nunca para actores
de sistema. Están cableadas en dos de las tres estrategias (`per-turn.ts:140`,
`scratch-promote.ts:167-170`). Eso es `proyecto → usuario`, en producción hoy —
así que las flechas que ai-storage realmente tiene que construir son
`flow → proyecto` y `proyecto → sistema`, y la primera está bloqueada hasta que
exista un scope `flow`. **[read]**

## Cómo se engancha

`ai-storage` implementa el `MemoryService` de QM
(`src/memory/memory-service.ts:28`) y se registra en `src/wiring.ts`. Los cinco
métodos requeridos más la familia opcional de revisiones, que sí implementamos en
vez de omitir — la historia es lo que hace reversible a la promoción.

El problema de los scope kinds: la unión de QM (`src/types.ts:12`) es
`personal | channel | team | org | group`. Nuestros cuatro niveles mapean a
`org` / `personal` / `group` / **nada**. No hay scope de flow, y `org` no
es exactamente "sistema". Resolución en
[ADR-0003](adr/0003-storage-scope-axis.md): agregar `flow` y `system` a la unión
dentro de `ai-base` — un ensanchamiento de dos líneas, registrado en
`AI-OS-PATCHES.md` y ofrecido upstream — en vez de codificar un scope falso dentro
del string `ref`, que sería invisible para cada chequeo de permisos que parsea un
`ScopeId`.

Esa última cláusula es la razón real: un scope falso saltea las ACL en silencio.

**El nivel de proyecto mapea a `group`, no a `team`** — corregido acá después de
leer `src/projects/project-store.ts`. Un proyecto de QM *es* un scope de grupo con
un prefijo de ref reservado (`projectScopeId(id) → group:web-project-<id>`,
`project-store.ts:47`), con roster (`ownerId`, `memberIds`) y una versión por
roster. `team:` sale de `Principal.teamIds` — equipos del proveedor de identidad,
no rosters de proyecto. El eje de escalas y sus consecuencias están en
[09](09-scales.md). **[read]**

## Recuperación

Deliberadamente aburrida en el v1, dado el resultado previo:

1. **Recall ordenado por nivel.** Armar el contexto desde flow → proyecto →
   usuario → sistema, con presupuesto por nivel. Los niveles más cercanos ganan
   los empates.
2. **Mantener `query()` como está en upstream.** Sin capa de embeddings en el v1.
3. **Después medir.** Sólo agregar maquinaria de recuperación — embeddings, un
   segundo eje, un grafo — cuando el recall por niveles resulte *medidamente*
   insuficiente, con la insuficiencia escrita primero.

Invertir este orden es exactamente el error que registró el resultado 80/80.

## Cómo se falsifica

**El harness:** extender `ai-base/src/memory/bench.ts` con una estrategia por
niveles, para que ai-storage sea puntuada por el mismo juez, sobre las mismas
conversaciones, que las tres de upstream. Agregar una fila a una tabla existente
le gana a publicar una tabla nueva.

**Métricas, en orden de lo que realmente zanjan:**

1. **`staleness`** (de upstream) — la afirmación *para la que existen* los cuatro
   niveles. La memoria de flow que muere con su flow debería reducir de forma
   medible el stock de hechos que ya no son ciertos. Si no lo hace, la idea de
   niveles falló en su propia tesis.
2. **`signalToNoise`** e **`inferenceVsObservation`** (de upstream) — guardas.
   Poner niveles no puede comprar staleness descartando hechos útiles, ni
   promoviendo inferencia a hecho en un límite.
3. **acc@1 / MRR** sobre un set de recuperación — se conserva como secundaria, y
   deliberadamente secundaria. Es el instrumento que usó el intento *anterior*, y
   ese intento midió 80% para ambos lados. Liderar con eso sería apostar el pilar
   al único número que ya volvió en cero.

**La afirmación:** el recall ordenado por nivel baja `staleness` contra el
baseline del archivo plano sin perder `signalToNoise` — acotando lo que el
sistema cree para siempre, que es lo que un solo archivo plano no puede hacer.

**El baseline ya está observado**, no supuesto — esto es lo que un turno real
escribió a disco el 2026-08-01:

```
data/workspaces/personal__matias/memory/MEMORY.md
- (2026-08-01) User is building ai-os, an agent operating system.
- (2026-08-01) Flagship repo is EvolvingAgentsLabs/ai-os.
```

**Dos formas de fallar, ambas reportables:**

- Misma precisión → los niveles son contabilidad, no recuperación. Quizás siga
  valiendo por la propiedad de vida útil, pero la afirmación sobre recuperación se
  descarta.
- Misma precisión *y* sin beneficio de vida útil → **ai-storage no vale la pena
  construirlo**, y el archivo plano de upstream es la respuesta correcta.

El segundo desenlace hay que reportarlo tan fuerte como un éxito. El benchmark
80/80 está en el README del repositorio anterior precisamente porque volvió en
cero, y ese es el estándar acá.
