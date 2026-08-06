# 08 · Roadmap

<img src="../assets/08-roadmap.jpg" alt="" width="100%">

<sub>Dos milestones sólidos, el resto todavía contornos.</sub>


> **El inglés es canónico.** Traducción de [`doc/08-roadmap.md`](../08-roadmap.md).

Milestones en orden de dependencia. Cada uno declara qué significa "listo" y qué
mostraría que no valía la pena. Sin fechas — las estimaciones de esta organización
no han sido informativas.

## M0 · Fundación — **hecho** (2026-08-01)

Repositorio, licenciamiento, y QM vendorizado como subtree con linaje.

- Apache 2.0 + `NOTICE`, MIT conservado textual en `ai-base/LICENSE`
- `ai-base` = `yc-software/qm@7f2c916`, agregado vía `git subtree` para que
  upstream siga siendo traíble
- Arquitectura verificada contra el código, no contra el README: tres seams
  usables (`MemoryService`, chassis de plugins, `Harness`) y cinco huecos
  confirmados

**Listo significa:** la pregunta de licenciamiento está zanjada por escrito
([06](06-licensing.md)) y cada afirmación sobre QM cita un archivo.

## M1 · ai-base corre localmente — **hecho** (2026-08-01)

Levantarlo llevó menos de una hora. Sin Postgres (stores en memoria), sin paso de
build, y la suite ya estaba verde: **3.712 tests, 3.580 pass, 0 fail**, más un
`tsc --noEmit` limpio.

Turnos reales completados contra `deepseek/deepseek-v4-flash` vía OpenRouter en
`HARNESS=pi` — una respuesta de smoke, una escritura de memoria observada en
disco, y una llamada a herramienta que falló honestamente porque faltaba la imagen
del sandbox.

**Se pagó solo de inmediato.** Se encontraron y corrigieron siete errores
materiales en `doc/` — dos de ellos ya se habían endurecido en
[ADR-0002](adr/0002-flow-as-first-class-object.md), ahora reemplazado por
[ADR-0004](adr/0004-flows-and-the-subagent-record.md). El que vale nombrar: **la
delegación en subagentes y los modelos de OpenRouter viven en conjuntos disjuntos
de harness**, así que modelo barato y multi-agente no se pueden tener juntos.
Ninguna cantidad de lectura sacó eso a la luz; configurarlo sí.

