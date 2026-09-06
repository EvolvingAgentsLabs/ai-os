# El plan de plataforma, al 2026-09-06

> **Especificación.** Nada de este documento está construido. Mapea una tormenta
> de ideas de producto sobre `ai-os` tal como existe en disco, y secuencia el
> trabajo para que **cada pieza quede licenciada por una medición antes de
> construirse**.
>
> **El caso de validación de cada etapa vive en
> [`PLAN-PLATFORM-CASES.md`](PLAN-PLATFORM-CASES.md)** — trabajo real, no demos.
> Una etapa sin caso ahí no arranca.
>
> **No** supersede a [`PLAN.md`](../PLAN.md) (COCLEA-SR): ese proyecto es el
> workload que le dice a `ai-os` qué ser, y el canal sigue siendo
> [`FRICTION.md`](../../projects/coclea-sr/FRICTION.md). Este documento es la
> dirección de producto que se sienta al lado.

## La guardia que lleva puesta este documento, porque este archivo ya se quemó

`PLAN.md` deja registrado que una fecha de revisión de tesis del 2026-11-15 fue
**inventada** — *"vino de una tormenta de ideas pegada en una conversación, no de
algo que alguien se haya comprometido a hacer"*.

La entrada de *este* documento también es una tormenta de ideas pegada en una
conversación. Por lo tanto:

- Toda afirmación sobre lo que existe está chequeada contra disco y marcada
  **[read]** o **[ran]**. Las afirmaciones de la tormenta van marcadas
  **[claimed]** y no pesan hasta que algo las mida.
- No se inventan fechas. Este documento no tiene ninguna.
- El *"reduce más de un 70% el consumo de tokens caros"* es **[claimed]** y no es
  un objetivo del proyecto hasta que un arm lo mida.

---

## 1. La tormenta de ideas, contra lo que hay en disco

La propuesta es una plataforma de cinco fases. Mapeada sobre este repositorio,
**cuatro de las cinco ya tienen predecesor**, y dos tienen *resultados que
contradicen la propuesta*.

| fase | qué existe ya acá | estado |
|---|---|---|
| 1 · esquema markdown + backbone git | agentes y subagentes ya son archivos markdown con jerarquía por alcance; `agentvcs` versiona código + skills + goals + modelos + trazas juntos (212 tests, 0 deps) | **[read]** construido / archivado |
| 2 · harness + arranque frontera | `ai-base` (subtree de QM), `ai-flows`, `ai-ui` — 402 tests, CI, stack corriendo, desk jugable | **[ran]** construido |
| 3 · modelos chicos, QLoRA, routing especulativo | `gemma4nanoloop` — y tres premisas de esta fase ya están **falsificadas** (§4) | **[read]** congelado |
| 4 · log de trayectorias + el sueño | `contribution.ts` ya contesta *qué pasos importaron* en cada flow; `nightshift` tiene captura + sueño fase 1 | **[read]** parcial |
| 5 · verticales comerciales | nada | **no construido** |

### Lo que la tormenta se equivoca sobre la competencia

**QM no es un rival. Es `ai-base`** — un `git subtree` mantenido byte-idéntico al
upstream. Y QM ya shippea el §2.3 de la propuesta: *"los skills pertenecen a un
alcance y se comparten por concesión, con promoción a toda la organización
mediada por administrador, y packs de skills importados desde repos git."*
**[read]**

O sea que Sistema/Organización/Proyecto-con-promoción no es un diferenciador a
construir: es el piso sobre el que ya estamos parados. Lo que agrega `ai-storage`
son los dos peldaños que QM **no** tiene — `flow` y `system` — y la razón por la
que vale la pena está en §3, no en la tormenta.

**GBrain también shippea el sueño y el alcance por persona**, así que ni "memoria
organizacional" ni "consolidación en reposo" son foso. Sus números publicados son
de *calidad de retrieval* (P@5, R@5). La pregunta que hace este repositorio es si
traer el material correcto **cambia el resultado de la tarea**, y esa es otra
medición. **[read]**

---

## 2. La corrección que reordena todo

`doc/05-ai-storage.md` contiene cuatro resultados nulos y un diagnóstico que
invalida el diseño de experimento propuesto para esta plataforma la semana
pasada.

| instrumento | resultado |
|---|---|
| `bench:memory`, baseline de archivo plano | staleness **10.0 / 10** — saturado |
| física L2, `oneShot` pelado | **0 / 24** |
| física L2, harness con sandbox | **12 / 12** — headroom **0%** |
| handoff, con el leak cerrado | **6 / 6** — headroom **0%** |

