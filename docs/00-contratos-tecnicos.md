# Contratos técnicos

3. Acuerdos técnicos comunes

Node.js 24 LTS, módulos ES (import/export), Express, SQLite con better-sqlite3, HTML/CSS/JS, Chart.js, express-session, Vitest, Supertest, jsdom y Docker. Versiones exactas fijadas en package-lock.json. No React, ORM ni ANTLR. API REST con JSON y mismo origen para interfaz y API.

Modelo de datos y semilla

Total: 5,311 registros. Todas las FK son INTEGER. IDs de almacén: 1 Lima, 2 Arequipa, 3 Trujillo. Categorías: Computadoras, Componentes, Perifericos, Almacenamiento, Accesorios. Inventario único por producto y almacén; cantidades no negativas; movimientos positivos, ENTRADA/SALIDA, fecha ISO. Generar movimientos reproducibles y stock consistente partiendo de cero, sin salidas superiores al saldo. Activar claves foráneas.

Fuentes autorizadas

v_inventario: producto_id, producto, categoria, almacen_id, almacen, ciudad, cantidad, precio, stock_minimo. Une inventario, productos, categorías y almacenes.

v_movimientos: movimiento_id, producto, categoria, almacen_id, almacen, tipo, cantidad, fecha. Une movimientos con inventario y sus catálogos. Solo estas vistas se exponen al constructor; no se permiten JOIN arbitrarios ni acceso a usuarios.

Flujo de ejecución

Interfaz → API y sesión → servicio → AST y validación → política obligatoria → compilador → adaptador → base de datos → resultados. El dashboard sigue el mismo flujo de seguridad.



4. Contrato del DSL

El JSON tiene las mismas propiedades para todas las consultas. Los grupos son recursivos: raíz profundidad 0 y subgrupos hasta profundidad 2. El filtro obligatorio del servidor no cuenta como nivel de anidación del usuario.

{

  "source": "v_inventario",

  "select": [{"field":"categoria"},

    {"field":"cantidad","aggregate":"SUM","alias":"total_stock"}],

  "where": {"logic":"AND","conditions":[

    {"field":"precio","operator":"<","value":500},

    {"logic":"OR","conditions":[

      {"field":"almacen","operator":"=","value":"Lima"},

      {"logic":"AND","conditions":[

        {"field":"almacen","operator":"=","value":"Arequipa"},

        {"field":"cantidad","operator":">","value":0}]}]}]},

  "groupBy":["categoria"],

  "having":{"field":"cantidad","aggregate":"SUM",

            "operator":">","value":100},

  "orderBy":[{"field":"total_stock","direction":"DESC"}]

}

SELECT categoria, SUM(cantidad) AS total_stock

FROM v_inventario

WHERE (precio < ? AND (almacen = ? OR

       (almacen = ? AND cantidad > ?)))

GROUP BY categoria HAVING SUM(cantidad) > ?

ORDER BY total_stock DESC

params: [500, "Lima", "Arequipa", 0, 100]

select: al menos un campo. where/having: null cuando no se usan. groupBy/orderBy: [] cuando no se usan. Operadores: =, !=, >, >=, <, <=, LIKE (texto). Agregaciones: SUM, COUNT, AVG, MIN, MAX. SUM/AVG solo numéricos. COUNT cuenta valores del campo. HAVING admite una condición agregada. Campos no agregados deben pertenecer a GROUP BY si hay agregaciones; ORDER BY solo campos proyectados o alias. Alias únicos con patrón de identificador y sin palabras reservadas; preferir alias generados por el sistema. Validar tipos, grupos no vacíos y propiedades desconocidas. Nunca aceptar fragmentos SQL del cliente.

El compilador combina únicamente tokens autorizados y marcadores ?, nunca concatena valores recibidos. Los valores se pasan por separado al driver preparado. La validación precede a la ejecución.



5. Contratos de módulos y API

El servicio recibe dependencias por inyección. La política agrega un filtro externo AND sobre el grupo completo del usuario. El compilador acepta ese nodo interno confiable. El adaptador traduce marcadores y diferencias de dialecto; el esquema equivalente del segundo motor es una preparación de infraestructura, no un cambio de lógica.

Login recibe {username,password}. Los demás endpoints, excepto login, requieren sesión. Cada elemento de gráfico es {label,value}. Ejemplo de resultado: {success:true,sql:"SELECT cantidad FROM v_inventario",params:[],columns:["cantidad"],rows:[{cantidad:12}],rowCount:1}. Error: {success:false,error:{code:"INVALID_FIELD",message:"Columna no permitida"}}. HTTP 400 inválido, 401 sin sesión, 403 sin permiso, 500 error interno sin detalles sensibles.

Roles

Todos pueden agrupar y ver dashboard; ninguno modifica datos. La identidad proviene de sesión, nunca del JSON. Hash de contraseña con scrypt y sal aleatoria; secretos por entorno. Cookies HttpOnly, SameSite y Secure cuando haya HTTPS. Regenerar sesión al iniciar y destruir al salir. El esquema y los gráficos respetan permisos.



| Tabla / registros | Campos (PK: id; FK indicadas) |
| --- | --- |
| categorias / 5 | id INTEGER, nombre TEXT |
| productos / 200 | id, categoria_id FK, nombre TEXT, precio REAL, stock_minimo INTEGER |
| almacenes / 3 | id, nombre TEXT, ciudad TEXT |
| inventario / 600 | id, producto_id FK, almacen_id FK, cantidad INTEGER |
| movimientos / 4500 | id, inventario_id FK, tipo TEXT, cantidad INTEGER, fecha TEXT |
| usuarios / 3 | id, username TEXT, password_hash TEXT, rol TEXT, almacen_id FK nullable |

| Interfaz | Resultado |
| --- | --- |
| buildAST(query), validateQuery(ast) | AST normalizado; validación lanza error con code y message |
| compileQuery(ast) | {sql, params} |
| applyRolePolicy(ast,user) | AST autorizado; no modifica el original |
| adapter.execute(sql,params) | Promise<{columns, rows}>; columnas incluso sin filas |
| queryService.execute(query,user) | Promise<{success,sql,params,columns,rows,rowCount}> |
| dashboardService.getSummary(user) | Promise con los dos arreglos de gráficos |

| Método y ruta | Respuesta exitosa |
| --- | --- |
| POST /api/auth/login | {success:true,user:{id,username,rol,almacen_id}} |
| POST /api/auth/logout | {success:true} |
| GET /api/auth/me | Mismo objeto user |
| GET /api/schema | {success:true,sources:[{name,fields:[{name,type}]}]} |
| POST /api/query | Resultado del servicio |
| GET /api/dashboard | {success:true,stockByWarehouse,stockByCategory} |