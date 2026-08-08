# 14 · ¿Agregar un revisor ayuda? — y cómo un punto final inventó un hallazgo

<img src="../assets/14-review-study.jpg" alt="" width="100%">

<sub>El estudio que este documento fue escrito para reportar. No ocurrió.</sub>

> **El inglés es canónico.** Traducción de [`doc/14-review-study.md`](../14-review-study.md).
>
> **Estado: el estudio corrió y no produjo nada, y la primera versión de este
> documento reportó un hallazgo que era un artefacto de un carácter. [ran]
> 2026-08-08.** Se conserva completo, porque el artefacto es más instructivo de lo
> que habría sido el hallazgo.

[13-degradation](13-degradation.md) documentó el resultado de g-AMIE — la
supervisión médica mejoró el 6,7% de los escenarios, no cambió nada en el 71,6%, y
**redujo la calidad en el 21,7%**. Este documento iba a ser ese estudio,
reproducido acá.

## Lo que la primera corrida parecía mostrar

Un productor respondía doce tareas; un revisor chequeaba y emitía la respuesta
final. Dos posturas de revisor. Los números volvieron con la forma de g-AMIE:

| | correcto antes | correcto después | mejoró | sin cambio | **dañó** |
|---|---:|---:|---:|---:|---:|
| revisor deferente | 75,0% | 91,7% | 3 | 8 | **1** |
| revisor escéptico | 58,3% | 91,7% | 4 | 8 | 0 |

`trailing-zeros-100-factorial` pasó de ✓ a ✗ con el revisor deferente. **Un paso de
revisión había tomado una respuesta correcta y la había vuelto incorrecta** — el
resultado exacto que el estudio existe para atrapar, en nuestro propio sistema, con
un puntaje de titular en alza escondiéndolo. Estaba por entrar al README.

## Lo que realmente pasó

El check de ese escenario espera `24`. El productor dijo `24 trailing zeros.` y el
revisor dijo `24.`

`statesNumber` usaba `(?<![\w.])24(?![\w.])`. El `.` estaba excluido de ambos bordes
para que `3.24` no matcheara — y por eso **rechazaba toda respuesta correcta que
terminara una oración**. `"The answer is 24."` puntuaba como incorrecta.

El revisor había tenido razón. El productor también. **El instrumento construido
para atrapar a un mal revisor produjo un mal revisor**, a partir de un punto final.

## Lo que muestra el estudio una vez corregido el borde

Los bordes ahora son asimétricos — un `.` antes del número lo descalifica sólo si un
dígito precede al punto, y un `.` después sólo si un dígito lo sigue:

| | correcto antes | correcto después | mejoró | sin cambio | dañó |
|---|---:|---:|---:|---:|---:|
| revisor deferente | **100%** | 100% | 0 | 11 | 0 |
| revisor escéptico | **100%** | 100% | 0 | 12 | 0 |

`NO HEADROOM FOR REPAIR`. El productor responde las doce correctamente, así que un
revisor sólo puede dañar, y ninguno lo hizo. **Esta suite no puede correr el estudio
de g-AMIE**, y la versión que aparecía en el primer borrador de este documento era
ruido.

### Todo lo medido sobre esta suite antes del arreglo queda anulado

La contaminación no se limita a este documento:

| se afirmó | en realidad |
|---|---|
| línea base 9, 10, 9 en tres corridas — "±1 escenario de ruido" | 12, 12. La varianza eran los puntos |
| "hay margen, la comparación vale lo que cuesta" | no hay ninguno |
| `single-step-recall` 10/12 contra `verify-then-answer` 12/12, `COMPARABLE` | ambos 12/12 |
| un revisor dañó una respuesta correcta | no lo hizo |

El estado corregido de esa comparación está en
[13 § El loop](13-degradation.md).

## La parte que vale conservar