> **Todos los instrumentos compartían una propiedad: la conducta correcta era
> derivable de la información que la tarea ya contenía.** Donde la respuesta es
> derivable, una estrategia aprendida no agrega nada, porque el modelo
> simplemente la deriva.

**Consecuencia, dicha sin vueltas: `physics-verifiers` es el instrumento
equivocado** para el experimento de memoria, y la razón está medida, no
argumentada. Física con sandbox da 12/12 — el modelo computa y se verifica solo.
Su brecha 0/24 → 12/12 ya está atribuida a *cómputo*, así que cualquier
tratamiento apuntado ahí compite por un resultado ya explicado.

El instrumento correcto es el que este mismo documento ya nombra, y es el más
barato de cuatro: **un corrector sintético con una regla oculta que el agente no
puede inferir de la tarea** — una convención de unidades, un chequeo obligatorio,
una restricción de orden que sólo esta organización impone. El headroom es del
**100% por construcción**.

Y contesta la objeción que quedaba en pie contra el resultado procedural más
fuerte del workspace — que los procedimientos inducidos apenas reformulan reglas
que el benchmark plantó:

> **La arbitrariedad es el punto, no una debilidad** — arbitrario es precisamente
> lo que no se puede derivar, y la convención organizacional es arbitraria
> exactamente así.

Esa es la tesis comercial entera en una oración, y ya estaba escrita en este
repositorio.

---

## 3. La regla vigente que obedecen todos los tracks

De `05-ai-storage.md`, ganada por una medición donde un eje extra de memoria sacó
80% / 80% / 80%:

> **Ningún eje nuevo de memoria shippea sin un benchmark que el baseline pueda
> perder, nombrado antes de construir el eje.**

Nada del Track B shippea sin el número del Track C. No es prudencia: es la regla
que este repositorio ya adoptó y ya pagó.

---

## Track A — la interfaz

La tormenta pide "una UI/CLI básica". `ai-ui` está muy por encima de eso: un
escritorio donde los flows son documentos y los agentes son cubos apilados
encima, en vivo, con layout persistido por alcance y una demo pública jugable.
**[ran]** Lo que no tiene es la prueba de que valga la pena.

**A0 · Sembrar el flow del cronómetro. Esto va primero; es el único ítem con
reloj.** La medición M5 necesita un flow de **tres días** que el sujeto no haya
corrido. Sembrarlo cuesta minutos y no se puede comprimir después.

**A1 · Correr el cronómetro de M5.** Una persona, un flow que no corrió, tres
días de antigüedad. Tiempo hasta contestar *cuál es el estado, qué está
bloqueado, qué produjo* — escritorio contra la transcripción de `web-ui`.

> **Chequear el headroom antes de construir nada para esto.** Si el explorador
> plano contesta tan rápido como el escritorio, el canvas es decoración y M5 se
> vuelve a argumentar en vez de pulirse. Dos sujetos son una señal sobre si el
> instrumento funciona, no evidencia — hay que decir cuál es.

`ai-flows/src/view.ts` es el arm de control. **No agregarle interacción.** Es
evidencia sólo mientras se mantenga inerte, y hay un test que lo exige.

**A2 · El cajón de memoria se vuelve real** *(condicionado a A1 y al Track C)*.
`ai-ui/src/memory.ts` ya dibuja la escalera de cuatro niveles estampada **NOT
BUILT — THIS IS THE SPEC**; sus notas se recomputan de las trazas en cada lectura,
que es lo que la vuelve un boceto. Convertirla en la cosa real es donde se
entrega de verdad el "git como backbone invisible":

- Un botón **promover** y uno **degradar** por nota, de a un peldaño — sin saltar
  de flow a system, porque son dos decisiones independientes.
- **Procedencia siempre visible.** Cada nota nombra los flows de los que salió.
  Una nota que nadie puede rastrear es indistinguible de una que alguien tipeó.
- **Una promoción es un registro**: nivel de origen, id de origen, actor, momento
  y razón. La promoción automática se permite; la no registrada no.
- **La contradicción se expone, nunca se fusiona.** La detección queda diferida;
  la superficie no.
- **Cero vocabulario de git en la interfaz.** Ni commit, ni rama, ni tag, ni
  revert. El abogado y el escritor ven *promover*, *deshacer*, *de dónde salió
  esto*.

La instrucción de diseño del documento es la razón por la que esto es trabajo de
interfaz y no de esquema: *uno se entera de lo que necesita una promoción
tratando de apretar el botón*.

**A3 · Arreglos verticales** *(último, condicionado a todo lo anterior)*. Una
vertical es un arreglo de escritorio más un conjunto de memoria de sistema más
una forma de flujo — no un producto nuevo.

**Restricciones que siguen en pie:** leer el escritorio nunca gasta una llamada
al modelo; no hay paso de build hasta que el cronómetro diga que el canvas gana.

