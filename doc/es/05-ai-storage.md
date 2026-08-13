# 05 · ai-storage — memoria con espacio de direcciones

<img src="../assets/05-ai-storage.jpg" alt="" width="100%">

<sub>Cuatro niveles. Una sola flecha de promoción está construida.</sub>


> **El inglés es canónico.** Traducción de [`doc/05-ai-storage.md`](../05-ai-storage.md).
>
> **Especificación.** Especificado, no implementado.
>
> **Leer la sección "Resultado previo" antes de diseñar nada acá.** Una
> afirmación muy cercana de esta organización midió *igual que el enfoque
> ingenuo*, y ese resultado moldea este documento más que ninguna otra entrada.


## La forma, dibujada antes de construirla — 2026-08-09

<img src="../assets/manual/11-trace-memory.jpg" alt="" width="100%">

<sub>El cajón de memoria en el escritorio, sellado <strong>NOT BUILT — THIS IS THE SPEC</strong>. Nada de eso se guarda: las fichas se recalculan desde las trazas de los flows en cada lectura, que es lo que lo vuelve un boceto y no memoria.</sub>

Este documento es una especificación, y una imagen es una más barata — una imagen
interactiva más barata todavía, porque descubrís qué necesita una promoción
intentando apretar el botón. `ai-ui/src/memory.ts` la dibuja, y ese módulo existe
para que se discuta con él y después se tire.

A qué compromete el dibujo a este documento:

- **Cuatro niveles, del más duradero al menos**, y un escalón por promoción:
  flow → project → user → system.
- **La procedencia no es opcional.** Cada nota nombra los flows de los que salió.
  Una nota que nadie puede rastrear hasta el trabajo que la produjo no se
  distingue de una que alguien tipeó, y no se puede revisar cuando ese trabajo
  resulta haber estado mal.
- **Consolidar es quedarse con lo que arrastró.** Sobreviven los pasos que
  movieron algo; los que `contribution.ts` marcó como que no arrastraron nada se
  descartan.

