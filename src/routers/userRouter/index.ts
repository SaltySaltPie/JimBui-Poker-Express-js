import { Router } from "express";
import { uConfigUpdateName, uGetUserProfile } from "../../controllers/userControllers";

const userRouter = Router();
userRouter.route("/me").get(uGetUserProfile);

const userConfigRouter = Router();
userRouter.use("/config", userConfigRouter);
userConfigRouter.route("/name").post(uConfigUpdateName);

export default userRouter;