**Ese hallazgo venció el 2026-08-06** — upstream le dio a `pi` delegación mediante
agentes markdown definidos en el workspace mientras conservaba OpenRouter, y la
disyunción desapareció (matriz corregida en
[01-architecture](01-architecture.md#la-matriz-de-capacidades-por-harness)). Vale
dejarlo acá en vez de borrarlo, porque afila la lección de M1 en lugar de
suavizarla: una afirmación **[ran]** sobre una dependencia que se trae cada semana
es una medición con fecha de vencimiento, y ésta ya estaba citada en cuatro
documentos cuando se pudrió. La regla que sale de ahí está en
[12-conformation](12-conformation.md#lo-que-costó-encontrarlo): una afirmación
sobre una capacidad de upstream nombra el archivo y la línea que tendrían que
cambiar para que deje de ser cierta.

**La regla permanente que sale de M1:** las afirmaciones en `doc/` se marcan
**[read]** o **[ran]**. Leer es cómo el flagship anterior llegó a 18.680 líneas
con tres funciones de test.

### Prerequisitos — todos cumplidos (2026-08-01)

- **Docker + imagen de sandbox** — construida (`qm-sandbox-local:latest`,
  1,31 GB). `execute` corre comandos reales, y `/workspace` persiste entre
  sesiones dentro del mismo scope. Ambas cosas verificadas.
- **Un cliente de requests firmadas.** HMAC-SHA256 sobre
  `v0:{segundos-unix}:{MÉTODO}\n{path}\n{body}`, ventana de replay de cinco
  minutos.

**Un costo que hay que planificar:** la imagen del sandbox es `linux/amd64`, así
que en Apple Silicon cada llamada a herramienta va emulada — ~47 s en frío, ~25 s
en caliente, contra ~4 s para un turno sin herramientas. El ciclo de iteración de
M2 es entonces de minutos por vuelta. O se presupuesta, o se construye una imagen
arm64 primero; no descubrirlo a mitad del milestone.

## M2 · El primer flow — **no arrancado, y lo que justifica el repositorio**

El `ai-flows` más chico y honesto: **una forma (`Open`), persistida, reanudable.**

1. Tablas `flow_`; un registro de flow con objetivo, estado, pasos
2. El intento de un paso ejecuta como un run existente (`ai-base/src/runs/`),
   reutilizando `src/core/turn-resume.ts` para recuperación ante caída dentro de
   un intento
3. Un flow sobrevive al reinicio del proceso y a la compactación de contexto
4. `forkedFrom { flowId, atStep }` registrado desde el primer commit — el hueco de
   las sesiones de upstream no se reproduce acá
5. Rutas de API para crear / avanzar / inspeccionar
6. **Completa sin subagentes y sin filas de tasks**
   ([ADR-0004](adr/0004-flows-and-the-subagent-record.md)) — el harness que hace
   cumplir esto ahora es `mock`, no `pi`; `pi` ganó delegación el 2026-08-06. El
   entregable no cambia: un flow que necesita hijos para terminar es un flow que no
   termina en todos lados
7. **Una observación por intento, capturada al cerrarlo**
   ([ADR-0007](adr/0007-observation-captured-not-derived.md)) — no un agregado a
   M2 sino el instrumento que la propia falsación de M2 ya exige. Sin él la
   comparación de §Cómo se falsifica es una anécdota, y la telemetría de upstream
   se borra una hora después del intento que la produjo

**Un número que M2 debía, ya pagado.** δ — la tasa a la que trabajo idéntico
produce estado distinto — es **0% sobre texto normalizado y 21.1% sobre el crudo**,
medido en `pi` / `deepseek-v4-flash` a lo largo de 22 turnos **[ran]**
([10 § Qué se midió](10-observability.md)). Toda afirmación del tipo "el flow
conservó su trabajo y la sesión lo perdió" es una afirmación de que dos estados
difieren, y vale lo que vale el instrumento que la hace. La tarde que costó no
invalidó la maquinaria de deriva — la corrigió: `digestOf` ahora normaliza, porque
los bytes crudos cargaban 21% de ruido a cambio de nada.

Fuera de M2: formas más allá de `Open`, merge, canvas, memoria nueva.

**Listo significa:** un flow arrancado un lunes se reanuda el miércoles, después
de un reinicio, con su estado intacto — **tanto en `pi` como en un harness con
CLI.** Probarlo en uno solo afinaría el diseño al que haya quedado configurado esa
semana.

**Se falsifica con:** una sesión común de QM haciendo lo mismo. Ver
[03](03-ai-flows.md#cómo-se-falsifica). Es el pilar que obliga al fork, así que
carga la mayor exigencia de prueba.

## M3 · Diff de flows — **no arrancado**

Bifurcar un flow, correr ambos, diffearlos: pasos que divergieron, artefactos que
difieren, conclusiones que chocan.

**Listo significa:** `diff` sobre dos flows bifurcados devuelve algo que una
persona usa para decidir qué rama conservar.

El diff se sostiene solo y sale antes que el merge. Si el merge nunca ocurre, esto
sigue siendo lo más útil de `ai-flows`.

## M4 · ai-storage v1 — **no arrancado**

Cuatro niveles detrás del `MemoryService` de QM, recall ordenado por nivel,
promoción explícita. **Sin embeddings.** ([05](05-ai-storage.md))

**Listo significa:** se agrega una estrategia por niveles al harness **existente**
(`npm run bench:memory`, `src/memory/bench.ts`) y la puntúa el mismo juez que a
las tres de upstream — `staleness` primero, `signalToNoise` e
`inferenceVsObservation` como guardas. **El número se publica salga como salga.**

**Se falsifica con:** ninguna reducción de `staleness` contra el baseline del
archivo plano. Esa es la afirmación para la que existen los cuatro niveles; sin
ella gana el archivo plano de upstream y este pilar se descarta.

## M5 · ai-ui v1 — **no arrancado**

Un flow corriendo en un canvas, vivo, con layout persistido, como quinto plugin
sobre el chassis existente. ([04](04-ai-ui.md))

**Listo significa:** se corre y se reporta la prueba del cronómetro — estado de un
flow de 3 días, canvas contra transcripción.

**Depende de M2:** no hay nada que renderizar hasta que existan los flows.
Construir el canvas primero sería construir una interfaz para un sistema que no
tiene estado que proyectar.

## M6 · Formas de flow — **no arrancado**

`Sequence`, `Loop`, `Fan-out`, `Deliberation`, `Watch` — cada una se agrega sólo
cuando una pieza de trabajo real la necesita, con promoción desde `Open`.

## M7 · Merge de flows — **bloqueado en M3, y honestamente difícil**

Volver a unir un flow bifurcado. Artefactos distintos en archivos distintos es
mecánico. **Dos conclusiones distintas sobre el mismo archivo es el problema
abierto**, y necesita un reconciliador, no un merge de texto.

Sin agendar. Se vuelve tratable cuando M3 haya producido diffs reales para mirar —
el modelo de conflicto debería derivarse de divergencias reales, no diseñarse
antes.

## Upstream, en paralelo

No es un milestone; es continuo.

- **Semanal:** `git subtree pull` desde `yc-software/qm@main`
- **Primera propuesta a enviar:** registrar `forkedFrom { sessionId, upToSeq }` en
  el fork de sesión. Chica, autocontenida, útil para ellos sin nosotros. Texto
  escrito a mano en su formato `adrs/`, como pide su `CONTRIBUTING.md` — no un PR
  generado.

## Congelado, en paralelo

[07](07-freeze-policy.md). **Hecho el 2026-08-01:** 26 de 29 repos archivados. A
`evolving-agents` se le corrigieron el README y el `PLAN.md` antes de archivar,
porque 452 estrellas es la única distribución real que tiene el proyecto nuevo.

## Deliberadamente fuera del plan

**Un harness nuevo.** Upstream trae seis. Si falta un modelo, se agrega allá.

**Reemplazar `web-ui`.** `ai-ui` es un quinto plugin. Correr las dos es lo que
hace posible comparar el canvas en vez de afirmarlo.

**Un runtime de workflows general.** `ai-flows` secuencia *trabajo de agentes*. En
el momento en que empiece a acumular ejecución de código arbitrario, reintentos
con backoff y un DSL, se convirtió en Airflow, y Airflow ya existe.

**Reimplementar cualquier cosa de `ai-base`.** Identidad, ACL, sandbox,
credenciales, política, auditoría. Querer cambiar una es evidencia de que el
diseño de arriba está mal.
