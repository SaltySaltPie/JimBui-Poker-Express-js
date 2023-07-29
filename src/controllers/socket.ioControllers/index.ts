import { io } from "../../app";
import { TSocket } from "../../types/socket.io/types";

export const sioChat = async ({ socket, args }: TSioCheckedInParams) => {
   const { id } = socket;
   try {
      const { name, rid } = socket.data.user;
      io.to(rid).emit("chat", { sender: name, msg: args });
   } catch (error) {
      socket.emit("chat", { sender: "SERVER", msg: "FALED TO SEND" });
   }
};
type TSioCheckedInParams = {
   socket: TSocket;
   args: { room: string; msg: string };
};