Esa última es la idea barata, y es la razón de que esto no sea un port de
[evolving-memory](https://github.com/EvolvingAgentsLabs/evolving-memory). La
parte difícil de consolidar una traza — *qué pasos importaron* — es la pregunta
que `contribution.ts` ya responde en cada flow. Ese proyecto llama al mismo
trabajo `TraceCurator`.

**Lo que el boceto no responde, y este documento tiene que responder:** cuando dos
notas dicen lo mismo, ¿cuál sobrevive? Consolidar no puede ser un loop sobre los
flows terminados, y esa es la razón.

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

### La regla permanente en que esto se convierte

El resultado de arriba no es una anécdota sobre un experimento. Es la regla para
todo eje propuesto después de él:

> **Ningún eje nuevo de memoria entra sin un benchmark que el baseline pudiera
> perder, nombrado antes de construir el eje.

El diseño de memoria atrae propuestas estructurales con muchísimo atractivo
previo — episódica contra semántica, corto contra largo plazo, pasadas de
consolidación, curvas de decaimiento, replay. Cada una es una distinción real en
algún lado. **Ninguna es evidencia de que un sistema de recuperación mejore por
codificarla**, y la medición de arriba es cómo se ve una estructura atractiva
cuando por fin le piden un número: 80%, 80%, 80%.

La regla cuesta una oración por adelantado y es la guarda más barata que tiene
este pilar. Un eje que no puede nombrar el benchmark que espera ganar no se está
proponiendo; se está asumiendo.

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

## Lo primero realmente construido: un índice que una ventana chica puede navegar — 2026-08-12 [ran]

Todo lo de arriba es especificación. Esta sección no: `ai-flows/src/wiki.ts`
corre, y está ahí y no en `ai-storage/` porque `ai-storage` no tiene paquete e
inventar uno para sostener cuatrocientas líneas sería la forma cara de progresar.

### El problema, que no es precisión de recuperación

El material de un proyecto excede la ventana mucho antes que el disco.
Trescientos kilobytes de notas son unos ochenta mil tokens; un modelo local que
valga la pena correr en una laptop tiene ocho mil. El trabajo no se puede hacer
leyendo el material, y tampoco resumiéndolo — la pregunta que motiva esto es *qué
hay en el material que falta en la obra*, y un resumen es una lista de lo que
alguien ya notó.

Así que la recuperación deja de ser una búsqueda sobre texto y pasa a ser
**navegación sobre un índice que el modelo sí puede sostener**. El índice es un
directorio, no un resumen: una línea por unidad, cada línea nombrando el archivo
de nota que contiene la unidad. El modelo lee el directorio, que entra, y abre
las dos notas que necesita, que también entran.

### El benchmark, nombrado antes de construir el eje

La regla vigente de arriba dice que ningún eje de memoria se embarca sin un
benchmark que la línea base pueda perder, nombrado primero. La línea base es el
`MEMORY.md` plano de `ai-base`. El benchmark **no** es precisión de recuperación
—el buque insignia anterior ya compró 80% → 80% → 80% ahí—. Es capacidad:

> ¿A qué tamaño de corpus lo que el modelo debe leer deja de entrar en la ventana?

Medido, con ventana de 8.000 tokens y notas de ~1.800 caracteres:

| | qué debe leer el modelo | veredicto |
|---|---|---|
| archivo plano (base) | el material | **16 unidades**, y deja de entrar |
| índice (el eje) | raíz + un shard | 500 notas → **3.940 tok**, 21 shards |
| | | 2.000 notas → **4.523 tok**, 87 shards |

El eje aguanta dos órdenes de magnitud más allá del punto donde la línea base ya
falló. Es una afirmación de *capacidad* y es a propósito la barata: es
determinista, no necesita modelo, y es el riesgo que realmente mata el diseño. Si
un modelo chico **usa** bien un índice bien formado es otra pregunta, más cara, y
ni siquiera se puede formular hasta saber que el índice entra.

### Dónde se acaba, escrito ahora en vez de descubierto después

Acotado no es infinito. Dos niveles —una raíz de shards sobre un shard de notas—
compran unas **15.000 notas**, y lo que falla ahí es la raíz: 624 shards son 6.011
tokens de índice general antes de nombrar una sola nota. Más allá, la respuesta es
un tercer nivel, no una máquina más grande. Es una constante del módulo y una
aserción de la suite, porque un límite que nadie escribió se describe como
inexistente.

### Toda decisión es un agente; toda mecánica es código

Hashear, partir, contar, presupuestar, enlazar, renderizar y validar son código:
baratos, reproducibles, auditables — y una llamada al modelo en el camino de
ensamblado es una llamada que puede truncar justo lo que se está ensamblando. En
un modelo local a una docena de tokens por segundo, una llamada que podía ser un
regex son minutos.

Lo que queda es juicio, y vive en `ai-flows/agents/system/memory/` como seis
archivos markdown en el formato que upstream ya parsea:

| agente | qué decide |
|---|---|
| **MemoryKeeper** | el orden, y nada más — no escribe nada |
| **Archivist** | qué es este material, cuál es una unidad, qué metadata pide el caso |
| **Indexer** | el paso iterativo: raíz + shard + ventana → una nota |
| **Reconciler** | ¿son la misma idea?, ¿cuál es canónica?, ¿qué aporta cada variante? |
| **CoverageAuditor** | qué hay en el índice que no tiene realización en la obra |
| **Librarian** | dada una tarea, qué notas abrir |

Son agentes de **sistema**, así que el hallazgo de alcance de doc/12 les aplica
directo: un scope de proyecto no puede delegarles —montan en
`global/agents/<name>.md` y los nombres de agente no pueden contener `/`— y el
compositor marca esos pasos como `inline`, que es estrictamente peor. Es un
defecto conocido del harness, no de estos archivos, y se nombra acá para que
nadie lea la tabla de arriba como una delegación que funciona.

### Dos fallas de instrumento, encontradas midiendo y no leyendo

**La superposición de palabras no puede responder una pregunta de cobertura.**
Medido sobre una fuente real de 300 kilobytes contra una obra derivada: ninguna
sección bajó de la mitad de sus palabras distintivas sobrevivientes, y la mediana
conservaba cuatro quintos — en material donde claramente se habían caído ideas.
La superposición dice *estas palabras siguen dando vueltas*; la pregunta es si la
*afirmación* sigue estando hecha. `contribution.ts` tiene razón sobre traspasos y
no la tiene sobre cobertura, y las instrucciones del CoverageAuditor lo dicen con
sus propias palabras.

**Un conjunto de validación puede tener cero positivos.** Se verificó palabra por
palabra un registro de supresiones que afirmaba "no se perdió nada": los 23
bloques suprimidos efectivamente sobrevivían. Un auditor validado sólo contra ese
material no encontraría nada, y no encontrar nada se leería como que funcionó.
Toda medición de cobertura tiene que declarar su tasa esperada de ausencia
*antes* de correr — que es hoy la primera instrucción que recibe el
CoverageAuditor.

### Verificado contra dos modelos, y qué encontró esa comparación — 2026-08-12 [ran]

El árbol de [`ai-memory`](../../ai-memory/) se condujo de punta a punta contra
`google/gemini-3.5-flash` y `google/gemma-4-31b-it`, un mensaje por paso:
delegar al archivista, delegar al indexer, correr el lint. **Los dos
completaron**, y los dos escribieron una base de conocimiento real en disco —
`INDEX.md`, un shard, un archivo de nota y el espejo de máquina.

Los dos archivistas llegaron a la misma decisión desde la misma muestra: un
borrador de notas, indexado por idea. Las dos notas llevaron keywords concretas y
no adjetivos, y las dos pasaron el lint limpias.

**Y poner las dos lado a lado encontró un defecto que ninguna habría mostrado
sola.** Con entrada idéntica, una reportó el rango de origen `0-98` para 98
caracteres de texto; la otra reportó `0-75` para esos mismos 98. La segunda nota
entonces no se puede caminar de vuelta a su fuente — seguís el rango y caés sobre
otras palabras, y el hash que debía probar lo contrario es el hash de un texto
que nadie encuentra. `chars` y `source` vienen de lugares distintos: uno se mide
del texto, el otro es lo que el escritor dijo que leyó.

Nada verificaba que coincidieran. Ahora `lint` sí, que es donde corresponde: es
decidible por código, y toda la división de este diseño es que el código decide
lo decidible.

### Cuatro fallas de enforcement, y la lección debajo de todas

Hacer andar esa corrida costó cuatro arreglos, y eran el mismo arreglo:

| síntoma | causa |
|---|---|
| 13-16 turnos gastados en `bash` antes de trabajar | los especialistas tenían tools de propósito general |
| el keeper inspeccionando archivos a mano | también las tenía, contra sus propias instrucciones |
| un subagente reintentando una ruta del proyecto sin parar | las tools de archivo de eve corren en un contenedor aislado; las nuestras en el proceso del servidor |
| la build negándose a compilar | un modelo fuera del catálogo del gateway no tiene metadata de ventana de contexto |

Los primeros tres son una sola lección: **una instrucción no es una restricción.**
Las instrucciones del keeper dicen que orquesta y no escribe nada, y escribía; el
indexer tenía una tool hecha a medida y agarraba `bash`. Lo que cambió el
comportamiento no fue redactar mejor — fue **borrar el archivo de la tool del
directorio del agente**. Un especialista con una escotilla de propósito general
es un generalista, y el acotamiento tiene que ser estructural para ser real.

El cuarto vale por lo contrario: la build tenía **razón** en negarse. Un umbral de
compactación calculado sobre una ventana adivinada compacta a destiempo y tira
turnos en silencio, así que la ventana ahora se declara.

### Tres mejoras adoptadas, una nombrada y no construida — 2026-08-12 [ran]

**Chequear la nota en la puerta, no en un reporte de lint.** El reparto de tareas
supone que el modelo aporta criterio y el código aporta mecánica, y esa suposición
tiene una falla específica: el modelo acierta el criterio y falla lo mecánico *sin
dar error*. `verifyNote` corre antes de escribir y le devuelve los motivos a quien
escribe, mientras todavía tiene la fuente delante. Una nota detectada mil notas
después no se recupera, porque para entonces nadie sabe qué debía decir.

**La reanudación se deriva, no se cuenta.** Indexar una fuente grande son horas y
se va a interrumpir. El arreglo obvio es un contador de dónde quedó la corrida, y
está mal: un contador es un segundo registro del mismo hecho, y cuando difiere la
corrida repite trabajo o saltea material — y saltear es silencioso. `progressOf`
lee la procedencia de las notas y reporta los **huecos**, que un `max(to)` ingenuo
esconde.

**La cobertura se cuenta en ideas, y una poda no es una pérdida.** Medida en
caracteres no puede expresar el reclamo por el que existe: una obra puede perder
un tercio de las ideas y sacar 1.0 siendo más verbosa en lo que conservó. Y que
una idea falte no es automáticamente una falla — un autor poda, y podar es parte
de escribir. Una repetición cuya canónica sobrevivió fue bien cortada, así que los
veredictos son `realised · transformed · pruned · absent` y no un cociente. Una
auditoría que reporta cortes correctos como pérdidas entrena a su lector a dejar
de leerla, y ahí también pasa de largo la pérdida real.

**Nombrada y no construida: un primitivo de similitud semántica.** Tres lugares
preguntan "¿esto se parece a aquello?" —el indexer evitando un duplicado, el
conciliador agrupando variantes, el bibliotecario eligiendo qué abrir— y los tres
responden hoy por superposición de palabras. La medición de más arriba dice por
qué no alcanza: la misma idea dicha con otras palabras no se parece a nada. Un
paso de embeddings lo respondería por una fracción de una llamada al modelo. No
está construido, y bajo la regla vigente de doc/05 no se embarca hasta tener un
benchmark que el filtro por keywords pueda perder — dicho para que el hueco sea
una decisión y no un descuido.

### El tour cruza el cambio de scope en vez de fingirlo

La regla del tour es que conduce el cliente real y nunca reproduce una grabación,
y cambiar de scope **navega** — contra un servidor eso es una lectura nueva. Así
que el tour lo cambia de verdad, deja su posición en `sessionStorage` y sigue del
otro lado: dos flows, los dos verdes, y el que está mal. Es `sessionStorage` y no
`localStorage` porque un tour dejado a medias ayer no debe arrancarle solo a
alguien mañana, y termina con elegancia en un escritorio de un solo scope, que es
el que embarca el producto.

### El laboratorio de memoria, en el demo

<img src="../assets/05-memory-lab-flows.jpg" alt="" width="100%">

<sub>Dos flows indexan las mismas notas de campo con los mismos cinco agentes.
Los dos están verdes; uno está mal. De una instancia viva.</sub>

Un tercer scope, `group:memory-lab`, con un proyecto inventado que lo declara.
Dos flows indexan el mismo montón de notas de campo con los mismos cinco agentes;
los dos están verdes. Uno construyó un índice donde toda nota se puede caminar de
vuelta a su fuente. El otro tiene una que no: declara 663 caracteres de un pasaje
que tiene 1.105, así que seguir el rango cae sobre otras palabras y el hash que
debía probar lo contrario es de un texto que nadie encuentra.

<img src="../assets/05-memory-lab-flag.jpg" alt="" width="100%">

<sub>El panel es la respuesta a "cómo se inspecciona esto". El digest cuenta el
paso marcado, el menú lo ofrece como lugar donde mirar, y el trace nombra el
instrumento que lo agarró. De una instancia viva.</sub>

Se ve igual a las demás en la lista, y ése es el punto — la escribió un modelo que
acertó el criterio y falló lo mecánico. El escritorio la encuentra con los
instrumentos que ya tenía, y la bandera dice cuál habló: *cannot be walked back to
its source — the source range is 663 characters but the text is 1105*.

Dos defectos que este scope encontró en el propio escritorio, los dos por cambiar
de scope y leer: el panel de documentos vivos listaba los del **primer** scope en
todos, afirmando "solo lectura" sobre un proyecto que nadie estaba mirando; y el
cartel del trace afirmaba superposición de palabras distintivas fuera lo que fuera
lo medido. Los dos siguen ahora la regla que la bandera por paso ya cumplía:
nombrar el instrumento que habló.

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
