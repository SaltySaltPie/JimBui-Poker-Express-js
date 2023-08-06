import { Request, Response } from "express";
import { io } from "../../app";
import { pgClients } from "../../config/postgres";
import { libPoker_resolveGameTick } from "../../lib/poker/lib";

export const devRoute1 = async (req: Request, res: Response) => {
   const src = "devRoute1";
   try {
      const seat = 9;
      const sub = "testId";
      const rid = "pk.1";
      // const test = await pgClients['casino'].one(`SELECT players FROM poker_rooms WHERE rid=$1`,[rid])
      // await pgClients["casino"].none(`UPDATE poker_rooms SET players[$1] = $2 WHERE rid=$3`, [seat, sub, rid]);
      // const test = await pgClients['casino'].query(`select * from poker_rooms `)
      await pgClients["casino"].none(`UPDATE poker_rooms SET data=$1, status=$2 WHERE rid=$3`, [{}, "idle", "pk.2"]);
      return res.status(200).json({});
   } catch (error) {
      console.log({ src, error });
      return res.status(500).json({ error });
   }
};

export const devRoute2 = async (req: Request, res: Response) => {
   const src = "devRoute2";
   try {
      await libPoker_resolveGameTick({ rid: "pk.2" });
      // await pgClients["casino"].none(`UPDATE poker_rooms SET players=$1 WHERE rid=$2`, [[...Array(9)].map(() => null), "pk.2"]);
      return res.status(200).json({});
   } catch (error) {
      console.log({ src, error });
      return res.status(500).json({ error });
   }
};
