import * as dotenv from "dotenv";
dotenv.config();
const { MODE, PORT = 5000 } = process.env;

import express from "express";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import devRouter from "./routers/devRouter";
import { Server } from "socket.io";
import http from "http";
import pokerRouter from "./routers/pokerRouter";
import { mwCheckJWT } from "./middlewares/mwCheckJWT";
import userRouter from "./routers/userRouter";
import { sioRouter } from "./routers/socket.ioRouter";
import { mwGetUser } from "./middlewares/mwGetUser";
import { TSocketInterEvents, TSocketListenEvents, TSocketServerEvents } from "./types/socket.io/types";
import { mwCheckSocketIo } from "./middlewares/mwCheckSocketIo";
import { TUserCache } from "./types/common";
const app = express();
app.use(cors());
app.use(morgan("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

app.use("/dev", devRouter);
app.use("/users", mwCheckJWT, mwCheckSocketIo, userRouter);
app.use("/poker", mwCheckJWT, mwCheckSocketIo, pokerRouter);

const server = http.createServer(app);

const io = new Server<TSocketListenEvents, TSocketServerEvents, TSocketInterEvents, { user: TUserCache }>(server, {
   cors: { origin: "*" },
});

io.on("connection", sioRouter);

server.listen(PORT, () => console.log(`Listening on ${PORT} | MODE: ${MODE}`));

export { io };
