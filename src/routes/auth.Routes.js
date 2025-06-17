import { Router } from "express";
import { createUser, loginUser, sendEmailVerificationOtp, verifyUser, resetPassword, sendForgotPasswordOtp, verifyResetPasswordOtp, refreshAccessToken, logoutUser } from "../controllers/auth.controller.js";
import { hashPassword, verifyJwt } from "../middleware/auth.middleware.js";


const router = Router()

router.post("/createUser",hashPassword,createUser)
router.post("/verifyEmail",verifyUser)
router.post("/loginUser",loginUser)
router.post("/verifyEmailWithOtp",sendEmailVerificationOtp)
router.post("/forgot-Password",sendForgotPasswordOtp)
router.post("/verifyresetPasswordWithOtp",verifyResetPasswordOtp)
router.post("/reset-Password", resetPassword)
router.post("/refresh-token", refreshAccessToken);
router.post("/logout", verifyJwt, logoutUser);


export {router}