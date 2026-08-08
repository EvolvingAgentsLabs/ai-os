# 13 · Degradación — por qué un sistema bien configurado deja de estar bien

<img src="../assets/13-degradation.jpg" alt="" width="100%">

<sub>Un paso de revisión que corre, reporta y no aporta nada.</sub>

> **El inglés es canónico.** Traducción de [`doc/13-degradation.md`](../13-degradation.md).
>
> **Estado: un modo de falla documentado, una medición propia, y una señal
> candidata construida y falsificada.** ai-os sigue sin poder notar un paso que no
> contribuyó. Este documento nombra ese hueco y registra lo ya intentado — ver
> § Se construyó, se corrió, y no funciona.

Todo lo demás en `doc/` pregunta si un diseño vale la pena construirse. Este
pregunta otra cosa: **una vez corriendo, ¿cómo se enteraría alguien de que dejó de
ser bueno?**

La respuesta hoy es que no se enteraría. ai-os puede decir si un flow se *mueve*
([10-observability](10-observability.md), δ medido). No tiene ningún instrumento
para si el trabajo *está empeorando*. Son fallas distintas, y la segunda es más
silenciosa.

## El caso: supervisión que no ayudó

Google DeepMind / Google Research, *Towards physician-centered oversight of
conversational diagnostic AI* ([arXiv:2507.15743](https://arxiv.org/abs/2507.15743)).
Un OSCE virtual aleatorizado y ciego sobre **60 escenarios**. Un agente, g-AMIE,
hacía la anamnesis y proponía un diagnóstico diferencial y un plan; después un
médico de atención primaria supervisor revisaba y podía editar ambos antes de que
se emitiera nada. Human-in-the-loop bien hecho: el humano tiene la última palabra,
ve todo, y puede cambiar cualquier cosa.

El hallazgo, citado exacto **[read]**:

> "in 93.3% of scenarios, edits did not improve (in 21.7% edits reduced)
> diagnostic quality"

Que se descompone en:

| ediciones del médico | proporción de escenarios |
|---|---:|
| mejoraron la calidad diagnóstica | **6,7%** |
| no cambiaron nada | 71,6% |
| **redujeron** la calidad diagnóstica | **21,7%** |

### Lo que esto NO dice

No es *"la revisión humana empeora la salida de la IA"*, y leerlo así tira la parte
más útil. El mismo paper reporta la misma medida para los brazos humanos de
control: las ediciones no mejoraron el **80%** de los casos g-PCP y el **83,3%** de
los g-NP/PA — o sea que la supervisión mejoró cerca del 20% y del 17% del trabajo
*humano* contra el 6,7% del agente.

La asimetría es el hallazgo. **La supervisión aportó menos donde la salida ya era
fuerte**, y donde actuó, restó casi tanto como sumó. El paso de revisión no era
inútil en principio; se aplicó a algo que ya tenía muy poco margen, por un revisor
cuyo juicio valía menos en ese margen particular que la cosa revisada.

## La misma forma, en nuestro propio sistema, medida hoy

El 2026-08-07 un flow compuesto corrió tres agentes de proyecto en secuencia:
`SchemaAgent → MigrationAgent → ReviewAgent`. Todos los pasos completaron. El flow
llegó a `done`. La página renderizó en verde.

`ReviewAgent` devolvió **[ran]**:

> "There are no files in the workspace to review. There is no change visible, so I
> cannot point to any defect on any line."

Tenía razón, y era inútil. Cada delegación arrancaba con contexto aislado, así que
el revisor nunca vio el esquema que propuso el primer paso. **Un paso de revisión
corrió, reportó limpio y no aportó nada — mientras cada señal que el sistema tenía
decía que el flow había salido bien.**

Los mismos agentes, el mismo objetivo, después de que cada paso recibiera los
resultados de los anteriores:

> "**Defect 1 — Line 4:** `NULL` on the `currency` column violates the invariant
> that every ledger must have a well-defined currency."

Nada de la *configuración* cambió entre esas dos corridas. Los agentes, su
markdown, su árbol declarado, las tools que tenían — idénticos. Lo que cambió fue
una propiedad de la **ejecución**: qué podía ver cada paso.

Ese par de citas es todo el argumento de este documento. **Una configuración que
parece óptima en el papel no es evidencia sobre el sistema que corre.** La primera
corrida no era un bug que alguien fuera a reportar: terminó, fue rápida, y todos
los chequeos pasaron.

## Qué necesitaría ai-os para notarlo

Siendo preciso sobre el hueco, porque "los agentes deberían adaptarse" es un deseo
hasta que nombra una señal:

**Lo que existe.** `observabilityOf` contesta *¿este flow se sigue moviendo?* desde
los digests de intentos, contra un piso de ruido medido
([10-observability](10-observability.md)). Habría llamado `progressing` a las dos
corridas de arriba. Y no se equivoca — se movían.

**Lo que no existe, de más barato a más caro:**

1. **La contribución de un paso.** En la corrida fallida, la salida de
   `ReviewAgent` era casi idéntica en contenido informativo a no tener paso. Un
   paso cuyo digest de observación no te dice nada que no tuvieras ya del paso
   anterior es un paso que no contribuyó — y `digestOf` ya es el instrumento que
   podría decirlo. **Éste es el barato, y no está construido.**
2. **Margen, antes de agregar supervisión.** El resultado de g-AMIE es la versión
   clínica de una regla que este repositorio ya tuvo que aprender: **chequear el
   margen antes de construir el tratamiento**. Su propio benchmark de memoria sacó
   10/10 en el baseline y su suite de física pasó 12/12 — en ambos todos los brazos
   empataron en el techo y el empate se leyó como éxito
   ([08 § M4](08-roadmap.md)). Un paso de revisión agregado a trabajo que ya está
   bien, en el mejor caso, no hará nada.
3. **Si una intervención ayudó.** El paper pudo calcularlo porque tenía un
   evaluador con verdad de referencia. ai-os no lo tiene para trabajo general, e
   inventarlo es el camino caro — por eso (1) va primero.

## Hacia dónde apunta, y cómo se falsifica

La dirección es la que sugiere el caso: **un sistema de agentes debería poder
reportar sobre su propia ejecución, no sólo producir salida** — un paso que avisa
"no me dieron nada con qué trabajar" vale más que uno que contesta igual en
silencio. El árbol declarado ([12-conformation](12-conformation.md)) es la
configuración; este documento es sobre la distancia entre eso y lo que pasa.

Pero la afirmación tiene que ser falsificable o es un eslogan:

> **Falsación, escrita antes de construirlo.** Construir (1) — marcar un paso cuya
> observación no agrega nada sobre la del anterior — y correrlo sobre flows reales.
> Si se dispara en corridas que estaban genuinamente bien tan seguido como en las
> que no, es ruido y hay que borrarlo en vez de afinarlo. Si nunca se dispara, el
> modo de falla de arriba fue un caso aislado y este documento es una anécdota.

## Se construyó, se corrió, y no funciona — 2026-08-07 [ran]

`ai-flows/src/contribution.ts`. La comparación de digests que este documento
proponía originalmente se abandonó en una función: la falla real produjo texto
*distinto* al de su predecesor, así que la igualdad de digests atrapa un paso que
se repitió y no uno que ignoró su entrada. El reemplazo mide **cuánto del
contenido distintivo del predecesor llevó el paso a su propia salida** — llevar
cero significa que el paso no usó nada de lo que le dieron.

Contra las dos corridas citadas arriba separa perfecto: la ignorada lleva
**0,00**, la que se involucró **0,21**, compartiendo `currency` y `ledger`.

Contra la base real no se dispara con nada. **18 flows, 9 comparaciones
juzgables, 0 marcadas.** Incluidas — y éste es el resultado — las dos corridas
para las que fue construido:

| flow | carried | qué compartió | veredicto |
|---|---:|---|---|
| `a7bc98a3` paso 2 | 0,20 | migration, table, ledger, column, currency | `used-input`, y con justicia: ese paso sí comentó la propuesta después de decir que no había archivos |
| `25cb60f5` paso 2 | **0,03** | **`review`** — una palabra incidental | `used-input` |

El segundo es la falla. Una sola palabra compartida por casualidad libra una regla
que sólo dispara en cero exacto, y la salida real nunca es cero exacto.

**El umbral no se va a bajar hasta que atrape ese caso.** Mover un corte hasta que
el ejemplo malo conocido caiga del lado correcto es ajustar el instrumento a la
respuesta, y este repositorio ya registró lo que eso cuesta — *contar los
rediseños: aceptable una vez, sospechoso dos, y a la tercera está buscando el
resultado en vez de medirlo*. Un ejemplo etiquetado no es un set de calibración.

### Qué dice de verdad el resultado negativo

Dos cosas, y la segunda es más útil que lo que la señal hubiera dado.

**Un solapamiento de contenido por pares es el instrumento equivocado.** No puede
separar "usó su entrada" de "mencionó una palabra de su entrada", y la distancia
entre 0,03 y 0,20 no es una distancia donde un umbral pueda vivir sin evidencia
sobre dónde caen las corridas reales.

**El paso ya lo había dicho.** La salida que falló empezaba con *"There are no
files in the workspace to review."* El sistema no necesitaba inferir la
no-contribución — estaba **dicha en lenguaje claro en el resultado**, y nada la
leyó. Pero detectar eso significa afirmar que una frase aparece en la respuesta de
un modelo, y este repositorio tiene una regla permanente contra exactamente eso:
*un chequeo que puede fallar mientras la capacidad funciona está midiendo el
fraseo.* Lo cual corta para los dos lados — un chequeo que pasa por el fraseo
también está midiendo fraseo.

Así que la posición honesta es que **ai-os sigue sin poder notar un paso que no
contribuyó**, la señal candidata más barata se construyó y se falsificó, y la
próxima idea no debería ser un cuarto umbral sobre la misma estadística.

`contribution.ts` se conserva en vez de borrarse: reporta `carried` en cada
comparación, así que los datos etiquetados que un umbral real necesitaría pueden
acumularse del uso normal en vez de inventarse. Su veredicto conviene ignorarlo
hasta entonces.

## El loop, cerrado — 2026-08-07 [ran]

La señal falsificada de arriba falló por una razón: juzgaba calidad sin ninguna
noción de respuesta correcta. `ai-flows/src/evaluation.ts` y `src/scenarios.ts`
aportan la mitad que faltaba — doce tareas cuyas respuestas fueron **computadas y
no recordadas**, cada una chequeable por una función simple, corridas por dos
arreglos de agentes que difieren en una propiedad.

**El chequeo de margen fue primero, y solo.** Un brazo, doce escenarios: la línea
base sacó 9/12. Si hubiera sacado 12/12 la comparación no habría valido nada y no
había razón para pagar el segundo brazo.

Después la comparación:

| configuración | resultado |
|---|---|
| `single-step-recall` — contestar directo | 10/12 |
| `verify-then-answer` — computarlo y después decirlo | **12/12** |

**Y la línea base se corrió tres veces, porque un número no es una medición.**
9, 10, 9 — y *cuáles* fallan también se mueve:

| escenario | corrida 1 | 2 | 3 |
|---|:--:|:--:|:--:|
| `leap-years-1900-2100` | ✗ | ✗ | ✗ |
| `digit-sum-2-100` | ✗ | ✗ | ✗ |
| `sum-primes-below-100` | ✗ | ✓ | ✓ |
| `trailing-zeros-100-factorial` | ✓ | ✓ | ✗ |

Esa separación es lo útil. **Dos escenarios fallan siempre — ésa es la señal. Uno
flota — ése es el ruido.** El tratamiento pasó los doce, incluidos los dos
consistentes, así que el efecto es mayor que la variación entre corridas en vez de
indistinguible de ella.

Reportado como una sola corrida, `10/12 → 12/12` habría sido una afirmación de dos
escenarios apoyada en una línea base que se mueve un escenario sola. La tercera
corrida costó minutos y es la diferencia entre un número y una medición.

### Qué establece y qué no

**Sí:** el loop está cerrado. Un cambio en cómo se arreglan los agentes produce una
diferencia medible sobre un set fijo, con su ruido estimado en vez de asumido. Toda
afirmación sobre *evolucionar* agentes necesita que ese instrumento exista primero,
y ahora existe.

**No:** nada sobre degradación en el tiempo, que es de lo que trata este documento.
Estas doce tareas tienen respuestas estables y ningún paso de supervisión. La forma
de g-AMIE — donde una etapa de *revisión* es lo que se evalúa y a veces resta —
necesita escenarios donde revisar pueda ayudar o dañar, y ésos todavía no existen
acá. **Ésa es la próxima cosa cara, y son escenarios, no código.**

## La regla que deja

Corta como para sobrevivir:

> **La configuración es una hipótesis. La ejecución es la evidencia.** Un árbol de
> agentes que parece correcto, con las tools correctas y las descripciones
> correctas, es una afirmación sobre un sistema que todavía no corrió — y la falla
> que más probablemente esconde es un paso que tiene éxito sin contribuir.
