// @ts-ignore
import { Hand } from "pokersolver";
import { Request, Response } from "express";
import { pgClients } from "../../config/postgres";
import { io } from "../../app";
import { libGeneral_updateUserCache } from "../../lib/general/lib";
import {
   libPoker_calculateHands,
   libPoker_generateCardDeck,
   libPoker_getRoomData,
   libPoker_maskRoomData,
   libPoker_resolveGameTick,
   libPoker_startRoom,
   libPoker_updateRoomDataForPlayers,
} from "../../lib/poker/lib";
import { TPokerPlayerHand, TPokerRoomData } from "../../types/poker/types";
import { jsArrayFindNextNonNull } from "../../utils/js/jsArrayFindNextNonNull";
import pgInsertOrUpdateOnConflict from "../../utils/postgres/pgInsertOrUpdateOnConflict";
import { TPokerSolverSolved } from "../../types/pokersolver";
export const pkRoomGetAllRooms = async (req: Request, res: Response) => {
   const src = "pGetAllRooms";
   try {
      const rooms = await pgClients["casino"]
         .manyOrNone(`SELECT rid,created_by,created_at FROM poker_rooms`)
         .then((res) =>
            Promise.all(
               res.map(async (room) => ({
                  ...room,
                  count: (await io.in(`poker-${room.rid}`).fetchSockets()).length,
               }))
            )
         );
      return res.status(200).json({ rooms });
   } catch (error) {
      console.log({ src, error });
      return res.status(500).json({ error });
   }
};

export const pkRoomJoinARoom = async (req: Request, res: Response) => {
   const src = "pkRoomJoinARoom";
   const sub = req.auth?.payload.sub;
   const { rid } = req.params;
   const { sid, name, rid: oldRid } = res.locals.user;
   try {
      // * check if room exists
      const roomExist = await pgClients["casino"].oneOrNone(`SELECT rid FROM poker_rooms WHERE rid=$1`, [rid]);
      if (!roomExist) return res.status(302).json({ error: "No Such Room", redirect: "/poker" });

      // * updating room ID for user in PG
      await pgClients["casino"].none(`UPDATE users SET rid=$1 WHERE sub=$2`, [rid, sub]);
      const roomName = `${rid}`;
      const { socket } = libGeneral_updateUserCache({ res, newUserCache: { rid: roomName } });
      // * join user socket
      if (oldRid) await socket.leave(oldRid);
      await socket.join(roomName);

      // * boardcasting the new user to chat
      io.to(roomName).emit("chat", { sender: "Admin", msg: `User ${name} has joined room` });

      // * refreshing the chat users for eveyone
      const allUsersInRoom = await io
         .in(roomName)
         .fetchSockets()
         .then((sockets) => sockets.map((socket) => socket.data.user));
      io.to(roomName).emit("chatUsers", { users: allUsersInRoom });

      // * getting room data
      const { serverRoom } = await libPoker_getRoomData({ rid });
      await libPoker_updateRoomDataForPlayers({ roomData: serverRoom, rid, socketIds: [sid] });

      return res.status(200).json({
         // room: clientRoom
      });
   } catch (error) {
      console.log({ src, error });
      return res.status(500).json({ error });
   }
};

export const pkRoomSitDown = async (req: Request, res: Response) => {
   const src = "pkRoomSitDown";
   const { sid, sub, name, rid: userRid } = res.locals.user;
   const { seat } = req.body;
   const { rid } = req.params;
   if (typeof seat !== "number" || seat < 0 || seat > 8) return res.status(400).json({ src, error: "Missing seat" });
   try {
      // * check if user is assigned to this room
      if (rid !== userRid) return res.status(400).json({ src, error: "YOU ARE NOT IN THIS ROOM" });

      // * get list of players
      const { players } = await pgClients["casino"].one<{ players: string[] }>(
         `SELECT players FROM poker_rooms WHERE rid=$1`,
         [rid]
      );

      // * check if seat is available
      const isOccupied = !!players[seat];
      if (isOccupied) return res.status(400).json({ src, error: "Seat taken" });

      // * check if user is seated already
      if (players.includes(sub)) return res.status(400).json({ src, error: "You are already seated" });

      // * update list of players in PG
      await pgClients["casino"].none(`UPDATE poker_rooms SET players[$1] = $2 WHERE rid=$3`, [seat + 1, sub, rid]);

      io.to(rid).emit("chat", { sender: "Admin", msg: `${name} has sit down at seat ${seat + 1}` });

      // * getting room data
      const { clientRoom } = await libPoker_getRoomData({ rid });

      io.to(rid).emit("updateRoom", clientRoom);

      return res.status(200).json({});
   } catch (error) {
      console.log({ src, error });
      return res.status(500).json({ error });
   }
};

