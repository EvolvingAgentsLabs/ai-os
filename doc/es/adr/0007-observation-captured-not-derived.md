# ADR-0007 · La observación de un intento se captura al cerrarlo, nunca se deriva después

**Estado:** Aceptado · 2026-08-04

## Contexto

Toda pregunta que valga la pena hacerle a un flow corriendo — ¿se movió?, ¿está
trabado?, ¿este intento hizo algo que el anterior no? — es una comparación entre
el estado después de un intento y el estado después del siguiente. Hacer esa
comparación exige un registro de lo que produjo cada intento.

El diseño obvio es mantener los flows flacos y derivar el registro a demanda
desde la base: el intento ya lleva `runId`, así que se lee el run y se
reconstruye.

**Ese diseño no está disponible, y el motivo es una constante.**

La telemetría por turno de upstream vive en `run_activity`, y es un cache con una
hora encima — **[read]**:

```ts
export const RUN_ACTIVITY_TTL_MS = 60 * 60_000;   // run-activity-store.ts:16
```

Ambos backends la aplican. El store de Postgres importa la misma constante y
purga con un timer de un minuto:

```ts
await q("DELETE FROM run_activity WHERE created_at < $1",
        [t - RUN_ACTIVITY_TTL_MS]);              // postgres-run-activity-store.ts:30
```

Hay además un tope de `MAX_PER_RUN = 2_000` entradas, y `run_activity` **no está
expuesta en ninguna ruta de API** — `grep -rn activity ai-base/src/api/routes/`
no devuelve nada **[read]**. Lo que sí devuelve `GET /v1/runs/:id` es el registro
`Run`: estado, cantidad de intentos, lease y timestamps (`run-store.ts`,
`turns.ts:160`). Útil, y no un registro de lo que el turno produjo.

El choque con el modelo de flow es directo. El propósito entero de un flow es
abarcar días — *"un flow arrancado el lunes se reanuda el miércoles"*
([08 M2](../08-roadmap.md)). **Para el lunes a las 13:00 la evidencia del intento
del lunes ya fue borrada.**

## Decisión

**Una observación se escribe en `flow_attempts` en el momento en que el intento
cierra. Nunca se reconstruye después, y nunca se infiere.**

```ts
export interface Observation {
  digest: string;        // huella del estado que produjo este intento
  value: number | null;  // solo donde la forma declara una métrica
  source: string;        // qué produjo el digest — se asienta, no se infiere
  at: number;
}
```

Cuatro consecuencias, todas deliberadas:

1. **Opcional, y ausente significa ausente.** Un intento cerrado sin observación
   queda en `null` para siempre. La ausencia no es evidencia de igualdad, y el
   store nunca inventa un digest para tapar el hueco.
2. **Un digest, no un score.** La distinguibilidad está definida para toda forma;
   la magnitud solo donde una forma declara una métrica, y hoy ninguna lo hace.
   `value` es `null` en todos lados hasta que `Loop` llegue en M6. Inventar un
   score para `Open` contradiría la definición que separa ambas formas
   ([03](../03-ai-flows.md)).
3. **`source` es obligatorio cuando hay observación.** Dos flows huelleados con
   métodos distintos no son comparables, y un digest guardado sin procedencia es
   un número que en algún momento se va a comparar contra lo que no corresponde.
4. **Columnas nullable sobre una tabla `flow_`.** Ninguna tabla de upstream se
   altera, consistente con [ADR-0006](0006-ai-flows-lives-outside-core.md) y con
   [03](../03-ai-flows.md). Escritas como `ALTER TABLE … ADD COLUMN IF NOT
   EXISTS` para que una base creada por el primer slice de M2 llegue a la misma
   forma que una nueva.

## Consecuencias

**Costos.** El store de flows gana una responsabilidad que preferiría no tener —
capturar evidencia en el instante correcto — y quien avanza el flow tiene que
aportar la observación, porque para cuando cualquier otro pregunte ya no está.
Eso es peor que derivarla, y es la única opción sobre la mesa.

**Qué compra.** El historial de intentos pasa a ser evidencia durable en vez de
una lista de timestamps. `attempts[]` ya existe precisamente porque *"un contador
que descarta su pasado no se puede diffear, revertir ni explicar"*
([03](../03-ai-flows.md)); esto es ese mismo argumento aplicado al *contenido* de
un intento y no a su cuenta. Es también lo que lee
[10-observabilidad](../10-observability.md), y lo que el diff de flows de M3 va a
necesitar antes de poder comparar dos ramas por algo que no sea texto.

**La pregunta upstream-primero, hecha y contestada.** El arreglo correcto podría
parecer subir `RUN_ACTIVITY_TTL_MS` o exponer una ruta de activity upstream. No
lo es: el TTL y el tope de 2.000 entradas son el comportamiento de un *cache de
vista en vivo* para una UI que sigue un turno, y convertirlo en un log de
auditoría durable es otro componente con otra economía de almacenamiento — un
cambio al diseño de QM, no un arreglo de bug. Querer un cambio en `ai-base` es
evidencia de que el diseño de arriba está mal; acá el diseño de arriba está bien
y la base simplemente no es el lugar donde debe vivir la evidencia.

## Alternativas rechazadas

| Alternativa | Por qué no |
|---|---|
| Derivar de `run_activity` a demanda | Borrada a los 60 minutos en ambos backends, topeada en 2.000 entradas, expuesta en ninguna ruta. Los flows abarcan días |
| Guardar la salida completa del turno en el intento | Crecimiento sin cota, y convierte a `flow_attempts` en un segundo transcripto — el objeto contra el que argumenta [04](../04-ai-ui.md) |
| Ponerla en el step en vez del intento | `flow_steps.result` ya es un valor por step, sobrescrito. Una repetición solo es visible *entre* intentos, que es exactamente para lo que está el historial de reintentos |
| Esperar a que haya un eval numérico y guardar eso | Solo `Loop` tiene uno, `Loop` es M6, y `Open` es lo que entrega M2. La comparación quedaría indisponible durante todo el milestone que tiene que justificar el repositorio |
