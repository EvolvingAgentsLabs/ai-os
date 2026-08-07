# Correr ai-os — un manual de lo que existe hoy

**[English](../manual.md)** · el inglés es la versión canónica

> **Leé esto primero.** ai-os son cuatro pilares y sólo uno es un producto que
> corre. Este manual documenta **qué arranca de verdad y qué se puede ver de
> verdad**, verificado haciéndolo el 2026-08-06 **[ran]**. Donde una captura
> muestra una funcionalidad, esa funcionalidad corre. Donde este manual dice que
> algo no existe, no existe — ver [§ Lo que no podés correr](#lo-que-no-podés-correr).
>
> **La interfaz web de estas capturas es la de QM, no la nuestra.** `ai-ui` — el
> canvas espacial de [04-ai-ui](04-ai-ui.md) — es una especificación sin código.
> Lo que se ve abajo es `ai-base`, el upstream vendorizado, haciendo su trabajo.

## Qué tenés

| Componente | ¿Corre? | Qué podés hacer con él |
|---|---|---|
| `ai-base` (QM) | **sí** | Superficie de agente completa: chat, proyectos, archivos, crons, memoria, skills |
| `ai-flows` | **en parte** | Dos librerías con CLI — el instrumento de observabilidad y el proyector de conformación. Sin motor de flows |
| `ai-ui` | no | Especificado en [04](04-ai-ui.md). Sin código |
| `ai-storage` | no | Especificado en [05](05-ai-storage.md). Sin código |

---

## Parte 1 · Levantar la plataforma

### Requisitos

- Node 24+ (`ai-base/.node-version` lo fija)
- Un `OPENROUTER_API_KEY` en `ai-base/.env` — el harness por defecto es `pi`, que
  es el que alcanza modelos no-Anthropic
- Postgres es **opcional**. Sin él todo cae a stores en memoria, que alcanza para
  correr y tiene una consecuencia documentada en la Parte 4

### 1.1 El core

El core es una API, no una página web. Rechaza pedidos sin firmar por defecto, así
que una corrida local necesita la salida de emergencia que upstream provee para
exactamente esto (`src/api/server.ts:476`). Ojo con la condición: el flag solo no
alcanza, el signing secret también tiene que estar **ausente**.

```bash
cd ai-os/ai-base
ALLOW_UNAUTHENTICATED_CORE=1 ORG_ID=<tu-org> PORT=8080 \
  HARNESS=pi OPENROUTER_API_KEY=<key> PI_MODEL=<modelo> \
  node src/index.ts
```

Querés ver estas dos líneas:

```
[server] ALLOW_UNAUTHENTICATED_CORE=1 — HTTP ingress is UNAUTHENTICATED (intentionally isolated deployments only).
[qm] listening on :8080 (org=…, store=memory, runStore=memory, workers=16, backgroundWork=true)
```

> **Esto apaga la autenticación.** Es para una laptop y un despliegue aislado. No
> lo hagas en ningún lado alcanzable. Con `CORE_SIGNING_SECRET` seteado, cada
> pedido tiene que llevar una firma HMAC y necesitás el portal para una sesión de
> navegador.

### 1.2 La superficie web

Un **proceso aparte**, en `plugins/web-ui`. Su modo de sign-in lo decide una línea
(`server/index.ts:36`): sin `CORE_SIGNING_SECRET` usa una cookie local y un
formulario de dev; con él, espera el portal y un proveedor de identidad real.

```bash
cd ai-os/ai-base/plugins/web-ui
npm install && npm run build
CORE_API_URL=http://localhost:8080 CORE_ORG_ID=<tu-org> PORT=8096 \
  node server/index.ts
```

```
[web-ui] surface on http://localhost:8096 → core http://localhost:8080 (org …)
[web-ui] WEB_UI_PRINCIPALS unset — any principal id may sign in (dev only)
```

Abrí `http://localhost:8096`, escribí cualquier principal id, y estás adentro.

<img src="../assets/manual/01-chat.jpg" alt="" width="100%">

<sub>Adentro. El banner marrón no te deja olvidar que la instancia está sin autenticar. Modelo y harness se eligen por turno — acá DeepSeek V4 Flash sobre Pi.</sub>

---

## Parte 2 · Los proyectos son group scopes — miralo vos mismo

Ésta es la afirmación sobre la que se apoyan [ADR-0005](adr/0005-scale-is-scope.md)
y [12-conformation](12-conformation.md), y la UI la prueba en su propia barra de
direcciones.

Abrí **Projects → New project**, ponele nombre, y mirá la URL:

<img src="../assets/manual/03-project-scope.jpg" alt="" width="100%">

```
http://localhost:8096/contexts?scope=group%3Aweb-project-2dde0e2d-…
```

Decodificado eso es **`group:web-project-<uuid>`** — un scope `group` con un
prefijo reservado, exactamente como lo construye `projects/project-store.ts:47`. No
hay ningún objeto "proyecto" en ninguna parte. **El roster es el panel de la
derecha** ("People · 1 · OWNER"), servido por `ProjectStore`, y es el *único* lugar
donde vive la membresía.

<img src="../assets/manual/02-projects.jpg" alt="" width="100%">

<sub>Todo proyecto es un scope; "Personal" es tu scope `personal:` con un nombre amable.</sub>

### Un agente es un archivo, y el agente puede escribirlo

Pedile al asistente, dentro de un proyecto, que escriba `agents/reviewer.md`:

<img src="../assets/manual/04-agent-written.jpg" alt="" width="100%">

<sub>Scopeado a "Conformation Demo context" — la escritura cae en el workspace de ese proyecto, no en el tuyo.</sub>

En disco:

```
ai-base/data/workspaces/group__web-project-2dde0e2d-…/agents/reviewer.md
```

Eso es toda la funcionalidad de "carpeta de agentes por proyecto". Es un directorio
en el workspace del scope, y cualquier agente que pueda escribir archivos puede
crear uno.

> **La trampa, y no es chica.** Los agentes markdown definidos en el workspace los
> lee exactamente un llamador en todo el árbol, `pi-tools.ts` **[read]**. En
> `claude` los agentes hijos están hardcodeados; en `codex` y `opencode` la
> delegación pasa dentro de su CLI. **Tu carpeta `agents/` no hace nada en tres de
> cinco harness.**

---

## Parte 3 · El proyector de conformación

Lo único de `ai-flows` que podés apuntar a un sistema real. Contesta *qué forma
tiene este sistema, y quién le habló a quién* — sólo lectura, sin escrituras, sin
tablas.

```bash
cd ai-os/ai-flows
node --env-file-if-exists=../ai-base/.env scripts/conformation-probe.ts --data ../ai-base/data
```

Contra la instancia de la Parte 2:

```
conformation @ 2026-08-06T21:15:09Z  harness=pi  digest=a197a05cbf3dfcbf

project    group:web-project-2dde0e2d-0b07-4554-8bef-353f7c8400e7
  agent  reviewer [read] Reviews a change against project policy.
system     org:evolvingagents
individual personal:matias
  memory MEMORY.md

holes (3) — these are the deliverable:
  [-] Which scopes exist?
  [group:web-project-…] Who is on this project's roster?
  [-] Who has been talking to whom?
```

Flags: `--json` para el documento en vez del renderizado, `--seed` para escribir un
fixture primero, `--converse` para correr dos turnos reales y que el grafo tenga
aristas.

### Los agujeros son el punto

El modo de falla de una proyección es el silencio — una vista que renderiza limpio
porque no preguntó. Así que toda pregunta incontestable se imprime. **Leé los
agujeros primero; son más informativos que el árbol.**

---

## Parte 4 · Lo que dijeron los agujeros, corriéndolo en vivo

Tres hallazgos de la corrida exacta de arriba, y son la razón por la que este
manual vale más que una lista de features.

**El agujero del roster es correcto, y la UI lo prueba.** La captura de la Parte 2
muestra "People · 1 · OWNER". El proyector dice que no puede ver el roster. Las dos
son verdad: con `store=memory` el `ProjectStore` vive *dentro del proceso del core
que corre*, así que un segundo proceso leyendo el mismo `dataDir` ve los archivos
del workspace y nada del estado. **Corré Postgres si querés conformación entre
procesos.**

**Un proyecto puede existir sin workspace alguno.** Inmediatamente después de
crearlo el proyector no podía verlo — el directorio se materializa recién cuando un
turno escribe algo. Enumerar scopes es un hecho de sesión, no de workspace, y
ningún store lo contesta directamente.

**La atribución hubo que reconstruirla.** `meta.author` se escribe desde
`actor.displayName` y desde nada más (`core/orchestrator.ts:2170`), así que los
turnos de una superficie que no provee display name — y **cada respuesta que da el
asistente** — quedan sin atribuir. `ai-flows` lo recupera desde las ventanas de
participante: 4 de 4 en el par medido, con el principal id en vez del display name
([12-conformation](12-conformation.md#atribución-recuperada)).

---

## Lo que no podés correr

Dicho sin vueltas, porque un manual que omite esto es un folleto:

- **No hay motor de flows.** `ai-flows` tiene un flow store, un instrumento de
  observabilidad y este proyector. Un paso que ejecuta como run — todo M2 — no está
  construido ([08-roadmap](08-roadmap.md)).
- **No hay canvas.** `ai-ui` es [04](04-ai-ui.md) y nada más. La UI de este manual
  es la de upstream.
- **No hay memoria por scope.** `ai-storage` es [05](05-ai-storage.md) y nada más.
  La pestaña `Memory` que ves es el `MEMORY.md` plano de QM.
- **Los agentes orquestadores no pueden tener sus propios subagentes.** La
  delegación está topeada a un nivel, a propósito, en una línea
  (`pi-harness.ts:1313-1318`).
- **Los agentes no son principals.** `PrincipalType = "internal" | "guest"`. Un
  agente no puede estar en un roster ni tener permisos propios.

## Apagar todo

```bash
pkill -f "src/index.ts"            # core
pkill -f "web-ui/server/index.ts"  # superficie
```

Los stores en memoria significan que todo salvo los archivos del workspace
desaparece con el proceso. Es una elección de configuración, no un defecto — seteá
`DATABASE_URL` para conservarlo.
