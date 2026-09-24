import express from "express";
import { login, logout, me, register, updateprofile } from "../Controllers/auth.js";
import { requireAuth } from "../security/session.js";

const routes = express.Router();

routes.post("/register", register);
routes.post("/login", login);
routes.get("/me", requireAuth, me);
routes.post("/logout", logout);
routes.patch("/update/:id", requireAuth, updateprofile);
export default routes;
