# 03 — Demostración de Abstracción: JS Imperativo vs. SQL-INV

## 1. Problema de negocio

Obtener el stock total por categoría en `v_inventario` para productos con precio menor a `500`, ubicados en `Lima` o en `Arequipa` con `cantidad > 0`, conservando solo categorías cuyo stock acumulado supere `100` unidades, ordenadas de mayor a menor.

## 2. Comparativa de implementación

| Criterio                   | Enfoque Imperativo (`examples/consulta-js.js`)                                                        | Enfoque DSL (`SQL-INV`)                                               |
| :------------------------- | :---------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------- |
| **Líneas de código**       | > 45 líneas de lógica manual (bucles, mapas, validaciones y ordenamiento).                            | 1 objeto JSON declarativo (~18 líneas) compilado automáticamente.     |
| **Mantenimiento**          | Cambiar un filtro `OR` o agregar un campo requiere reescribir condicionales `if/else` y acumuladores. | Se modifica únicamente la estructura JSON sin tocar el motor.         |
| **Seguridad y validación** | Propenso a errores de tipos o acceso accidental a propiedades privadas si no se programa manualmente. | Validación automática por whitelist, tipos y parametrización `?`.     |
| **Portabilidad**           | Ejecuta en memoria de Node.js; no escala si hay millones de filas.                                    | Delega índices y ejecución al motor relacional (SQLite / PostgreSQL). |

## 3. Evidencia de equivalencia

Al ejecutar `npm run test:dsl` (`tests/dsl/abstraction.test.js`), tanto la función imperativa `ejecutarConsultaImperativa()` como la sentencia SQL generada por `compileQuery()` sobre SQLite producen exactamente la misma salida:

```json
[
  { "categoria": "Accesorios", "total_stock": 150 },
  { "categoria": "Perifericos", "total_stock": 125 }
]
```
