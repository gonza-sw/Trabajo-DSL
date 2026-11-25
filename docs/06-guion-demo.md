# Guion de demostración

## Preparación

Antes de la exposición, instalar dependencias con `npm ci`, configurar un `SESSION_SECRET` aleatorio de al menos 32 caracteres, ejecutar la semilla de la base de datos y comprobar el inicio local y el contenedor. Tener disponibles las credenciales de demostración que acuerde el equipo y confirmar que no se usan contraseñas reales.

## Secuencia del integrante 4

1. Mostrar la arquitectura: interfaz → API con sesión → servicios → DSL y política → adaptador.
2. Iniciar sesión como admin y consultar `/api/auth/me`; mostrar que la respuesta solo incluye identidad pública.
3. Abrir `/api/schema` y `/api/dashboard`; ejecutar una consulta de inventario con agregación desde la interfaz.
4. Cerrar sesión y volver a entrar como operario. Repetir la consulta con un filtro que contenga `OR`; explicar que el servidor agrega el alcance de Lima mediante un `AND` externo.
5. Iniciar sesión como consulta. Mostrar que el catálogo solo ofrece inventario y que un intento de consultar movimientos devuelve 403.
6. Ejecutar `npm run test:api` y `npm test`. Mostrar los resultados reales de CI y el contenedor de la rama integrada.

## Evidencia y límites

No declarar una prueba aprobada sin haber ejecutado el comando y verificado su resultado. Las cuentas, resultados, estado de CI y salida del contenedor se completan con los valores reales del entorno de exposición después de integrar los módulos DSL y de datos. No presentar el arranque con dependencias simuladas como una demo integrada.
