import express from "express";
import { login, logout, me, register, updateprofile, updateCommentProfile, verifyLoginOtp } from "../controllers/auth.js";
import { revokeOtherSessions, revokeSession, revokeTrustedDevice, securityOverview, updateDownloadSecurity, updateTheme } from "../controllers/security.js";
import { requireAuth } from "../security/session.js";

const routes = express.Router();

routes.post("/register", register);
routes.post("/login", login);
routes.post("/login/otp", verifyLoginOtp);
routes.get("/me", requireAuth, me);
routes.post("/logout", logout);
routes.get("/security", requireAuth, securityOverview);
routes.delete("/security/sessions/others", requireAuth, revokeOtherSessions);
routes.delete("/security/sessions/:id", requireAuth, revokeSession);
routes.delete("/security/trusted-devices/:id", requireAuth, revokeTrustedDevice);
routes.patch("/preferences/theme", requireAuth, updateTheme);
routes.patch("/preferences/download-security", requireAuth, updateDownloadSecurity);
routes.patch("/comment-profile", requireAuth, updateCommentProfile);
routes.patch("/update/:id", requireAuth, updateprofile);
export default routes;
