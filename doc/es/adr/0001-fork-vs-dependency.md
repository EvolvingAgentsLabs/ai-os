# ADR-0001 · Vendorizar QM como subtree en vez de depender de `@yc-software/qm`

> **El inglés es canónico.** Traducción de
> [`doc/adr/0001-fork-vs-dependency.md`](../../adr/0001-fork-vs-dependency.md).

- **Fecha:** 2026-08-01
- **Estado:** Aceptada
- **Decidido por:** Matias Molinas

## Contexto

ai-os se construye sobre QM. QM ofrece dos modelos de consumo:

1. **El previsto.** Un repositorio de deployment que depende del paquete npm
   `@yc-software/qm` y cablea los sustratos en un archivo (`src/wiring.ts`, 1.427
   líneas). El código específico de la empresa vive fuera del core.
2. **Una copia.** Vendorizar el fuente y evolucionarlo.

La opción 1 está genuinamente bien construida. Seams verificados: `MemoryService`
(`src/memory/memory-service.ts:28`), el chassis de plugins (`plugins/chassis`, los
plugins nunca importan el core), y `Harness` (`src/harness/harness.ts:167`). Dos
de nuestros cuatro pilares — `ai-storage` y `ai-ui` — entran por esos seams **sin
modificar el core en absoluto**.

El tercero no. `ai-flows` necesita tablas nuevas, un servicio nuevo dentro del
core y rutas nuevas; no hay motor de workflows para extender (`src/processes/` es
reaping de procesos del sandbox, no workflow). `ai-storage` además necesita dos
miembros nuevos en una unión cerrada (`src/types.ts:12`).

QM tiene 3 días, ~72.000 líneas, publica a diario, 3.473 estrellas y subiendo.

### Una tercera opción, encontrada después

QM trae un **modelo de fork privado oficialmente soportado** — descubierto durante
el vendorizado, no en el README. `ai-base/deploy/layers/README.md` y tres skills
de Claude Code incluidas (`.claude/skills/update-qm`, `upstream-pr`,
`dev-instance`) lo definen:

> un repositorio privado autónomo cuya historia empieza como un clon de qm, en el
> que el core queda idéntico a upstream y todo lo específico de la organización se
> confina acá, bajo `deploy/layers/<org>/`

con `update-qm` mergeando upstream hacia adentro (**mergear, nunca rebasear** —
`origin/main` es historia publicada) y `upstream-pr` limpiando el contexto de
organización en la salida.

Esto es mejor de lo que suponíamos y cambia el encuadre honesto de este ADR: no
elegimos entre "su forma" y "un fork", elegimos **cuál fork**. Pero el límite de
layers cubre material de *deployment* — configuración, herramientas de sandbox,
imágenes de plugins de la organización, infraestructura. No acomoda un servicio
nuevo del core. `ai-flows` aterriza en `src/`, que su modelo exige que quede
idéntico a upstream. Así que la divergencia es real bajo cualquiera de las dos
opciones.

Dos consecuencias que adoptamos igual:

- `ai-ui` es un **plugin de organización**, y
  `deploy/layers/evolvingagents/plugins/` es su lugar sancionado.
- El material de deployment de ai-os va en `deploy/layers/evolvingagents/`,
  generado con `qm init`, no armado a mano.

## Decisión

**Vendorizar QM en `ai-base/` vía `git subtree`**, siguiendo
`yc-software/qm@main`, con pull semanal usando `--squash`.

## Consecuencias

**Aceptamos:**

- **Carga de merge para siempre.** Un upstream que se mueve a diario y un core
  divergente implica resolución periódica de conflictos. Es el precio real y no es
  chico.
- **No somos un deployment de QM.** No obtenemos gratis su camino de tooling de
  deployment, y `qm init` no es nuestra historia de instalación.
- **Su tooling de fork no funciona tal como viene.** `update-qm` y `upstream-pr`
  asumen que la *raíz* del repositorio es qm y despachan según `git remote -v`.
  Bajo un subtree, la raíz de qm es `ai-base/` y nuestro remoto no es un fork de
  qm, así que ambas skills leen mal la situación. Usamos `git subtree pull` y
  seguimos **a mano la disciplina de limpieza** de `upstream-pr` — su advertencia
  de que un push a upstream es permanente y alcanzable por SHA incluso tras un
  force-push nos aplica exactamente igual.

**Ganamos:**

- Control total sobre la evolución, que era el requisito explícito.
- La posibilidad de cortar dentro del core para `ai-flows` sin negociar un diseño
  con un upstream que recibe contribuciones como prosa escrita a mano y se mueve a
  diario.
- Un remoto upstream real: `git subtree pull` es un merge genuino, no una
  redescarga, así que esto no es una foto de una sola dirección.

**Mitigamos:**

- **Regla de diff mínimo.** Todo lo construible contra un seam se construye contra
  el seam, incluso cuando editar el core sea más rápido. Cada línea en
  `ai-base/src/` se mergea a mano para siempre.
- **`ai-base/AI-OS-PATCHES.md`** registra cada modificación: qué, por qué, si es
  upstreameable. Es el mapa de resolución de conflictos al momento del pull.
- **Sólo tablas nuevas, con prefijo `flow_`.** Nunca alterar una tabla de upstream.
- **Mandar upstream lo que corresponde**, como texto escrito a mano en su formato
  `adrs/`. Primer candidato: el linaje del fork de sesión.
- **La salida queda abierta.** Si las modificaciones al core se reducen hacia
  cero, convertirse en un repositorio de deployment (opción 1) es una opción viva
  — registrada en
  [06-licensing](../06-licensing.md#si-alguna-vez-queremos-dejar-de-ser-un-fork).

## Alternativas rechazadas

**Repositorio de deployment (opción 1).** Rechazada porque `ai-flows` no se puede
construir a través de los seams, y es el pilar que justifica el proyecto.
Reconsiderar si eso deja de ser cierto.

**Fork duro, sin seguimiento de upstream.** Rechazada: convierte una base de 3
días y movimiento rápido en una foto muerta en semanas, y renuncia al trabajo de
upstream sin ganar nada frente a un subtree.

**Contribuir `ai-flows` upstream en vez de esto.** No rechazada — diferida. No se
puede proponer hasta que exista y se muestre que funciona, y su proceso de
contribución es primero-prosa justamente por eso. Si más adelante lo quieren, es
un buen desenlace.

**El propio modelo de fork privado de QM** (clon en la raíz del repositorio,
material de organización en `deploy/layers/<org>/`, sync con `update-qm`).
Genuinamente atractivo: está soportado, tiene tooling, y upstream lo mantiene
funcionando. Rechazada por una razón — pone a qm en la raíz del repositorio, así
que `ai-flows`, `ai-ui`, `ai-storage` y `doc` pasan a ser subdirectorios de QM en
vez de pares suyos. Eso invierte lo que ai-os es: la base sería el proyecto y
nuestros cuatro pilares su personalización.

**Es la decisión más ajustada de este ADR y la más probable de revisarse.** Si la
divergencia del core se mantiene chica, su modelo es mejor que el nuestro y cambiar
cuesta mover un repositorio. Reevaluar en [M2](../08-roadmap.md), cuando se
conozca el tamaño real de la huella de `ai-flows` en el core en vez de estimarlo.
