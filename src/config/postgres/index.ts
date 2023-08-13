import pgPromise from "pg-promise";

const { PG_HOST, PG_PASS, PG_PORT, PG_USER } = process.env;
export const pgp = pgPromise();
export const pgClients = {
   casino: pgp({ host: PG_HOST, password: PG_PASS, user: PG_USER, port: Number(PG_PORT || 5432), database: "casino" }),
};
export type TPgDb = "casino";
