# ai-os — documentos de diseño

> **El inglés es canónico.** Esta es la traducción de [`doc/`](../). Si los dos
> difieren, el correcto es el inglés. Ver [Idiomas](../../README.es.md#idiomas).

Estos documentos son el proyecto. El código los sigue, no al revés.

Leer en orden la primera vez:

| # | Documento | Responde |
|---|---|---|
| 00 | [Visión](00-vision.md) | Qué es un sistema operativo de agentes, y qué lo distingue de una app de chat con plugins |
| 01 | [Arquitectura](01-architecture.md) | Cómo encajan los cuatro pilares y dónde se engancha cada uno a la base |
| 02 | [ai-base](02-ai-base.md) | Qué da QM realmente — verificado contra el código, no contra el README — y los seams sobre los que construimos |
| 03 | [ai-flows](03-ai-flows.md) | El modelo de flow: unidades de trabajo declarativas, reanudables e inspeccionables por encima del turno. **`Open` corre; las otras cinco formas no** |
| 04 | [ai-ui](04-ai-ui.md) | El canvas inteligente: una interfaz espacial y viva a nivel de SO |
| 05 | [ai-storage](05-ai-storage.md) | Memoria en cuatro niveles — sistema, usuario, proyecto, flow |
| 06 | [Licenciamiento](06-licensing.md) | Apache 2.0 sobre MIT: qué se permite, qué se exige, qué se prohíbe |
| 07 | [Política de congelado](07-freeze-policy.md) | Qué significa "congelado", operativamente |
| 08 | [Roadmap](08-roadmap.md) | Milestones, en orden de dependencia, con los bloqueos dichos con honestidad |
| 09 | [Escalas](09-scales.md) | Individual, colectivo, proyecto, sistema — un solo eje para flows y memoria, y es el `scopeId` |
| 10 | [Observabilidad](10-observability.md) | ¿Se puede leer el progreso de un flow? Deriva contra ilegible, y el piso de ruido que las separa |
| 11 | [Elegir un modelo](11-choosing-a-model.md) | Modelo chico + harness contra frontier + harness — el término de interacción, y dónde cambia de signo |
| 12 | [Conformación](12-conformation.md) | Proyectos, agentes y carpetas: qué es ya el workspace por capas, por qué la membresía nunca vive ahí, y quién puede ver la forma del sistema |

## Correrlo

[**Correr ai-os**](manual.md) — un manual de lo que arranca de verdad, con
capturas de una instancia viva y una lista explícita de lo que no existe.

## Decisiones

Las decisiones de arquitectura viven en [`adr/`](adr/). Un archivo por decisión,
escrito cuando se toma, **nunca editado después** — se reemplaza (*superseded*).

| ADR | Decisión | Estado |
|---|---|---|
| [0001](adr/0001-fork-vs-dependency.md) | Vendorizar QM como subtree en vez de depender de `@yc-software/qm` | Aceptada |
| [0002](adr/0002-flow-as-first-class-object.md) | El flow es un objeto persistido de primera clase, no un patrón de prompt | **Reemplazada por 0004** |
| [0003](adr/0003-storage-scope-axis.md) | Agregar `flow` y `system` como scope kinds, extendiendo la unión cerrada de QM | Aceptada |
| [0004](adr/0004-flows-and-the-subagent-record.md) | Un flow lee el registro de subagentes (`tasks`) pero no lo posee | Aceptada |
| [0005](adr/0005-scale-is-scope.md) | La escala del trabajo es su scope; un proyecto es el grupo de upstream, no `team` | Aceptada |
| [0006](adr/0006-ai-flows-lives-outside-core.md) | `ai-flows` se construye contra el seam HTTP firmado, no adentro del core | Aceptada |
| [0007](adr/0007-observation-captured-not-derived.md) | La observación de un intento se captura al cerrarlo, nunca se deriva después | Aceptada |
| [0008](adr/0008-conformation-is-projected.md) | La conformación del sistema se proyecta desde stores existentes; las carpetas nunca contienen membresía | Aceptada |
| [0009](adr/0009-a-flow-records-who-it-acts-for.md) | Un flow registra el principal para el que actúa; sin `PrincipalType` nuevo | Aceptada |

## Reglas de la casa para estos documentos

1. **Toda afirmación sobre QM cita archivo y línea.** El upstream se mueve a
   diario; una afirmación sin cita ya se pudrió. Los números de línea acá fueron
   leídos en el commit `7f2c916` de `ai-base`.
2. **Leer no es correr — decir cuál.** Las afirmaciones se marcan **[read]**
   (desde el código) o **[ran]** (observado en ejecución). Agregado el
   2026-08-01, después de que la primera pasada de estos documentos, escrita sólo
   leyendo, resultara tener siete errores materiales, dos de los cuales ya se
   habían endurecido en un ADR. La corrección completa está en
   [02-ai-base § Qué cambió al correrlo](02-ai-base.md#qué-cambió-al-correrlo).
3. **Un hueco se dice como hueco.** Si algo no está construido, el documento lo
   dice en presente. Nada de voz aspiracional.
4. **Medido le gana a argumentado.** Cuando un diseño afirma una ventaja, nombra
   la medición que lo falsaría — y prefiere una medición *existente* a una nueva,
   porque una escala inventada es cómo un benchmark termina halagando a su autor.
5. **Reemplazado, nunca reescrito en silencio.** Una decisión que resultó
   apoyarse en una premisa falsa es el registro más útil que puede guardar esta
   organización. Ver [ADR-0002](adr/0002-flow-as-first-class-object.md), intacto y
   marcado.