export const pkRoomStandUp = async (req: Request, res: Response) => {
   const src = "pkRoomStandUp";
   const { sid, sub, name, rid: userRid } = res.locals.user;
   const { rid } = req.params;
   try {
      // * check if user is assigned to this room
      if (rid !== userRid) return res.status(400).json({ src, error: "YOU ARE NOT IN THIS ROOM" });

      // * get list of players
      const { players, status } = await pgClients["casino"].one<{ players: string[]; status: string }>(
         `SELECT players,status FROM poker_rooms WHERE rid=$1`,
         [rid]
      );

      if (status !== "idle") return res.status(200).json({});

      // * check if user is seated
      const isUserSeated = players.includes(sub);
      if (!isUserSeated) return res.status(400).json({ src, error: "You are not seated" });

      // * update user seat
      const userSeat = players.findIndex((playerSub) => playerSub === sub);
      await pgClients["casino"].none(`UPDATE poker_rooms SET players[$1] = $2 WHERE rid=$3`, [userSeat + 1, null, rid]);

      io.to(rid).emit("chat", { sender: "Admin", msg: `${name} has stood up` });

      // * getting room data
      const { clientRoom } = await libPoker_getRoomData({ rid });

      io.to(rid).emit("updateRoom", clientRoom);

      return res.status(200).json({});
   } catch (error) {
      console.log({ src, error });
      return res.status(500).json({ error });
   }
};

export const pkRoomStart = async (req: Request, res: Response) => {
   const src = "pkRoomStart";
   const { rid } = req.params;
   if (!rid) return res.status(400).json({ src, error: "Missing rid" });
   try {
      const result = await libPoker_startRoom({ rid });
      setTimeout(() => libPoker_resolveGameTick({ rid }), 1000);
      if (result?.error) return res.status(400).json({ src, error: result.error });

      return res.status(200).json({});
   } catch (error) {
      console.log({ src, error });
      return res.status(500).json({ error });
   }
};

export const pkRoomAction = async (req: Request, res: Response) => {
   const src = "pkRoomAction";
   const { action, raise } = req.body;
   if (!action || !raise) return res.status(400).json({ src, error: "Missing action or raise" });
   if (!["call", "fold", "check", "raise"].includes(action))
      return res.status(400).json({ src, error: "Wrong action" });
   if (action === "raise" && !raise) return res.status(400).json({ src, error: "Invalid raise amount" });
   const { rid } = req.params;
   try {
      const { sid, name, sub } = res.locals.user;
      const { serverRoom } = await libPoker_getRoomData({ rid });
      const { players = [], data, status, last_update } = serverRoom;
      const { play_order = [], play_order_index = 0, stake, round_pot } = data;

      const seatSub = players[play_order[play_order_index]]?.sub;
      const seatIndex = play_order[play_order_index];
      const seatRoundPot = round_pot[seatIndex];
      const isLegal = action === "check" ? seatRoundPot === stake : true;

      if (!seatSub || seatSub !== sub || status !== "playing" || !isLegal)
         return res.status(400).json({ src, error: "Not Allowed" });

      const newData: TPokerRoomData = { ...data, player_action: action, player_action_amount: raise };
      const updatedRows = await pgClients["casino"]
         .query(
            `UPDATE poker_rooms 
            SET data=$1,last_update=$2 WHERE rid=$3 AND last_update=$4 RETURNING rid`,
            [newData, Date.now(), rid, last_update]
         )
         .then((rows) => rows.length);

      if (!updatedRows) return res.status(400).json({ src, error: "Action could not be completed" });

      // TODO REMOVE THIS
      await libPoker_resolveGameTick({ rid });

      return res.status(200).json({});
   } catch (error) {
      console.log({ src, error });
      return res.status(500).json({ error });
   }
};

export const pkRoomPostRabbit = async (req: Request, res: Response) => {
   const src = "pkRoomPostRabbit";
   const { sid, sub, name, rid: userRid } = res.locals.user;
   const { rid } = req.params;
   if (rid !== userRid) return res.status(400).json({ src, error: "You are not in this room" });
   try {
      const { serverRoom } = await libPoker_getRoomData({ rid });
      const { data } = serverRoom;
      const { round } = data;
      if (round !== "post") return res.status(400).json({ src, error: "Round is not Post yet" });
      await pgClients["casino"].none(`UPDATE poker_rooms SET post_actions = post_actions || $1`, [{ type: "rabbit" }]);
      return res.status(200).json({});
   } catch (error) {
      console.log({ src, error });
      return res.status(500).json({ error });
   }
};