**El guard de margen no podía atraparlo, y no podría haberlo hecho.**
`evaluation.ts` se niega a reportar una comparación cuando todos los brazos empatan
en el límite — y estaba satisfecho, porque el check roto producía 9/12 y 10/12, que
se ven exactamente como una suite con espacio. **Un guard que lee los mismos números
que produjo el check roto no puede saber que están rotos.**

Ya había cuatro fallas de techo registradas acá. Ésta es la quinta, y la primera en
que el techo estaba *escondido* en vez de visible — lo que la vuelve la cara. El
guard contra un empate en el límite no protege contra un check que fabrica
dispersión.

Así que la regla que deja es más angosta y más útil que "cuidado con los techos":

> **Un check que puede fallar mientras la capacidad funciona no sólo pierde señal —
> la fabrica.** La suite parecía tener 25% de margen. Cada punto era puntuación.

Y la razón por la que se atrapó: el hallazgo se inspeccionó antes de publicarse. La
captura tomada para el README mostraba el paso 0 respondiendo `24 trailing zeros.` y
el paso 1 respondiendo `24.` — dos respuestas correctas, una de ellas puntuada como
daño. **El número estaba mal y el transcript estaba ahí al lado.**

## Un segundo dominio, y el mismo techo — 2026-08-08 [ran]

El diagnóstico obvio era que la aritmética era el dominio equivocado. Así que se
construyó un segundo set contra **el propio código de este repositorio**: doce
preguntas sobre constantes, largos de tuplas y tamaños de uniones en seis archivos,
sembrados en la capa de sólo lectura `global/source/` donde el sandbox de cualquier
scope los puede leer (`scripts/seed-source.ts`). Cada respuesta computada grepeando
el árbol.

Línea base: **12/12.** Incluida la trampa deliberada — una pregunta sobre un archivo
que *no* se sembró, cuya respuesta correcta es que no se puede leer.

**Tres dominios, tres techos.** Y el tercero localiza el problema, cosa que los dos
primeros no hicieron:

> **El productor no es débil.** "Single-step recall" se diseñó suponiendo que un
> paso sería una desventaja. No lo es. Ese paso igual tiene `read` y `execute` y un
> modelo capaz detrás, así que los dos arreglos que se comparan difieren en el
> *prompt* y no en la *capacidad* — y un tratamiento que le dice al modelo que
> compute no tiene nada que agregarle a una línea base que ya computa.

El margen para esta comparación no vive en las preguntas. Vive en el productor, y
hay dos formas honestas de encontrarlo:

1. **Variar el modelo, no el prompt.** Un modelo más chico como productor y uno más
   grande como revisor es el arreglo que sí puede diferir — y
   [11-choosing-a-model](11-choosing-a-model.md) ya es el documento sobre dónde está
   ese trade y dónde cambia de signo.
2. **Preguntar cosas que ninguna búsqueda resuelva.** Todo lo que un modelo bien
   equipado pueda grepear, lo va a grepear. Una primera respuesta discutible
   necesita juicio, y el juicio necesita un evaluador — que este harness rechaza a
   propósito, porque un modelo juzgando a un modelo es la evidencia más débil
   disponible ([05](05-ai-storage.md)).

La ruta 1 es la barata y no es un problema de escenarios en absoluto, que es lo
contrario de la conclusión sacada dos veces arriba. **Registrar esa reversión es el
punto de esta sección**: "necesitamos mejores escenarios" era el diagnóstico
equivocado, sostenido a lo largo de dos intentos, y fue una tercera medición la que
lo movió.

## Cómo correrlo

```bash
cd ai-os/ai-flows
node --env-file=/ruta/al/core.env scripts/review-study.ts                    # deferente
node --env-file=/ruta/al/core.env scripts/review-study.ts --strict-reviewer  # escéptico
```

Dice `NO HEADROOM FOR REPAIR` cuando el productor acertó en todo, y
`NO HEADROOM FOR DAMAGE` para el caso espejo. Los dos valen más que el número que
tienen encima.
