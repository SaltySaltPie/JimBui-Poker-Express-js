// @ts-ignore
import { Hand } from "pokersolver";
import { Request, Response } from "express";
import { io } from "../../app";
import { pgClients } from "../../config/postgres";
import { libPoker_resolveGameTick, libPoker_updateRoomDataForPlayers } from "../../lib/poker/lib";
import { TPokerSolverSolved } from "../../types/pokersolver";

export const devRoute1 = async (req: Request, res: Response) => {
   const src = "devRoute1";
   let test;
   try {
      const seat = 9;
      const sub = "testId";
      const rid = "pk.1";
      // const test = await pgClients['casino'].one(`SELECT players FROM poker_rooms WHERE rid=$1`,[rid])
      // await pgClients["casino"].none(`UPDATE poker_rooms SET players[$1] = $2 WHERE rid=$3`, [seat, sub, rid]);
      // const test = await pgClients['casino'].query(`select * from poker_rooms `)
      await pgClients["casino"].none(`UPDATE poker_rooms SET data=$1, status=$2`, [{}, "idle"]);
      return res.status(200).json({});
   } catch (error) {
      console.log({ src, error });
      return res.status(500).json({ error });
   }
};

export const devRoute2 = async (req: Request, res: Response) => {
   const src = "devRoute2";
   let test;
   try {
      await libPoker_resolveGameTick({ rid: "pk.2", pollId: Date.now() });
      // test = await pgClients['casino'].one(`SELECT * from poker_rooms WHERE rid='pk.1'`)

      return res.status(200).json({ test });
   } catch (error) {
      console.log({ src, error });
      return res.status(500).json({ error });
   }
};

export const devRoute3 = async (req: Request, res: Response) => {
   const src = "devRoute3";
   try {
      await pgClients["casino"].none(
         `UPDATE poker_rooms SET data = (SELECT previous_data FROM poker_rooms WHERE rid = 'pk.2') WHERE rid = 'pk.2'`
      );
      return res.status(200).json({});
   } catch (error) {
      console.log({ src, error });
      return res.status(500).json({ error });
   }
};
