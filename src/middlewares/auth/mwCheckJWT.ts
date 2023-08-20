import { auth } from "express-oauth2-jwt-bearer";

export const mwCheckJWT = auth({
   audience: "casino-api",
   issuerBaseURL: "https://dev-kj92tcix.jp.auth0.com/",
   tokenSigningAlg: "RS256",
});
