import { Request, Response } from "express";
import pgInsertOrUpdateOnConflict from "../../utils/postgres/pgInsertOrUpdateOnConflict";
import { io } from "../../app";
import { pgClients } from "../../config/postgres";

export const uGetUserProfile = async (req: Request, res: Response) => {
   const src = "uGetUserProfile";
   const { sub } = res.locals.user;
   try {
      const user = await pgClients["casino"].oneOrNone(`SELECT name, rid FROM users WHERE sub=$1`, [sub]);
      return res.status(200).json({ user });
   } catch (error) {
      console.log({ src, error });
      return res.status(500).json({ error });
   }
};
export const uConfigUpdateName = async (req: Request, res: Response) => {
   const src = "uConfigUpdateName";
   const { name } = req.body;
   if (!name) return res.status(400).json({ error: "missing name" });
   const { sid, sub } = res.locals.user;
   try {
      // * updating user name
      const payload = { sub, name };
      await pgInsertOrUpdateOnConflict({
         inputs: [payload],
         table: "users",
         client: "casino",
         columns: Object.keys(payload),
         conflictCols: ["sub"],
      });
      const userData = { ...res.locals.user, name };
      //* store user data in socket
      const currSocket = io.sockets.sockets.get(sid);
      if (!currSocket) return res.status(400).json({ src, error: "Has not made Socket connection yet!" });
      currSocket.data.user = userData;
      //* store user data in res
      res.locals.user = userData;

      return res.status(200).json({});
   } catch (error) {
      console.log({ src, error });
      return res.status(500).json({ error });
   }
};
