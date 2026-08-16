# 17 · Nace un proyecto

> **Referencia.** Todo lo de abajo corrió. Los números salen del stack en vivo
> —`make up`, después las rutas del propio escritorio— y todos son del
> 2026-08-15.

Hasta este capítulo ai-os podía *mostrar* proyectos. Cada scope que el escritorio
llegó a mostrar lo había acuñado un script de seed corrido desde una shell, así
que una persona sentada al escritorio podía abrir trabajo que otro empezó y no
podía empezar el suyo. Esa es la diferencia entre un sistema operativo y un
tablero encima de uno.

Este capítulo es la cadena de gestos que la cierra, y los dos sistemas anteriores
que por fin reproduce.

## La cadena, de punta a punta

```
POST /project   ->  group:coclea-sr-from-the-desk-a76a8960-…
POST /agent     ->  agents/DERIVADOR.md, agents/VERIFICADOR-MATH.md
POST /file      ->  COCLEA-SR-SPEC.md, 39485 de 39485 bytes presentes
POST /flows     ->  un documento, gated sobre A01/A08/A12
POST /advance   ->  el agente leyó la spec y contestó desde §0 y §4.5
```

Nada de esa lista es un script. Cada una es una ruta que el escritorio llama, y
cada una tiene un control en la página.

El scope nuevo está deliberadamente **vacío** — sin agentes, sin documentos, sin
layout. Sembrarlo con un flow inicial haría que lo primero que una persona ve sea
algo que no escribió, y el vacío es honesto: el proyecto existe y todavía no pasó
nada en él.

## Los dos almacenes, y el bug que los encontró

`POST /file` estuvo mal primero, y cómo estuvo mal vale más que la ruta.

Escribía por `workspace.write`, releía el archivo por `workspace.read`, y
respondía `201 … bytes: 37691`. El agente al que se le pidió resumir ese archivo
contestó después que no existía. **La ruta había confirmado su propia escritura
con su propio lector**, que no es un chequeo.

Un scope tiene dos almacenes y no son intercambiables:

| almacén | contiene | quién lo lee |
|---|---|---|
| workspace | definiciones de agentes (`agents/*.md`), el espejo de memoria | el core, del lado del host, al cargar un roster |
| sandbox | todo lo que un agente lee o corre | el agente, dentro de su contenedor |

El material ahora va al sandbox y se verifica con `wc -c` corrido **adentro**.
Una escritura que el sandbox no tiene responde `500`, no `201`.

## Un agente es un archivo markdown

`POST /scopes/:id/agents` escribe uno y nada más.
[`ai-flows/src/agent-file.ts`](../../ai-flows/src/agent-file.ts) es el único
renderer —`scripts/seed-cochlea.ts` tenía copia propia— y su test hace round-trip
por **el parser de upstream**, así que una forma que solo acepte nuestro lector no
puede pasar.

El validador estuvo mal en la forma que importa. Restataba los nombres de tools
permitidos como una lista escrita a mano que incluía `search`, que no existe. Un
roster que lo declaraba pasaba la validación, upstream rechazaba después la lista
`tools:` entera, y quedaban instalados dos agentes que **cargaban bien y no tenían
ninguna herramienta** — visible solo como `tools=  ok=false` al lado de seis que
estaban bien. La lista ahora es `CHILD_TOOL_NAMES`, reexportada en vez de
restatada ([`ai-base/AI-OS-PATCHES.md`](../../ai-base/AI-OS-PATCHES.md)), y el test
corre el validador *y* el parser de upstream sobre cada nombre en vez de comparar
dos listas que se habrían dado la razón.

## El movimiento de llmunix: el proyecto escribe su propio roster

