
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import express, { urlencoded } from "express";
import http, { Server } from 'http'
import {socketService} from "./socket/socketService.js";


const app = express()


const server = http.createServer(app);

// Initialize Socket.IO with the HTTP server
socketService(server);



app.use(bodyParser.json())
app.use(express.json({limit: "10kb"}))
app.use(urlencoded({ extended: true, limit: "10kb"}))
app.use(express.static("public"))
app.use(cookieParser())
// app.use(morgan('tiny'))


// // routes import
import { router as authRouter } from "./routes/auth.Routes.js";
import { router as chatRouter } from "./routes/chat.Routes.js";
import { router as uploadRouter } from "./routes/upload.Routes.js";
import { router as tripRouter } from "./routes/trip.routes.js";
// import { router as adminRouter } from "./routes/admin.routes.js"
app.get('/api/v1', (req, res) => {
  // When a request comes in, send a simple text response
  res.send('Hello from your basic Express app!');
});
// //routes declaration
app.use("/api/v1/auth", authRouter)
app.use("/api/v1/chats", chatRouter)
app.use('/api/v1/uploads', uploadRouter)
app.use("/api/v1/trips", tripRouter)




export {app, server}