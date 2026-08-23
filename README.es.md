<img src="doc/assets/icon.png" alt="" width="76" align="left" hspace="14">

# ai-os

**¿Otro framework de agentes?** No lo es.

> Todo el mundo puede generar. Casi nadie te puede decir, seis meses después, si
> el número que está en su README sigue siendo el número que produce su código —
> **y probártelo a vos, que sos un desconocido.**

ai-os es la capa que hace que el trabajo de los agentes sea chequeable por algo
que no es otro modelo, y que lo mantiene chequeado. Es **un sistema operativo de
agentes**, construido sobre [QM](https://github.com/yc-software/qm), y la parte de
sistema operativo es el *cómo*; la frase de arriba es el *por qué*.

| | |
|---|---|
| **Verdad de afuera del código** | `truth/` no puede importar `src/`. El valor contra el que chequea un gate **no lo puede producir el código bajo prueba** |
| **Un kernel al que no le importa el lenguaje del trabajo** | Python escribe un reporte de gate en JSON; un kernel en TypeScript parsea, resume y decide, y no ejecuta nada |
| **"No corrió" no es "pasó"** | el veredicto de freeze devuelve `blockers` y `unknown` por separado y se niega ante cualquiera de los dos |
| **Atestación, no afirmación** | corridas direccionadas por contenido, un ledger encadenado por hash, `make reproduce`, y el entorno registrado en el artefacto |
| **Cada número publicado atado a su productor** | cinco de los nueve números de esta página y de `doc/` se chequean contra el artefacto que los produjo, todas las noches |

**La versión fuerte de ese argumento es falsa y fuimos nosotros los que la
medimos.** `physics-verifiers` le dio a un modelo frontier doce resultados de
física fabricados y nueve sutilmente defectuosos. Los cazó **todos, dos veces**
([resultados](https://github.com/EvolvingAgentsLabs/physics-verifiers/blob/main/experiments/judge_vs_physics/RESULTS.md)).
Así que la afirmación es más angosta, y es la parte que sobrevive: **un modelo
puede juzgar una tarea pero no puede generar una con respuesta conocida** — no se
crea verdad afirmándola — y **un juez que acierta siempre igual no te entrega
ledger, ni freeze, ni comando de reproducción.**

**Cuánto vale, medido y no argumentado.** Los checkers se terminaron el 2026-08-23
y los corrió alguien que nunca había corrido este sistema. En un día encontraron
un conteo publicado que estuvo mal en trece lugares durante seis días; un
**reporte atestado que no pudo haber salido del código commiteado al lado**; un
estadístico que se mueve con una versión de biblioteca y no con los datos; una
tabla transpuesta que nadie había comparado con su propio artefacto; y un defecto
en el instrumento nuevo. Ninguno de los dos proyectos se podía arrancar desde su
propia documentación. Nada de eso era alcanzable leyendo —
[19 §7](doc/es/19-what-would-make-this-matter.md#7--qué-encontró-correr-p0-el-mismo-día).

**Y la carga de trabajo que lo hace real.** `projects/coclea-sr` llevó una
hipótesis de biofísica de 1995 desde la matemática, a través de una **falsación de
su propio modelo**, hasta un conjunto gateado de afirmaciones falsables sobre
patologías del oído y su tratamiento — **28 gates / 135 chequeos, todos verdes
[ran]**. El arco completo, y lo que **no** muestra, está en
[doc 18](doc/es/18-from-a-hypothesis-to-a-therapeutic-surface.md).

El trabajo también sobrevive a la conversación: los agentes y sus subagentes son
archivos markdown en la carpeta del propio proyecto, y la interfaz es un
escritorio que acomodás en vez de un log de chat. Toda afirmación sobre si *eso*
ayuda también tiene una medición atrás — incluidas las que volvieron diciendo que
no.

### → **[evolvingagentslabs.github.io](https://evolvingagentslabs.github.io/)** — qué es, y un escritorio que podés usar en el navegador

<a href="https://evolvingagentslabs.github.io/demo/"><img src="doc/assets/manual/09-desk.jpg" alt="El escritorio: flows como documentos, agentes como cubitos apilados encima" width="100%"></a>

<sub><b><a href="https://evolvingagentslabs.github.io/demo/">Probá el escritorio →</a></b> La interfaz real con un backend simulado. Sin instalar nada, sin gastar nada.</sub>

## Correrlo

Tres procesos. El [**manual**](doc/es/manual.md) tiene la secuencia completa con
capturas; la versión corta:

```bash
cd ai-base  && npm ci && node --env-file=.env src/index.ts   # core        :8080
cd ai-flows && node --env-file=../ai-base/.env scripts/serve.ts  # flows   :8097
cd ai-ui    && node scripts/serve.ts                         # escritorio  :8098
```

## Documentación

| | |
|---|---|
| [**Manual**](doc/es/manual.md) | Cómo correrlo, gesto por gesto, con capturas de una instancia viva |
| [**Especificaciones**](doc/es/) | Un documento por pilar y por problema. Son las specs que el código sigue |
| [**Decisiones**](doc/adr/) | Un archivo por decisión de arquitectura, reemplazada y nunca editada |
| [**Próximo**](NEXT.md) | Qué sigue, y cómo volver a levantar el stack |

## Estado

`ai-base`, `ai-flows` y `ai-ui` corren — **626 tests propios**, arriba de los
3.768 que `ai-base` trae de upstream. `ai-storage` está especificado y no
construido, aunque la primera pieza de su argumento ya corre dentro de
`ai-flows`: una base de conocimiento de proyecto que una ventana de ocho mil
tokens puede navegar — un archivo plano del mismo material deja de entrar a las
16 unidades; el índice sigue en 4.523 de 8.000 tokens con 2.000
([05](doc/es/05-ai-storage.md)).

La evidencia de los dos proyectos ahora corre **nightly** en
[`projects.yml`](.github/workflows/projects.yml) — los gates, el ledger, la
higiene de reportes, la reproducción de H0, y cada número publicado chequeado
contra el artefacto del que salió. Hasta el 2026-08-23 no había nada de Python
en CI.

Nada en este repositorio describe software que exista salvo que lo diga, y toda
captura es de una instancia viva.

## Distribución

| | | |
|---|---|---|
| [`ai-base/`](ai-base/) | QM, vendorizado como subtree y traído semanalmente | MIT, de upstream |
| [`ai-flows/`](ai-flows/) | Flows, composición, el instrumental de medición, la base de conocimiento y los [agentes de sistema](ai-flows/agents/system/memory/) | Apache 2.0 |
| [`ai-memory/`](ai-memory/) | Los agentes de memoria, como un árbol que corre como árbol | Apache 2.0 |
| [`ai-ui/`](ai-ui/) | El escritorio | Apache 2.0 |
| [`projects/`](projects/) | Trabajo corriendo **sobre** el sistema. Dos: [`coclea-sr/`](projects/coclea-sr/), Python, **28 gates / 135 chequeos**, y [`hemo-verified/`](projects/hemo-verified/), cuyo gate de muerte sobrevivió con AUC 0.906 | Apache 2.0 |
| `ai-storage/` | No construido | — |

`ai-base/` queda byte a byte igual a upstream. Cualquier cambio ahí necesita una
línea en [`ai-base/AI-OS-PATCHES.md`](ai-base/AI-OS-PATCHES.md), y CI lo exige.
Términos completos: [licencias](doc/es/06-licensing.md).

## Idiomas

El inglés es canónico. Cada documento tiene su espejo en español en
[`doc/es/`](doc/es/); cuando difieren, el correcto es el inglés.

---

El proyecto principal de [Evolving Agents Lab](https://github.com/EvolvingAgentsLabs).
Todo lo demás en la organización está congelado — [por qué](doc/es/07-freeze-policy.md).
