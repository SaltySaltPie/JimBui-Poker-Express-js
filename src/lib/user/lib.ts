import { pgClients } from "../../config/postgres";

export const libUser_getUsers = async ({ subs }: TlibUser_getUsers) => {
   const players = await pgClients["casino"].manyOrNone<TLibUserUser>(
      `SELECT sub,name FROM users WHERE ${subs.map((_, i) => `sub=$${i + 1}`).join(" OR ")}`,
      subs
   );
   return { players };
};
export type TLibUserUser = { sub: string; name: string | null };
type TlibUser_getUsers = {
   subs: string[];
};