---

## Track B — la escalera de memoria (`ai-storage`)

Es la Fase 1 de la tormenta, y es una `MemoryStrategy`
(`ai-base/src/memory/strategy.ts`), **no un subsistema nuevo**.

**B0 · Ensanchar el union de alcances.** El de QM es
`personal | channel | team | org | group`; nuestros niveles necesitan `flow` y
`system`. ADR-0003 ya lo decidió: un ensanche de dos líneas dentro de `ai-base`,
registrado en `AI-OS-PATCHES.md` y ofrecido upstream — *nunca* un alcance falso
codificado en el string `ref`, porque un alcance falso saltea en silencio cada
chequeo de permisos que parsea un `ScopeId`. **No tocar `ai-base` sin esa línea;
CI lo exige.**

**B1 · Que exista un alcance `flow`.** La flecha `flow → project` está bloqueada
por esto y por nada más.

**B2 · Promoción `flow → project`**, con el registro y la reversión de A2. Ojo que
**`project → user` ya está en producción** — `ccTargetFor` / `ccCaptureToPersonal`
copian un hecho aprendido en un alcance compartido al alcance de la persona que
actuó, con la fuente etiquetada. Una flecha del diagrama está construida; dos no.
**[read]**

**B3 · `project → system`**, con compuerta humana por regla.

**El retrieval se queda deliberadamente aburrido**: recuerdo ordenado por nivel,
flow → project → user → system, presupuesto por nivel, gana el nivel más cercano,
y `query()` exactamente como lo tiene upstream. **Sin capa de embeddings, sin
segundo eje, sin grafo en v1** — el resultado 80/80/80 es lo que cuesta eso
cuando finalmente se le pide un número.

**Compuerta: B2 y B3 no arrancan hasta que el Track C devuelva un número.**

---

## Track C — el experimento que licencia al Track B

**C0 · Construir el corrector sintético.** Determinista, sin humano, oráculo
exacto. Sostiene una regla que el agente no puede inferir de la tarea y que sólo
esta organización impone. Es la versión que entra en un día.

**C1 · Correr el loop.** El agente intenta; el corrector le dice que está mal y
**enuncia la regla en términos generales, nunca el valor**; el pase en reposo la
destila; **una instancia distinta** que requiere la misma regla se puntúa después.

**Las dos formas en que este experimento hace trampa, nombradas antes de que
pueda:**

- **Si el mensaje del corrector contiene la respuesta, no se aprendió nada — se
  copió una pista.** La regla, nunca el valor.
- **Nunca puntuar un reintento de la instancia corregida.** Un reintento mide
  seguimiento de instrucciones a corto plazo, que no es la afirmación.
- **La regla tiene que ser chequeable sin el corrector**, o la evaluación es
  circular.

**C2 · La condición de falsación, escrita antes de correr.** Si un sistema que
recibió la corrección no puntúa mejor que uno que no la recibió, sobre una
instancia *distinta* de la misma regla, entonces la información no derivable no
sobrevive al pase de memoria — y el Track B no tiene caso. Ese resultado se
publica.

**C3 · Sólo si C2 sale:** el arm de atribución — el baseline de retrieval más
fuerte construible sobre las mismas trazas corregidas. Es el arm que dice que el
foso es la *regla inducida* y no el *corpus*, y no vale nada antes de que haya un
efecto que atribuir.

---

## Track D — modelos

**Acá no se construye nada, y ese es el plan.** Tres premisas de la Fase 3 ya
están medidas y ninguna sobrevivió: **[read]**

| premisa | medición |
|---|---|
| RAG cierra la brecha de conocimiento | el retriever más fuerte construible: **+0** sobre raw (p = 1,0000) |
| un modelo local más grande es mejor | **no monótono** — 4B 29/50, 9B **18**/50, 12B 38/50 |
| la capacidad vive en los pesos | un **mensaje de feedback** movió a un modelo **+30 puntos**, con la información constante |

Lo que sí está licenciado es el mecanismo de `gemma4nanoloop`, y es sustracción
en vez de especulación: atar tools por fase llevó el schema pico de **5.548 a 817
tokens (−85%)**, la secuencia es un grafo en código, y la verificación es
`ruff`/`pytest` y nunca un modelo juzgando un diff. **[read]**

**El routing especulativo** es el único mecanismo de la Fase 3 nunca medido acá y
el más caro de construir. **QLoRA está peor que diferido**: el mismo
procedimiento, mismo texto, misma regla, clasifica como *compensación de
interfaz* en un 4B y como *ganancia persistente* en un 12B — un QLoRA entrenado
con la evidencia de hoy podría aprender compensación de interfaz y llamarla
pericia.

