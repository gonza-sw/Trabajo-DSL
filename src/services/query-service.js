export class QueryService {

    constructor({
        adapter,
        buildAST,
        validateQuery,
        applyRolePolicy,
        compileQuery
    }) {
        this.adapter = adapter;
        this.buildAST = buildAST;
        this.validateQuery = validateQuery;
        this.applyRolePolicy = applyRolePolicy;
        this.compileQuery = compileQuery;
    }

    async execute(query, user) {

        const ast = this.buildAST(query);

        this.validateQuery(ast);

        const authorizedQuery = this.applyRolePolicy(
            query,
            user
        );

        const authorizedAST = this.buildAST(
            authorizedQuery
        );

        const { sql, params } = this.compileQuery(
            authorizedAST
        );

        const { columns, rows } = await this.adapter.execute(
            sql,
            params
        );

        return {
            success: true,
            sql,
            params,
            columns,
            rows,
            rowCount: rows.length
        };
    }

}