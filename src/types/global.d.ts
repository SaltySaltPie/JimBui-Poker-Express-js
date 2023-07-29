import { TUserCache } from "./common";

declare global {
   namespace NodeJS {
      interface ProcessEnv {
         MODE: "DEV" | "PRO";
         PORT: string;
         PG_HOST: string;
         PG_USER: string;
         PG_PASS: string;
         PG_PORT: string;
      }
   }
   namespace Express {
      interface Locals {
         user: TUserCache;
      }
   }

}


export {};