---

## Track E — el bloque de escena, y por qué acá es barato

Una propuesta nueva, de afuera de la tormenta: antes de los símbolos, que el
razonador escriba el problema como una **escena física** — un modelo mecánico del
mundo real con partes rastreables — y recién ahí pase al formalismo. El origen es
una conferencia sobre un problema abierto donde casi todo concepto llega como
escena antes que como ecuación.

**Procedencia, dicha con honestidad: el video no se vio acá, y los timestamps y
lecturas del análisis pegado están sin verificar.** Lo que se adopta es la
*hipótesis*, no ese relato de la charla.

Por qué pertenece a este repositorio y no a un cuaderno:

1. **Es un cambio de representación, y la representación es un eje que esta
   organización ya mide.** Hay incluso un prior direccional: un experimento
   anterior enfrentó una representación intermedia tipo assembler contra prosa
   plana bajo el mismo oráculo, y **ganó la prosa — la tesis de la representación
   formal quedó falsificada**. Un bloque de escena va más lejos en la dirección
   que ya ganó. **[read]**
2. **Cuesta una edición de markdown, no un cambio de runtime.** Acá los agentes
   *son* archivos markdown. Una sección `## Escena` agregada a un archivo de
   agente es el tratamiento completo. Eso es la afirmación central de la
   arquitectura cobrada en efectivo — y hace de éste el experimento más barato
   del documento.

**E0 · Nombrar el instrumento antes de escribir la sección.** Por §3, un eje que
no puede nombrar el benchmark que espera perder se está asumiendo, no
proponiendo. Dos descalificaciones ya conocidas:

- **Física queda afuera.** Su brecha 0/24 → 12/12 está atribuida al sandbox, o
  sea a cómputo.
- **Todo lo de forma cerrada queda afuera**, por la razón de §2.

El candidato que encaja: una tarea cuyo modo de falla sea **estructural y no
computacional** — donde el modelo produce algo bien formado y equivocado porque
enmarcó mal el problema. `contribution.ts` ya puede decir qué pasos no
transportaron nada, que es lo más parecido a un detector de falla estructural que
este repositorio tiene.

**E1 · La condición de falsación:** si un bloque de escena obligatorio no le gana
al mismo archivo de agente sin él, sobre un benchmark nombrado en E0, se
**borra**. No se afloja: se borra. Un chequeo que puede fallar mientras la
capacidad funciona está midiendo fraseo.

---

## Lo que este plan deliberadamente no construye

Nombrado para que su ausencia sea una decisión y no un olvido:

- **Un repositorio nuevo.** La auditoría de portfolio nombró el *serial
  repo-spawning* como uno de tres problemas transversales: una idea reconstruida
  cuatro o más veces, cada una abandonando un predecesor probado. Una plataforma
  nueva sería la quinta y abandonaría 402 tests, CI y un stack que levanta.
- **Un detector de contradicciones.** Explícitamente diferido a v2 por las reglas
  de promoción; lo que shippea es *exponer* el conflicto.
- **Una capa de embeddings, un segundo eje de memoria, un grafo.** Hasta que el
  recuerdo ordenado por nivel sea *mediblemente* insuficiente.
- **Routing especulativo y QLoRA.** Track D.
- **El split SaaS/on-premise y las tres plantillas verticales.** No se validan
  barato y todas están río abajo del Track C.

## El orden, en un bloque

```
A0  sembrar el flow del cronómetro     ← hoy; único ítem con reloj
A1  correr M5                          ← condiciona todo el trabajo de interfaz
C0  construir el corrector sintético   ← en paralelo con A0/A1; entra en un día
C1  correrlo, puntuar otra instancia
C2  publicar el número, salga como salga   ← condiciona TODO el Track B
       │
       ├── ¿plano?  → el Track B no arranca. Se dice, y se para.
       │
       └── ¿se mueve? → B0 union de alcances · B1 alcance flow · B2 flow→project
                        A2 cajón de memoria con promover/degradar/procedencia
                        C3 arm de atribución de retrieval
                        B3 project→system
                        A3 arreglos verticales
```

## Dónde están los casos

Cada etapa se valida sobre una pieza nombrada de trabajo real, y tres de ellas se
validan sobre **las propias reglas de casa de este repositorio, ya enforced por
código** — porque la convención organizacional arbitraria es la información no
derivable más limpia que hay, y §2 es la razón por la que eso importa. Ver
[`PLAN-PLATFORM-CASES.md`](PLAN-PLATFORM-CASES.md).

## Qué requeriría "terminado" más allá de este archivo

Por la convención del propio repositorio: espejo en inglés, una ilustración, una
entrada en el índice de `doc/README.md`, y un PR.
