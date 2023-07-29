import { Request, Response, NextFunction } from "express";
import { io } from "../app";
import { pgClients } from "../config/postgres";
import { libGeneral_updateUserCache } from "../lib/general/lib";
export const mwCheckSocketIo = async (req: Request, res: Response, next: NextFunction) => {
   const src = "mwCheckSocketIo";
   try {
      const sub = req.auth?.payload?.sub;
      if (!sub) return res.status(403).json({ src, error: "Missing sub" });
      const currSid = req.headers["socketid"];
      if (typeof currSid !== "string") return res.status(400).json({ src, error: "Missing socketId" });

      //* get user name
      const pgUser = await pgClients["casino"].oneOrNone(`SELECT name,rid FROM users WHERE sub=$1`, [sub]);
      const userData = {
         ...pgUser,
         sub,
         sid: currSid,
      };

      const { socket } = libGeneral_updateUserCache({ res, newUserCache: userData });
      socket.emit("user", pgUser);

      //* disconnect old sockets
      const oldSockets = (await io.sockets.fetchSockets()).filter(
         (socket) => socket.id !== currSid && socket.data?.user?.sub === sub
      );
      oldSockets.forEach((socket) => {
         socket.emit("kicked", true);
         socket.disconnect();
      });
   } catch (error) {
      console.log({ error });
      return res.status(500).json({ src, error });
   }
   next();
};
