import { sioChat } from "../../controllers/socket.ioControllers";
import { TSocket } from "../../types/socket.io/types";

export const sioRouter = (socket: TSocket) => {
   console.log("connection", socket.id);
   socket.on("chat", (args) => sioChat({ socket, args }));
   socket.on("disconnect", (reason) => console.log({ user: socket.data.user, reason }));
};
