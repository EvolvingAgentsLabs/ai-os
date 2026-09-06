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

**Y el límite honesto de «probártelo a vos, que sos un desconocido», ya que esta
página lo afirma.** Una cadena de hashes dentro de nuestro propio repositorio
demuestra **integridad** — nadie cambió el número después. No demuestra
**verdad**: un 92% calculado por código con un bug tiene integridad
criptográfica perfecta. Lo que acorta la distancia acá no es el hash. Es que el
verificador no puede importar lo que verifica, que el umbral se escribió antes
de la corrida, y que `make reproduce` re-deriva el artefacto en una máquina que
nunca lo vio — que es como `hemo-verified` encontró un número por oráculo que
era una propiedad de su máquina y no de la física. Lo que la *cerraría* es
firmar los reportes de gate como attestations in-toto vía Sigstore hacia un
transparency log, para que un tercero tampoco tenga que confiar en quien
escribió este README. Eso no está construido. Ver
[la capa de evidencia](https://evolvingagentslabs.github.io/#evidence).

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

<a href="https://evolvingagentslabs.github.io/demo/"><img src="doc/assets/manual/09-desk.jpg" alt="Una cuadrícula de cuadrados de color: una fila por flow, de izquierda a derecha el tiempo, y cada cuadrado es un flow en un intervalo de tiempo sostenido por un agente o una persona" width="100%"></a>

<sub><b><a href="https://evolvingagentslabs.github.io/demo/">Abrí el demo →</a></b> <b>Una fila es un flow, de izquierda a derecha es el tiempo, y ahora es el borde derecho.</b> Cada cuadrado es un flow en un intervalo de tiempo sostenido por alguien, así que leer una fila es la secuencia de manos por las que pasó un pensamiento, y leer una columna es quién estaba ocupado en ese momento. <b>El color es quién lo sostuvo</b> — identidad, nunca cómo salió. <b>La textura es qué pasó</b>: sólido llevó algo, tenue no llevó nada, hueco sostenido sin veredicto, punteado no empezó, barrado corrió y no pasó.<br><br><b>Una casilla vacía no es un cero.</b> Un intervalo sin nada anotado no dibuja cuadrado, porque «no se anotó nada» y «no pasó nada» son afirmaciones distintas y sólo una de las dos nos corresponde — una grilla de contribuciones puede usar su verde más pálido para un día tranquilo porque un repositorio sabe lo que no contiene, y esto no lo sabe. Una fila cuyo trabajo sigue más allá del borde lo dice con un chevrón.<br><br><b>Hacé clic en cualquier cuadrado</b> y el panel lo lee, o le pide a un agente que lo lea: cada hallazgo lleva la dirección de lo que leyó, y uno sin dirección no es renderizable. <code>INSPECTOR</code>, un agente de sistema con una sola herramienta (read), se engancha a cualquier flow. <b>Dos movimientos, dos significados.</b> El canvas se desplaza a la izquierda siempre, porque el reloj corre — incondicionalmente cierto. Un cuadrado respira <i>sólo</i> donde hay un paso abierto ahora.<br><br>Alejarse fusiona cuadrados en vez de encogerlos: por debajo de unos nueve píxeles un cuadrado deja de ser algo que se pueda señalar, así que el intervalo se ensancha y el encabezado dice cuánto tiempo cubre ahora un cuadrado. Cuatro scopes, todos reales — <b>coclea-sr</b> (una compuerta que midió 2.592e-4 contra una tolerancia de 1.0e-4), <b>hemo-verified</b> (sin forma cerrada, así que se mide al juez: 0.9056), y dos que cargan un flow verde y equivocado. <b>La orquestación es simulada</b>; los números salen de los artefactos de los proyectos, y <a href="scripts/check-demo-provenance.py"><code>check-demo-provenance.py</code></a> rompe el build si alguno deja de coincidir. Para re-derivarlos vos: <b><a href="https://evolvingagentslabs.github.io/verify/">la página de verificación</a></b>.</sub>

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

Los cuatro pilares ya corren — **851 tests propios**, arriba de los 3.768 que
`ai-base` trae de upstream. `ai-storage` está construido alrededor de un modelo
**local** limitado a 8.192 tokens a propósito: notas con procedencia verificada,
un índice navegable que se niega a renderizar un nodo por encima de su
presupuesto, cinco especialistas, scopes, promoción e historial
([22](doc/22-ai-storage-qwen.md)).

**Su primer benchmark salió en contra del diseño, y se publica porque ésa era la
regla.** En el techo — un navegador perfecto, sin pesos — un archivo de memoria
plano no entra a ningún tamaño (doscientas notas ya son 12.566 tokens contra un
carril de 2.300), y **la búsqueda léxica exacta le gana a la jerarquía para la
que se construyó el componente**: 3/3 contra 1–2/3, leyendo menos para hacerlo.
`doc/05` decía que la carga de la prueba estaba sobre el eje; éste es el segundo
resultado plano en esa dirección. Los confundidos están en
[22 §59](doc/22-ai-storage-qwen.md#59), escritos en vez de ajustados.

El modelo alrededor del cual está construido **no fue verificado como existente**
desde la máquina que escribió esto: cada campo de [`MODEL.json`](MODEL.json) dice
`verified: false`, un test afirma que siguen diciéndolo, y
`ai-storage/scripts/verify-model.ts` es lo único que puede decir otra cosa.

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
| [`ai-storage/`](ai-storage/) | La memoria del modelo local: notas con procedencia verificada, un índice acotado en tokens, cinco especialistas, y el benchmark cuyo primer resultado salió **en contra** del diseño | Apache 2.0 |

`ai-base/` queda byte a byte igual a upstream. Cualquier cambio ahí necesita una
línea en [`ai-base/AI-OS-PATCHES.md`](ai-base/AI-OS-PATCHES.md), y CI lo exige.
Términos completos: [licencias](doc/es/06-licensing.md).

## Idiomas

El inglés es canónico. Cada documento tiene su espejo en español en
[`doc/es/`](doc/es/); cuando difieren, el correcto es el inglés. Esa oración fue
falsa para dos documentos hasta el 2026-08-24, así que ahora
[`check-doc-mirrors.py`](scripts/check-doc-mirrors.py) la chequea, y un documento
deliberadamente sólo en inglés tiene que decir por qué.

---

El proyecto principal de [Evolving Agents Lab](https://github.com/EvolvingAgentsLabs).
Todo lo demás en la organización está congelado — [por qué](doc/es/07-freeze-policy.md).
