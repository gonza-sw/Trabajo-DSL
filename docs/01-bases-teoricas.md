# 01 — Bases Teóricas del DSL (SQL-INV)

## 1. Definición y arquitectura del lenguaje

**SQL-INV** es un Lenguaje de Dominio Específico (DSL) de **solo lectura** diseñado para consultar existencias y movimientos de inventario en múltiples almacenes (Lima, Arequipa, Trujillo) sin programar reportes nuevos por cada requerimiento de negocio.

Su arquitectura combina tres niveles de representación:

1. **Sintaxis Abstracta Serializada (JSON):** Representa la selección visual del usuario en el navegador mediante un contrato estructurado (`source`, `select`, `where`, `groupBy`, `having`, `orderBy`).
2. **Lenguaje Anfitrión (JavaScript / Node.js 24):** Orquesta el ciclo de vida de la consulta: construcción del AST (`buildAST`), validación semántica (`validateQuery`), inyección de políticas de seguridad (`applyRolePolicy`) y compilación (`compileQuery`).
3. **DSL Textual de Destino (SQL Parametrizado):** Lenguaje declarativo que expresa _qué_ datos obtener, delegando al motor relacional (SQLite / PostgreSQL) la optimización y ejecución segura mediante marcadores `?`.

## 2. Clasificación del DSL

- **Por su naturaleza:** DSL **externo** en su entrada (JSON con gramática propia validada por esquema/AST) y **generativo** en su salida (compila a SQL estándar).
- **Por su paradigma:** **Declarativo** (describe filtros, agrupaciones y proyecciones sin especificar bucles ni estructuras de control imperativas).

## 3. Garantías de seguridad por diseño

- **Lista blanca (Whitelist):** Solo expone dos vistas (`v_inventario` y `v_movimientos`), bloqueando acceso directo a tablas base como `usuarios` o `JOIN` arbitrarios[cite: 1].
- **Separación código/datos:** El compilador jamás concatena valores literales del usuario; todo parámetro viaja en un arreglo separado para ejecución preparada[cite: 1].
