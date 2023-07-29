import { Response } from "express";
import { TUserCache } from "../../types/common";
import { io } from "../../app";
export const libGeneral_updateUserCache = ({ res, newUserCache = {} }: TLibGeneral_updateUserCache) => {
   const src = "libGeneral_updateUserCache";
   const curUserCache = res.locals.user;
   const newUser = { ...curUserCache, ...newUserCache };
   if (!newUser.sid) throw Error(`${src}: Missing sid`);
   const socket = io.sockets.sockets.get(newUser.sid);
   if (!socket) throw Error(`${src}: No socket found by this sid`);

   res.locals.user = newUser;
   socket.data.user = newUser;
   return { socket };
};
type TLibGeneral_updateUserCache = {
   res: Response;
   newUserCache?: Partial<TUserCache>;
};
