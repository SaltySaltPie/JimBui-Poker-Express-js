import { Request, Response, NextFunction } from "express";
import { pgClients } from "../config/postgres";

export const mwGetUser = async (req: Request, res: Response, next: NextFunction) => {
   const src = "mwGetUser";
   const sub = req.auth?.payload.sub;
   try {
      const user = await pgClients["casino"].oneOrNone(`SELECT sub,sid,name,rid FROM users WHERE sub=$1`, [sub]);
      res.locals.user = user;
      return next();
   } catch (error) {
      console.log({ src, error });
      return res.status(500).json({ error });
   }
};
