# 04 — Metamodelo del AST y Mapeo a SQL

## 1. Diagrama UML del Metamodelo

```mermaid
classDiagram
    class Query {
        +String source
        +String[] groupBy
    }
    class Projection {
        +String field
        +String? aggregate
        +String? alias
    }
    class WhereNode {
        <<abstract>>
    }
    class Group {
        +String logic
    }
    class Condition {
        +String field
        +String operator
        +Any value
    }
    class Aggregate {
        +String field
        +String aggregate
        +String operator
        +Number value
    }
    class Order {
        +String field
        +String direction
    }

    Query "1" *-- "1..*" Projection : select
    Query "1" *-- "0..1" WhereNode : where
    Query "1" *-- "0..1" Aggregate : having
    Query "1" *-- "0..*" Order : orderBy
    WhereNode <|-- Group
    WhereNode <|-- Condition
    Group "1" *-- "1..*" WhereNode : conditions
```

## 2. Mapeo del AST a sintaxis SQL

| Elemento del AST | Representación SQL |
| --- | --- |
| `Query.source` | `FROM <vista>` |
| `Projection` | `SELECT <campo>` o `<AGREGADO>(<campo>) AS <alias>` |
| `Group` | Grupo de condiciones entre paréntesis, unido por `AND` u `OR` |
| `Condition` | `<campo> <operador> ?` |
| `Query.groupBy` | `GROUP BY <campo>` |
| `Aggregate` (`having`) | `HAVING <AGREGADO>(<campo>) <operador> ?` |
| `Order` | `ORDER BY <campo o alias> ASC/DESC` |

Los valores de `Condition` y `Aggregate` se envían en `params`, en el mismo orden
en que aparecen los marcadores `?` en `sql`; no se interpolan en la cadena SQL.
