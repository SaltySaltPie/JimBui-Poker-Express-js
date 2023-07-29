import { Socket } from "socket.io";
import { DefaultEventsMap } from "socket.io/dist/typed-events";
import { TUnknownObj } from "../common";

export type TSocket = Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>;

export type TSocketListenEvents = TUnknownObj;

export type TSocketServerEvents = TUnknownObj;

export type TSocketInterEvents = TUnknownObj;

