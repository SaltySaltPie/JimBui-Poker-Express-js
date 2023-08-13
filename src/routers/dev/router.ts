import { Router } from "express";
import { devRoute1, devRoute2, devRoute3 } from "../../controllers/dev/controllers";

const devRouter = Router();
devRouter.use("/1", devRoute1);
devRouter.use("/2", devRoute2);
devRouter.use("/3", devRoute3);

export default devRouter;
