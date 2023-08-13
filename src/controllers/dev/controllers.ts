// @ts-ignore
import { Hand } from "pokersolver";
import { Request, Response } from "express";
import { io } from "../../app";
import { pgClients } from "../../config/postgres";
import { libPoker_resolveGameTick, libPoker_updateRoomDataForPlayers } from "../../lib/poker/lib";
import { TPokerSolverSolved } from "../../types/pokersolver";

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
      // await libPoker_resolveGameTick({ rid: "pk.2" });
      // await pgClients["casino"].none(`UPDATE poker_rooms SET players=$1 WHERE rid=$2`, [[...Array(9)].map(() => null), "pk.2"]);
      const hand1 = ["6c", "8h"];
      const hand2 = ["3h", "8d"];
      const cards = ["6d", "Tc", "2h", "5s", "4h"];
      const test = Hand.winners([Hand.solve([...hand1, ...cards]), Hand.solve([...hand2, ...cards])])
         .map(({ cards }: TPokerSolverSolved) => cards.map((card) => card.value + card.suit))
         .flat();
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
