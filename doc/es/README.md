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
| [04 · ai-ui](04-ai-ui.md) | El escritorio: documentos, cubitos de agentes, la cara de traza. Construido; su propia falsificación no se corrió |
| [15 · Interacción generada](15-generated-interaction.md) | Zoom semántico, el menú que se auto-revela, deixis y fork — lo que un modelo puede hacer y una GUI no podía. Fases 1–4 construidas, fase 5 especificada |
| [09 · Escalas](09-scales.md) | Individual, colectiva, proyecto, sistema — un solo eje para flows y memoria, y es `scopeId` |
| [10 · Observabilidad](10-observability.md) | Si el progreso de un flow se puede leer siquiera. Deriva contra ilegible, y el piso de ruido medido entre las dos |
| [12 · Conformación](12-conformation.md) | Proyectos, agentes y carpetas: qué es el workspace en capas, y por qué la membresía nunca vive ahí |
| [16 · Una carga de trabajo con oráculo](16-a-workload-with-an-oracle.md) | La primera carga de trabajo con métrica declarada, la costura que la lee entre lenguajes, y las tres formas en que mintieron sus instrumentos. La shape `Gated` que argumenta ya está construida — ver 17 |
| [17 · Nace un proyecto](17-a-project-is-born.md) | Empezar, dotar y amueblar un proyecto desde el escritorio; el proyecto que escribe su propio roster; skills perezosas con 95.8% medido; memoria que sobrevive la sesión. **Incluye la ruta que confirmó su propia escritura con su propio lector** |

## Especificación — no construido

| | |
|---|---|
| [05 · ai-storage](05-ai-storage.md) | Memoria en cuatro niveles — sistema, usuario, proyecto, flow — con promoción explícita y reversible. **Dibujada en el escritorio antes de construirla**, y el dibujo es parte de la spec |
| [03 § Formas de flow](03-ai-flows.md#formas-de-flow) | `Sequence`, `Loop`, `Fan-out`, `Deliberation`, `Watch`, y el merge |

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
