import express from "express";
import { getallvideo, uploadvideo } from "../Controllers/video.js";
import upload from "../filehelp/filehelp.js";

const routes = express.Router();

routes.post("/upload", upload.single("file"), uploadvideo);
routes.get("/getall", getallvideo);

export default routes;