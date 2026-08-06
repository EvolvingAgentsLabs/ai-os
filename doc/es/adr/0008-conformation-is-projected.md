# ADR-0008 · La conformación del sistema se proyecta, nunca se guarda

- **Fecha:** 2026-08-06
- **Estado:** Aceptado

## Contexto

A un OS de agentes se le pide organizar el trabajo de equipos e individuos en
proyectos, y se espera que un proyecto lleve directorios de sistema como Windows
lleva una carpeta de sistema o un repositorio lleva un `.git`: un lugar para sus
usuarios, para sus agentes principales, y bajo cada orquestador un lugar para sus
subagentes. El OS a su vez debe llevar los propios — usuarios de sistema, agentes
de sistema, un repositorio de agentes orquestadores. Y la comunicación entre todos
esos actores debe ser visible y analizable.

Contrastar esto contra la base devolvió un resultado que reformula el pedido. Seis
de las siete estructuras ya están construidas, y la séptima es la única que falta
**[read]**:

- El workspace por capas *es* la estructura de carpetas —
  `resolution/resolution-service.ts:37-45` monta `global/` (el scope de la org,
  sólo lectura, en todos los scopes) y el scope de la conversación en
  lectura-escritura, con `agents/`, `skills/`, `memory/` reservados adentro.
  `WorkspaceLayer` es `{ scopeId, mountPath, mode }` (`types.ts:108`).
- Un proyecto es `group:web-project-<id>` con un `ProjectStore` rosterizado
  (`projects/project-store.ts:47`), según [ADR-0005](0005-scale-is-scope.md).
- Un agente es `agents/<name>.md` — frontmatter e instrucciones, parseado por
  `parseAgentDefinition` y delegado desde `pi-tools.ts:2444`.
- La delegación existe en el harness por defecto y se acota sola a un nivel, en una
  línea, `pi-harness.ts:1313-1318`.
- El sustrato de comunicación es durable: los registros de sesión llevan `kind`,
  `author`, `scopeLabel`, `overheard`.
- **Nada proyecta nada de eso.** No hay forma de ver qué scopes existen, qué
  agentes define un proyecto, quién está en su roster, ni quién le habló a quién.

Tres hechos más pesan sobre la decisión, todos **[read]**:

- `global/agents/*.md` está montado en todos los scopes y es **inalcanzable**:
  `agentDefinitionPath` produce `agents/<name>.md` e `isSafeSkillName` prohíbe `/`,
  así que ningún nombre resuelve dentro del montaje `global`.
- `parseAgentDefinition` tiene exactamente un llamador, `pi-tools.ts`. Los agentes
  definidos en el workspace son una capacidad de `pi`; `claude` hardcodea tres
  (`claude-harness.ts:341`) y `codex` / `opencode` delegan dentro de su CLI.
- `PrincipalType = "internal" | "guest"` (`types.ts:3`). No hay principal-agente.

## Decisión

**La conformación del sistema — sus scopes, proyectos, rosters, agentes y la
comunicación entre actores — es una proyección de sólo lectura sobre stores que ya
existen. ai-os no agrega ningún directorio, ningún archivo de membresía y ningún
bus de mensajes.**

Concretamente:

1. **Las carpetas de un scope contienen agentes, skills, artefactos y memoria.
   Nunca contienen membresía.** Los rosters se leen de `ProjectStore` y del
   directorio al momento de proyectar.
2. **El proyector es `ai-flows/src/conformation.ts`** — sin tablas nuevas, sin
   scope kinds nuevos, sin ruta nueva, sin escrituras. Reporta agujeros donde el
   dato no existe en vez de omitirlos.
3. **El grafo de comunicación se reconstruye desde el registro de sesión**, y desde
   nada más. `AuditLog` (en memoria, tope 50.000, `audit/audit-log.ts`) y
   `run_activity` (barrido por TTL, `postgres-run-activity-store.ts:30`) quedan
   excluidos por nombre, porque los dos darían un grafo que pierde registros en
   silencio.
4. **El análisis del grafo reutiliza `observability.ts`** — el instrumento δ y su
   piso de ruido medido — en vez de introducir un segundo analizador.
5. **Alcanzar `global/agents/` se propone upstream, no se parchea acá.** Es una
   feature coherente de upstream, y el ensanchamiento es un fallback de resolución
   de nombres, no un asunto de ai-os.
6. **La delegación de profundidad 2 y un tipo de principal-agente quedan
   diferidos**, cada uno con la condición de abajo que lo reabre.

