<img src="doc/assets/icon.png" alt="" width="76" align="left" hspace="14">

# ai-os

<img src="doc/assets/hero.jpg" alt="" width="100%">

**Un sistema operativo basado en agentes.** Construido sobre
[QM](https://github.com/yc-software/qm), y yendo más allá en cuatro direcciones:
cómo se le da *forma* al trabajo (`ai-flows`), cómo se *ve* el sistema (`ai-ui`),
qué *recuerda* (`ai-storage`), y la base operativa sobre la que todo corre
(`ai-base`).

Es el proyecto principal de Evolving Agents Lab. Todo lo demás en la organización
está congelado — ver [`doc/es/07-freeze-policy.md`](doc/es/07-freeze-policy.md).

**[English](README.md)** · El inglés es la versión canónica de todos los
documentos; ver [Idiomas](#idiomas).

> **`ai-base`, `ai-flows` y `ai-ui` corren — 331 tests propios, arriba de los 3.768 que
> `ai-base` trae de upstream. `ai-storage` no existe.**
> Nada acá describe software que exista salvo que lo diga, y cada captura es de una
> instancia viva.

## Qué hace

<img src="doc/assets/manual/06-system-explorer.jpg" alt="" width="100%">

<sub>Cada nivel del OS, la gente en cada uno, y los agentes que definen — de una instancia viva.</sub>

**Organiza gente y agentes por scope.** Organización, proyectos, grupos, equipos,
individuos. Un proyecto *es* el group scope de upstream con un prefijo reservado y
su roster viene de `ProjectStore` — la membresía nunca se lee de una carpeta, y una
carpeta que parece membresía se reporta como hallazgo.

**Los agentes y subagentes son markdown.** `agents/<nombre>.md` — frontmatter para
descripción y tools, cuerpo para instrucciones, una clave `subagents:` para lo que
compone. El archivo sigue siendo un agente válido y delegable, así que no hay un
segundo registro que mantener sincronizado.

**Ejecuta un árbol declarado como trabajo real.** `POST /flows/from-agent` convierte
`LedgerLead → SchemaAgent, MigrationAgent, ReviewAgent` en un flow y lo ejecuta,
delegando cada paso al archivo de ese agente y entregándole lo que produjeron los
anteriores. `?dryRun=1` muestra el plan primero.

<img src="doc/assets/manual/07-composed-flow.jpg" alt="" width="100%">

<sub>Un flow compuesto a mitad de camino: cada paso es una delegación real.</sub>

**Te podés ir y volver.** Un flow arrancado por un proceso lo termina otro, después
de un reinicio y de una compactación de contexto, sin repetir trabajo que ya estaba
en vuelo.

**Sabés quién hizo qué.** Cada flow registra la persona para la que actúa y corre
como ella, así que el guard de roster se le aplica igual que a esa persona.

## Qué mide

La parte que hace confiable lo de arriba: **el sistema reporta lo que no pudo
contestar** — qué scopes no puede enumerar, qué subagente declarado no tiene
archivo, qué agentes están inertes en el harness que corrés, qué mensajes no puede
atribuir.

Y puede medir si un cambio en los agentes ayudó:

- **¿Un cambio es una mejora?** Mismos escenarios, dos arreglos, verdad de
  referencia computada y no recordada. El chequeo de margen corre primero y solo: si
  la línea base ya contesta todo, el harness dice `NO-HEADROOM` en vez de dejar que
  un empate se lea como hallazgo.
- **¿El revisor que agregaste está ayudando?** Una tasa de acierto no te lo puede
  decir, porque las reparaciones y los daños de un revisor se cancelan adentro. Así
  que cada escenario se puntúa **dos veces** — antes y después del revisor — y la
  transición se clasifica `improved`, `unchanged` o **`reduced`**: una respuesta
  correcta que el revisor volvió incorrecta. Ésa es la forma del
  [estudio g-AMIE](https://arxiv.org/abs/2507.15743) de Google, donde la supervisión
  médica de un agente mejoró el 6,7% de los casos y **redujo la calidad en el 21,7%**.

**Corrido acá, la respuesta fue que nuestras tareas eran demasiado fáciles para
distinguirlo.** Cuatro intentos — aritmética, este código, un prompt más débil, un
modelo más débil — y en todos el productor ya acertaba, así que un revisor no tenía
nada que agregar. Está escrito en [14 · Estudio de revisión](doc/es/14-review-study.md),
incluido un hallazgo que se retiró: reportaba un revisor dañando una respuesta, y
era un artefacto de un check que puntuaba `"The answer is 24."` como incorrecta.

Ése es el punto del instrumento. **Puede decirte que no midió nada.**

## Cómo arrancar

Instrucciones completas con capturas: **[Correr ai-os](doc/es/manual.md)** ·
**[Running ai-os](doc/manual.md)**.

```bash
cd ai-base && ALLOW_UNAUTHENTICATED_CORE=1 node src/index.ts   # el core, :8080
cd ai-flows && node scripts/serve.ts                            # flows + la página de arriba, :8097
cd ai-flows && node scripts/seed-demo.ts                        # un proyecto, un roster, un árbol de agentes
```

Postgres es obligatorio pasado el primer turno — los stores en memoria son por
proceso, así que un flow no puede retomarse de un proceso que terminó.

### El escritorio

<img src="doc/assets/manual/09-desk.jpg" alt="" width="100%">

<sub>Los flows son documentos. Los agentes son cubitos que se apilan encima. Arrastrás uno sobre un documento y ese agente recibe un paso en ese flow — la misma instrucción que habría escrito componer un árbol.</sub>

Las posiciones persisten por scope, así que una disposición sobrevive a recargar.
El sistema propone una a partir del estado del flow y **nunca reacomoda lo que
moviste** — que es toda la dificultad, porque el momento en que quiere re-proponer
suele ser el momento en que lo estás mirando.

Leer el escritorio nunca gasta una llamada al modelo. Agregar un paso y correrlo
son cosas separadas, y correrlo es un click que dice lo que cuesta.

```bash
cd ai-ui && node scripts/serve.ts       # → http://localhost:8098
```

## Lo que no está construido

Ninguna forma de flow más allá de `Open` — sin `Sequence`, `Loop`, `Fan-out`,
`Deliberation`, `Watch`, y sin merge. Sin memoria por scope. `ai-storage` no
existe. Un agente no puede delegar a su propio subagente — ese tope es de upstream
y es deliberado; un árbol declarado es composición que ejecuta la *sesión*,
aplanada.

El canvas está construido pero **sin probar**. Su propia falsificación es un
cronómetro — una persona, un flow de tres días que no corrió ella, canvas contra
transcripción — y eso no se corrió. Hasta que se corra, lo honesto es decir que el
escritorio existe y funciona, no que ayuda.

Milestone por milestone: [08 · Roadmap](doc/es/08-roadmap.md). Documentos de
diseño: [doc/es/](doc/es/).

## Por qué existe

QM resuelve la parte que la mayoría de los proyectos de agentes hace mal: un
harness multi-inquilino real, con identidad por scope, permisos, sandboxes,
auditoría y una capa de modelos intercambiable. 72.000 líneas, en forma de
producción. Reconstruir eso sería un año de trabajo para llegar donde alguien ya
está.

Lo que QM no tiene es una **capa del sistema por encima del turno**. Corre turnos
— una entrada, una respuesta, con crons y triggers para dispararlos. No tiene
noción de una *unidad de trabajo* durable, reanudable e inspeccionable que abarque
muchos turnos, muchos agentes y muchos días. No tiene modelo de memoria más allá
de un markdown con tope por scope. Su interfaz es una ventana de chat con paneles.

Un sistema operativo necesita esas tres cosas. Eso es lo que agrega ai-os.

## Estructura

| Directorio | Qué es | Licencia |
|---|---|---|
| [`doc/`](doc/) | El diseño, en detalle. **Leer esto primero — va por delante del código por construcción.** | Apache 2.0 |
| [`ai-base/`](ai-base/) | QM vendorizado. La base operativa: harness, scopes, sandbox, identidad, política, auditoría. | **MIT** (upstream) |
| [`ai-flows/`](ai-flows/) | Flows: unidades de trabajo declarativas, reanudables, multi-turno. | Apache 2.0 |
| [`ai-ui/`](ai-ui/) | La interfaz a nivel de SO — un canvas inteligente, no un log de chat. | Apache 2.0 |
| [`ai-storage/`](ai-storage/) | Memoria en cuatro niveles: sistema, usuario, proyecto, flow. | Apache 2.0 |

## Licenciamiento en un párrafo

El repositorio es **Apache 2.0**. `ai-base/` sigue siendo **MIT**, porque deriva
de QM y porque mantenerlo MIT es lo que permite mandar parches upstream sin
incompatibilidad de licencias. MIT concede explícitamente `sublicense`, así que la
combinación es sólida; el aviso de copyright original se conserva textual en
[`ai-base/LICENSE`](ai-base/LICENSE) y se atribuye en [`NOTICE`](NOTICE). El
análisis completo, incluido lo que **no** podemos hacer, está en
[`doc/es/06-licensing.md`](doc/es/06-licensing.md).

## Relación con QM

Trabajamos desde una copia, a propósito — ver
[ADR-0001](doc/es/adr/0001-fork-vs-dependency.md). Eso compra control total sobre
la evolución y cuesta la carga de merge para siempre. El vendorizado es un
`git subtree` contra `yc-software/qm@main`, así que upstream sigue siendo
traíble en vez de ser una foto de una sola dirección.

No competimos con QM ni pretendemos estar afiliados. Cuando un cambio corresponde
upstream, va upstream, como texto escrito a mano en su formato `adrs/` — que es lo
que pide su `CONTRIBUTING.md`.

## Idiomas

**El inglés es canónico.** Cada documento tiene su contraparte en español, y
cuando los dos difieren el correcto es el inglés — una traducción que se
desactualizó es peor que no tener traducción, así que la regla queda escrita en
vez de asumida.

| | English | Español |
|---|---|---|
| Este archivo | [`README.md`](README.md) | `README.es.md` |
| Documentos de diseño | [`doc/`](doc/) | [`doc/es/`](doc/es/) |

Un cambio a un documento de diseño no está terminado hasta que su contraparte en
español se mueve con él, en el mismo pull request. Separarlos en dos PRs es cómo
empieza a mentir la copia que nadie revisa.

---

<sub>Evolving Agents Lab · Apache 2.0 · `ai-base/` MIT</sub>
