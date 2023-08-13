import { Router } from "express";
import {
   pkRoomAction,
   pkRoomGetAllRooms,
   pkRoomJoinARoom,
   pkRoomPostRabbit,
   pkRoomPostShow,
   pkRoomSitDown,
   pkRoomStandUp,
   pkRoomStart,
} from "../../controllers/poker/controllers";

const pokerRouter = Router();

const pkRoomRouter = Router();
pokerRouter.use("/rooms", pkRoomRouter);
pkRoomRouter.route("/").get(pkRoomGetAllRooms);
pkRoomRouter.route("/:rid").get(pkRoomJoinARoom).post(pkRoomSitDown).delete(pkRoomStandUp);
pkRoomRouter.route("/:rid/play").get(pkRoomStart).post(pkRoomAction);
pkRoomRouter.route("/:rid/rabbit").post(pkRoomPostRabbit);
pkRoomRouter.route("/:rid/show").post(pkRoomPostShow);

export default pokerRouter;
