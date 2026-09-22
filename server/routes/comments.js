import express from "express";
import { deletecomment, getallcomment, postcomment, editcomment } from "../Controllers/comments.js";

const routes = express.Router();
routes.get("/:videoid", getallcomment);
routes.post("/postcomment", postcomment);
routes.delete("/deletecomment/:id", deletecomment);
routes.post("/editcomment/:id", editcomment);
export default routes;
