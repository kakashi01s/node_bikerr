import { ApiResponse } from "../utils/apiResponse.js";
import { AsyncHandler } from "../utils/asyncHandler.js";
import bcrypt from "bcrypt";
import jwt from 'jsonwebtoken';

/**
 * Middleware to verify access tokens.
 */
const verifyJwt = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(403).json(new ApiResponse(403, {}, "Access denied. No token provided."));
    }

    const token = authHeader.split(" ")[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        console.error("Access token verification failed:", error.message);
        return res.status(401).json(new ApiResponse(401, {}, "Invalid or expired access token."));
    }
};

/**
 * Middleware to hash password (used during registration or password updates).
 */
const hashPassword = AsyncHandler(async (req, res, next) => {
    try {
        const { password } = req.body;

        if (!password) {
            return res.status(400).json(new ApiResponse(400, {}, "Password is required."));
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        req.body.password = hashedPassword;
        next();
    } catch (error) {
        console.error("Error hashing password:", error);
        return res.status(500).json(new ApiResponse(500, {}, "Internal server error"));
    }
});

export { hashPassword, verifyJwt };
