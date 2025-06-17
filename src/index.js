import { server } from "./app.js";
import dotenv from 'dotenv'



dotenv.config({
    path: './env'
});

const PORT = process.env.PORT || 6000;

server.listen(PORT, () => {
    console.log("Server Running on PORT: ", PORT);
})

