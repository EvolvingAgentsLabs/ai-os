# ai-os — documentación

> **El inglés es canónico.** Esta es la traducción de [`doc/`](../). Si los dos
> difieren, el correcto es el inglés. Ver [Idiomas](../../README.es.md#idiomas).

Acá viven dos clases de documento, y la diferencia es lo más útil de esta página.

**Referencia** describe software que corre. Toda afirmación es citable a un
archivo y una línea, o está marcada como observada.

**Especificación** describe software que todavía no existe. Está escrita para
construir a partir de ella — y para que se discuta antes de construir nada, que
es más barato.

Cada documento dice cuál de las dos es, en un cartel debajo del título. El
documento que cambia de clase se reescribe el cartel el mismo día.

## Manuales

| | |
|---|---|
| [**Correr ai-os**](manual.md) | El sistema entero, proceso por proceso y gesto por gesto, con capturas de una instancia viva y una lista explícita de lo que no existe |

## Referencia — el SO tal como corre

| | |
|---|---|
| [01 · Arquitectura](01-architecture.md) | Los cuatro pilares, cómo encajan y dónde se engancha cada uno a la base |
| [02 · ai-base](02-ai-base.md) | Qué da QM realmente — verificado contra el código, no contra su README — y los seams sobre los que se construye |
| [03 · ai-flows](03-ai-flows.md) | El modelo de flow: objetivo, pasos, intentos, observaciones. `Open` y `Gated` corren; las otras cuatro formas son especificación |
| [04 · ai-ui](04-ai-ui.md) | El escritorio: documentos, cubitos de agentes, la cara de traza. Construido y todavía servido por `make up`; la superficie **publicada** es ahora el canvas de actividad (21 §10). Su propia falsificación — el cronómetro de §Cómo se falsifica — sigue sin correrse |
| [05 · ai-storage](05-ai-storage.md) | Memoria en cuatro niveles — sistema, usuario, proyecto, flow — con promoción explícita y reversible. **Dibujada en el escritorio antes de construirla**, y el dibujo es parte de la spec. **Construida al 2026-08-24**, alrededor de un modelo local — el 22 es la especificación con la que se construyó y el resultado que salió en contra |
| [15 · Interacción generada](15-generated-interaction.md) | Zoom semántico, el menú que se auto-revela, deixis y fork — lo que un modelo puede hacer y una GUI no podía. Fases 1–4 construidas, fase 5 especificada |
| [09 · Escalas](09-scales.md) | Individual, colectiva, proyecto, sistema — un solo eje para flows y memoria, y es `scopeId` |
| [10 · Observabilidad](10-observability.md) | Si el progreso de un flow se puede leer siquiera. Deriva contra ilegible, y el piso de ruido medido entre las dos |
| [12 · Conformación](12-conformation.md) | Proyectos, agentes y carpetas: qué es el workspace en capas, y por qué la membresía nunca vive ahí |
| [16 · Una carga de trabajo con oráculo](16-a-workload-with-an-oracle.md) | La primera carga de trabajo con métrica declarada, la costura que la lee entre lenguajes, y las tres formas en que mintieron sus instrumentos. La shape `Gated` que argumenta ya está construida — ver 17 |
| [17 · Nace un proyecto](17-a-project-is-born.md) | Empezar, dotar y amueblar un proyecto desde el escritorio; el proyecto que escribe su propio roster; skills perezosas con 95.8% medido; memoria que sobrevive la sesión. **Incluye la ruta que confirmó su propia escritura con su propio lector** |
| [18 · De una hipótesis a una superficie terapéutica](18-from-a-hypothesis-to-a-therapeutic-surface.md) | El arco completo sobre una carga de trabajo: una hipótesis de biofísica de 1995 planteada como matemática, simulada, **encontrada apoyada en un modelo equivocado**, reparada contra una condición pre-registrada, acotada — y después convertida en afirmaciones gateadas y falsables sobre patologías y su tratamiento. **§8 es lo que no muestra, incluido un experimento acompañante que salió en contra del argumento habitual para los gates** |

## Especificación — no construido

| | |
|---|---|
| [03 § Formas de flow](03-ai-flows.md#formas-de-flow) | `Sequence`, `Loop`, `Fan-out`, `Deliberation`, `Watch`, y el merge |

El 05 salió de esta sección el 2026-08-24. Es el último documento en hacerlo, y
la sección tiene ahora una sola fila.

## Hallazgos — qué dijeron las mediciones

Existen porque un diseño que reclama una ventaja tiene que nombrar qué la
falsificaría. Dos de los tres volvieron en contra nuestro, y se conservan enteros.

| | |
|---|---|
| [11 · Elegir un modelo](11-choosing-a-model.md) | Modelo chico más harness contra frontera más harness — el término de interacción, y dónde cambia de signo |
| [13 · Degradación](13-degradation.md) | Cómo se enteraría alguien de que un sistema bien configurado dejó de estar bien. Un caso documentado donde la supervisión *restó*, y uno propio |
| [14 · Estudio de revisión](14-review-study.md) | **¿Agregar un revisor ayuda?** El estudio corrió y no encontró nada — y el hallazgo del primer borrador era un artefacto de un punto final, que se llevó puestos otros cuatro números |

## Decisiones

Un archivo por decisión de arquitectura, escrita cuando se toma y **reemplazada,
nunca editada**. Una decisión que resultó apoyarse en una premisa falsa es el
registro más útil que esta organización puede guardar.

Ver [`adr/`](../adr/) — el índice completo está en la
[versión en inglés](../README.md#decisions).

## Proyecto

Documentos sobre el trabajo, no sobre el sistema.

| | |
|---|---|
| [00 · Visión](00-vision.md) | Qué es un sistema operativo de agentes, y qué lo distingue de una app de chat con plugins |
| [06 · Licenciamiento](06-licensing.md) | Apache 2.0 sobre MIT: qué se permite, qué se exige, qué se prohíbe |
| [07 · Política de congelado](07-freeze-policy.md) | Qué significa "congelado" para los otros repos de la organización, operativamente |
| [08 · Roadmap](08-roadmap.md) | Milestones en orden de dependencia, con los bloqueos dichos con honestidad |
| [19 · Qué haría que esto importe](19-what-would-make-this-matter.md) | El repositorio completo leído desde afuera: qué corre, para quién es, qué es genuinamente distinto, y un plan ordenado por el hecho de que hay un autor y ningún usuario. **Incluye la deriva que encontró y el check que ahora la frena** |
| [20 · Todo es un agente](20-everything-is-an-agent.md) | El rediseño del escritorio, del demo y del tour: los agentes como los objetos, los traspasos como cables que se pueden abrir, un Inspector con una segunda posición que le entrega el objeto a un agente — y la regla de que cada hallazgo cita el artefacto que leyó. **Incluye los tres defectos que encontró dibujar los flujos** |
| [21 · Hilos de pensamiento](21-threads-of-thought.md) | La superficie como tiempo: cuerdas, después una trenza, después una grilla de cuadrados — tres superficies publicadas en tres días, y por qué cada una reemplazó a la anterior. **§9 son los cuatro errores que impedían que la trenza se leyera como un objeto; §10 es por qué la grilla la reemplazó: en la trenza nada tenía una dirección que se pudiera señalar** |
| [22 · ai-storage sobre un modelo local](22-ai-storage-qwen.md) | La capa de conocimiento para un modelo **local** limitado a 8.192 tokens a propósito. **§0 es que el modelo no fue verificado como existente desde acá; §59 es el primer benchmark, y salió en contra del diseño — la búsqueda exacta le gana a la jerarquía y el archivo plano no entra** |
| [**El plan de plataforma**](PLAN-PLATFORM.md) | Una tormenta de ideas de producto mapeada sobre este repositorio tal como está en disco: cuatro de sus cinco fases ya tienen predecesor, dos tienen resultados que la contradicen, y cada etapa está condicionada a una medición |
| [**Los casos de validación**](PLAN-PLATFORM-CASES.md) | Sobre qué se valida cada etapa del plan de plataforma — trabajo real, no demos, y tres de ellos corren contra **las propias reglas de casa de este repositorio, ya enforced** |


<a id="house-rules"></a>

## Reglas de la casa

1. **Toda afirmación sobre QM cita archivo y línea.** Upstream se mueve todos los
   días; una afirmación sin cita ya se pudrió. Los números de línea de acá se
   leyeron en el commit `7f2c916` de `ai-base`.
2. **Leer no es correr — decí cuál.** Las afirmaciones van marcadas **[read]**
   (del código) o **[ran]** (observadas ejecutando). Agregado el 2026-08-01,
   después de que la primera pasada de estos documentos se escribiera sólo
   leyendo y resultara tener siete errores materiales, dos ya endurecidos en un
   ADR.
3. **Un hueco se dice como hueco**, en presente. Sin voz aspiracional.
4. **Medido le gana a argumentado.** Un diseño que reclama una ventaja nombra la
   medición que la falsificaría, y prefiere un instrumento *existente* a uno
   nuevo — una escala fresca es la forma en que un benchmark termina halagando a
   su autor.
5. **Un boceto se marca como boceto.** Donde una especificación está dibujada en
   vez de descrita — `ai-storage` en el escritorio — el dibujo lo dice en su
   propia cara, no en un epígrafe. Una superficie que dibuja un boceto igual que
   el estado medido le enseña a quien la lee a confiar en los dos por igual.
