import cors from "cors";
import express from "express";
import bodyParser from "body-parser";
import mongoose from "mongoose";
import dotenv from "dotenv";
import userroutes from "./routes/auth.js";
import videoroutes from "./routes/video.js";
import likeroutes from "./routes/like.js";
import watchlaterroutes from "./routes/watchlater.js";
import historyroutes from "./routes/history.js";
import commentroutes from "./routes/comments.js";

dotenv.config()
const app=express()
import Path from "path"
app.use(cors())
app.use(express.json({limit:"30mb",extended:true}))
app.use(express.urlencoded({limit:"30mb",extended:true}))
app.use("/uploads", express.static(Path.join("uploads")))
app.get("/",(req,res)=>{
    res.send("You tube backend is working")
})
app.use(bodyParser.json())
app.use("/user",userroutes);
app.use("/video",videoroutes);
app.use("/like",likeroutes);
app.use("/watchlater",watchlaterroutes);
app.use("/history",historyroutes);
app.use("/comment", commentroutes);
const PORT=process.env.PORT || 5000

app.listen(PORT,()=>{
    console.log(`server running on port ${PORT}`)
})

const DBURL=process.env.DB_URL
mongoose.connect(DBURL).then(()=>{
    console.log("Mongodb connected")
}).catch((error)=>{
    console.log(error)
})