[llmunix-marketplace](https://github.com/EvolvingAgentsLabs/llmunix-marketplace)
se construyó alrededor de un gesto: dar un objetivo al kernel y que escriba los
agentes que ese objetivo necesita. Acá no podía funcionar sin un cruce, porque un
agente escribe en su sandbox y el core carga definiciones del workspace.
`POST /scopes/:id/agents/from-sandbox` es ese cruce, y **valida**.

Medido, en el proyecto creado arriba:

```
paso 1   el agente leyó COCLEA-SR-SPEC.md §6.2 y escribió roster.json  -> 8
install  RECHAZADO, nada instalado:
           EXPLORADORES -> unknown tool(s): search. Known: background,
                           execute, history, memory, publish, read, write
           LITERATURA   -> igual
paso 2   el agente editó roster.json desde ese rechazo, con sus palabras:
           EXPLORADORES -> read, write, execute, background
           LITERATURA   -> read, write, memory
install  DERIVADOR CONSTRUCTOR VERIFICADOR-MATH VERIFICADOR-STAT
         EXPLORADORES LITERATURA SINTETIZADOR AUDITOR — todos ok=true
```

No se instala nada si un solo draft no valida. Un roster instalado a medias
porque la cuarta entrada estaba mal formada es un scope cuyos agentes no son los
que nadie aprobó, y ningún paso posterior podría notarlo.

Ese lazo de rechazar-y-reparar es lo que ai-os le agrega a llmunix, que no tenía
nada entre el modelo y el roster.

## El movimiento de skillos: elegir por índice, cargar un cuerpo

[skillos](https://github.com/EvolvingAgentsLabs/skillos) organizaba las skills
`Domain → Family → Skill` con carga perezosa y reclamaba ~61% menos tokens en la
fase de ruteo. **Ese número no se hereda** — se midió sobre otro catálogo, y un
número heredado es un número que nadie chequeó.
[`ai-flows/src/skills.ts`](../../ai-flows/src/skills.ts) lo recomputa sobre el
árbol que haya. Sobre el árbol semilla, en vivo:

```
18 skills · índice 4.397 chars contra 105.423 completos · ahorro 95,8%
```

Para *elegir* una skill un agente necesita cada nombre y una línea; para *usarla*
necesita ese cuerpo y ningún otro. Un test verifica que ningún cuerpo se filtre al
índice, y otro que el ahorro dé casi cero en un catálogo donde no lo hay — la
medición tiene que poder salir mal.

La resolución es solo por coincidencia exacta. Un resolvedor difuso devuelve un
vecino plausible para un nombre que no existe, y el agente sigue entonces las
instrucciones de una skill que no eligió: la única falla que la carga perezosa
introduce y que la carga ansiosa no puede producir.

```
GET /scopes/:id/skills            índice + count + savedFraction + broken
GET /scopes/:id/skills?path=…     el único cuerpo, 404 para un nombre que no está
```

## Memoria que sobrevive la sesión

llmunix la guardaba en `memory/long_term/`; skillos la producía con un pase de
sueño. `ai-memory/` es la mejor forma para eso —seis subagentes de eve, un keeper
que rutea— y **no ejecuta en este workspace**: el mundo local acepta la sesión,
despacha el turno, y el run del turno nunca arranca. Treinta y nueve runs de un
intento anterior seguían en `running` tres días después.
[`ai-flows/src/memory.ts`](../../ai-flows/src/memory.ts) es el mismo trabajo, más
chico, sobre el sustrato que sí corre.

La mecánica es [`wiki.ts`](../../ai-flows/src/wiki.ts), intacta. Lo nuevo es el
mismo cruce otra vez: un agente escribe `notes.json` en su sandbox y el código
decide si eso se convierte en memoria.

`id`, `hash`, `chars` y los offsets de origen se computan del texto citado, nunca
se leen del draft — `wiki.ts` registra dos modelos clasificando bien una misma
entrada mientras uno reportaba un rango de origen que no coincidía con el texto
que había hasheado, y nada se quejó. Por eso un draft lleva una **cita**, que se
localiza en el archivo que menciona. Eso es un chequeo; los offsets solo se pueden
creer.

**El recall estaba roto de la peor forma en que una memoria puede estarlo.** El
pase guardó `ground spring`; una consulta por `ground-spring` devolvió nada
mientras la misma respuesta reportaba `total: 2`. La comparación exacta de
keywords hacía que dos turnos en desacuerdo sobre un guion produjeran "no lo
cubro" sobre algo cubierto. Ahora se pliega a mayúsculas y separadores — no se
lematiza, porque un recall que empareja con todo no decidió nada y no habría forma
de ver cuál de las dos cosas pasó.

```
ground-spring / ground spring / PLACE_CODE  ->  el ADR falsificado
hopf,cochlear-amplifier                     ->  nada, correctamente
```

## Delegación

Un nivel corre, sobre el harness `pi`, y se verificó en vez de suponerse. Un padre
le pasó a un hijo el comando de la suite de gates; el hijo devolvió
`17 passed in 0.45s` y reportó que no podía ver la conversación del padre. Dos
niveles están acotados por construcción —un hijo delegado se construye sin
`runChild`, así que no tiene la tool `delegate`—, que es la forma de upstream y
está registrada en [`ai-base/AI-OS-PATCHES.md`](../../ai-base/AI-OS-PATCHES.md).

## La shape `Gated`, que [16](16-a-workload-with-an-oracle.md) argumentaba

Construida. Un flow gated nombra los chequeos que debe satisfacer y no puede
llegar a `done` mientras uno esté rojo o no se haya corrido nunca:

```
todos los gates verdes    ->  done     | complete
un gate en rojo           ->  blocked  | halted — red: Z99
un gate que nunca corrió  ->  blocked  | halted — never ran: H01, H02
```

Rojo y nunca-corrió se reportan por separado y ninguno se pliega en el otro: que
no haya chequeador no es lo mismo que pasar. Un flow gated con `requiredGates`
vacío se rechaza al crearlo en vez de tratarse como "nada que chequear".

## Lo que no está acá

- **`ai-memory/` sigue sin correr.** El árbol de eve es la mejor arquitectura y
  este capítulo la rodea en vez de arreglarla.
- **Delegación de dos niveles.** Acotada en upstream; no se intentó.
- **Provisionar el código de un proyecto desde el escritorio.** `POST /file`
  escribe un archivo por vez; el código de un proyecto todavía llega por
  `ai-flows/scripts/provision-project.ts`.
- **Correr la suite de gates desde el escritorio en un turno.** La suite completa
  son minutos —`A09` sola pasa los 100 segundos—, así que una demostración en vivo
  usa el subconjunto nombrado en
  [`projects/coclea-sr/CLAUDE.md`](../../projects/coclea-sr/CLAUDE.md): 28
  chequeos en ~1,7 segundos.
