import { Router } from "express";
import { devRoute1, devRoute2 } from "../../controllers/devControllers";

const devRouter = Router();
devRouter.use("/1", devRoute1);
devRouter.use("/2", devRoute2);

export default devRouter;