## Alternativas rechazadas

**Una carpeta `users/` dentro de cada proyecto.** Es la forma literal del pedido y
es el mismo objeto que [ADR-0005](0005-scale-is-scope.md) rechazó como
`participants[]`, una capa más abajo: una ACL que ninguna función de ACL lee.
Diverge del roster en el instante en que alguien es removido, y upstream ya rechaza
trabajo en vuelo cuando la versión del roster se mueve
(`app-turn.ts:102-106,337`) — así que la carpeta sería una respuesta de membresía
que no sólo está vieja sino contradicha por un chequeo que está corriendo
activamente. El precedente no es hipotético: el único fail-open que esta
organización encontró estaba en un fall-through, no en una función de permisos.

**Una jerarquía de carpetas nueva diseñada de antemano y después poblada.**
Rechazada por secuencia, no por mérito. Seis de siete estructuras ya existen; una
jerarquía diseñada antes de que alguien haya visto esas seis quedaría especificada
por analogía a Windows y a `.git` en vez de por evidencia. El proyector cuesta una
tarde y devuelve la especificación como sus agujeros. Si vuelve completo, la
jerarquía nunca hizo falta — que es un resultado que ninguna cantidad de diseño
produce.

**Un subsistema de mensajería para la comunicación actor-a-actor.** Rechazado: el
registro de sesión ya es durable, ya está scopeado como lo están los permisos, y ya
se escribe en cada turno. Un bus sería una segunda copia de un registro que existe,
con su propia política de retención para equivocar.

**Levantar el tope de delegación ahora.** Rechazado por prematuro, no por
equivocado. El hijo ya comparte el workspace del padre, así que ya ve el mismo
directorio `agents/` — la carpeta de subagentes existe; sólo la recursión está
negada. Levantarlo es un argumento (`runChild` al conjunto de tools del hijo) con
una consecuencia no acotada, y hacerlo dentro de un fork de una dependencia que se
trae cada semana es cómo un fork deja de ser mergeable.

**Un principal-agente por suplantación.** Rechazado de plano, y aparte del
diferimiento de abajo. Un agente actuando como principal humano vuelve *quién hizo
esto* permanentemente incontestable, retroactivamente, en todo registro de
auditoría. Si un agente va a tener privilegios, los tiene como sí mismo.

## Consecuencias

- **Ganancia: cero superficie de permisos nueva, otra vez.** Toda pregunta que el
  proyector contesta la contesta un store que ya hace cumplir su propio acceso, y
  el proyector no agrega ningún camino por el cual un hecho llegue a un lector que
  no pudiera alcanzarlo ya.
- **Costo: el proyector es tan completo como legible sea la base.** Dos pérdidas
  conocidas que debe reportar en vez de tapar: `pi` no escribe filas en `tasks`,
  así que la delegación en el harness por defecto no deja rastro durable más allá
  del reporte del hijo; y los agentes definidos en el workspace son inertes en tres
  de cinco harness, así que la carpeta `agents/` de un proyecto no hace nada bajo
  `claude` / `codex` / `opencode`.
- **Riesgo: una proyección engaña exactamente donde calla.** De ahí el requisito de
  que los agujeros sean salida y no omisión. Una vista de conformación que
  renderiza limpio porque no preguntó es peor que ninguna vista.
- **Falsación, fijada antes de correr:** si la salida del proyector alcanza para
  que una persona entienda y dirija el sistema, **no se envía ninguna carpeta
  nueva** y [12-conformation](../12-conformation.md) colapsa en una sección de
  [09-scales](../09-scales.md). Si no alcanza, cada carpeta nueva llega nombrada
  por el agujero que llena.
- **Condición que reabre profundidad 2:** un trabajo real donde el hijo de un
  orquestador deba a su vez delegar, y que no pueda resolverse con el padre
  delegando dos veces. Hasta que exista uno, el árbol plano no es una limitación
  que nadie haya tocado.
- **Condición que reabre el principal-agente:** un agente que deba aparecer en un
  roster, tener memoria que ningún humano posee, o ser denegado por ACL. Las tres
  son salida del proyector, así que esto lo decide el proyector y no un argumento.
- **Test que lo hace cumplir:** el proyector no realiza escrituras y no declara
  ningún scope kind. Si alguna vez necesita persistir un hecho para contestar una
  pregunta sobre conformación, ese hecho le pertenece a un store que ya existe, y
  este ADR necesita revisión en vez de flexión callada.
