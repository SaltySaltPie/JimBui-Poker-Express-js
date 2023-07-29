import { TPgClient, pgClients, pgp } from "../../config/postgres";
import { TUnknownObj } from "../../types/common";
import spliceArray from "../js/spliceArray";

const pgInsertOrUpdateOnConflict = async ({
   inputs,
   table,
   client,
   columns,
   conflictCols = ["hs_object_id"],
}: IpgInsertOrUpdate) => {
   const colSet = new pgp.helpers.ColumnSet(columns, { table });
   const onConflict =
      conflictCols.length === 0
         ? ""
         : ` ON CONFLICT (${conflictCols.map((str) => `"${str}"`).join(",")}) DO UPDATE SET ` +
           colSet.assignColumns({ from: "EXCLUDED", skip: conflictCols });
   const splicedInputs = spliceArray(inputs, 30000 / columns.length);
   for (let i = 0; i < splicedInputs.length; i++) {
      const splicedInput = splicedInputs[i];
      const query = pgp.helpers.insert(splicedInput, colSet) + onConflict;
      await pgClients[client].query(query);
   }
};

export default pgInsertOrUpdateOnConflict;
interface IpgInsertOrUpdate {
   table: string;
   inputs: TUnknownObj[];
   columns: string[];
   conflictCols?: string[];
   client: TPgClient;
}
