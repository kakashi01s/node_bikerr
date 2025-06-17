import { Router } from "express";
import { generateUploadUrl } from "../controllers/s3.controller.js";
import { verifyJwt } from "../middleware/auth.middleware.js";




const router = Router()

router.use(verifyJwt)
// Route to generate signed upload URL
router.post('/generate-upload-url', generateUploadUrl);



export {router}