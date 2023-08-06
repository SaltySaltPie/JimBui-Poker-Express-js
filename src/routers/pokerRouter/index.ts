import { Router } from "express";
import { pkRoomAction, pkRoomGetAllRooms, pkRoomJoinARoom, pkRoomSitDown, pkRoomStandUp, pkRoomStart } from "../../controllers/poker/controllers";

const pokerRouter = Router();

const pkRoomRouter = Router();
pokerRouter.use("/rooms", pkRoomRouter);
pkRoomRouter.route("/").get(pkRoomGetAllRooms);
pkRoomRouter.route("/:rid").get(pkRoomJoinARoom).post(pkRoomSitDown).delete(pkRoomStandUp);
pkRoomRouter.route("/:rid/play").get(pkRoomStart).post(pkRoomAction)

export default pokerRouter;
