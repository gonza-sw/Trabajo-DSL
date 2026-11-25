# SQL-INV

### Motor de consultas SQL para gestión de inventario

![Estado](https://img.shields.io/badge/Estado-En_desarrollo-yellow)
![Node.js](https://img.shields.io/badge/Node.js-24-339933)
![SQLite](https://img.shields.io/badge/Database-SQLite-003B57)
![DSL](https://img.shields.io/badge/DSL-SQL-blue)

**Lenguajes de Dominio Especifico (SW608) | Grupo 5 | 2026-II**

## Sobre el proyecto

SQL-INV es una aplicación web orientada a la consulta y análisis del inventario de una empresa distribuidora de productos tecnológicos con almacenes en Lima, Arequipa y Trujillo.

El proyecto emplea SQL como lenguaje de dominio específico (DSL) para construir consultas dinámicas mediante una interfaz visual, permitiendo obtener información sobre productos, existencias y movimientos de inventario sin necesidad de escribir directamente sentencias SQL.

Su propósito es demostrar cómo un lenguaje especializado permite simplificar el procesamiento de datos, reducir la complejidad del código y facilitar la construcción de consultas seguras.

## Funcionalidades

- Construcción visual de consultas SQL.
- Filtrado, agrupación, agregación y ordenamiento de datos.
- Validación de consultas y prevención de inyección SQL.
- Control de acceso según roles de usuario.
- Visualización de resultados mediante tablas y gráficos.
- Portabilidad entre motores de bases de datos.

## Tecnologías

- **Backend:** Node.js y Express.
- **Frontend:** HTML, CSS y JavaScript.
- **Base de datos:** SQLite y PostgreSQL como motor alternativo.
- **Visualización:** Chart.js.
- **Pruebas:** Vitest y Supertest.
- **Despliegue e integración:** Docker y GitHub Actions.

## Documentación

| Documento | Enlace |
| --- | --- |
| Bases teóricas | [Consultar](docs/01-bases-teoricas.md) |
| Justificación del DSL | [Consultar](docs/02-justificacion-dsl.md) |
| Demostración de abstracción | [Consultar](docs/03-demostracion-abstraccion.md) |
| Metamodelo | [Consultar](docs/04-metamodelo.md) |
| Requisitos del sistema | [Consultar](docs/05-requisitos.md) |
| Guion de demostración | [Consultar](docs/06-guion-demo.md) |
| Contratos técnicos | [Consultar](docs/00-contratos-tecnicos.md) |