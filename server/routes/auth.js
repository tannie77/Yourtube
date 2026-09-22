import express from "express";
import { login, updateprofile } from "../Controllers/auth.js";

const routes = express.Router(); 

routes.post("/login", login);
routes.patch("/update/:id", updateprofile);
export default routes; 
