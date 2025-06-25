import { compare } from "bcrypt";
import { prisma } from "../DB/db.config.js";
import { createTraccarUser, updateTraccarPassword, generateTraccarToken, getTraccarSessionCookie } from "../middleware/traccar.middleware.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { AsyncHandler } from "../utils/asyncHandler.js";
import { sendEmail, sendmail } from "../utils/emailHandler.js";
import { generateOtp } from "../utils/otpHandler.js";
import bcrypt from "bcrypt";
import { generateAccessToken, generateRefreshToken } from "../utils/token.util.js";
import jwt from 'jsonwebtoken';



const refreshAccessToken = AsyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
  
    if (!refreshToken) {
      return res.status(400).json(new ApiResponse(400, {}, "Refresh token is required."));
    }
  
    try {
      // Verify token
      const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
  
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
      });
  
      if (!user || user.refreshToken !== refreshToken) {
        return res.status(403).json(new ApiResponse(403, {}, "Invalid refresh token."));
      }
  
      // Generate new access token
      const newAccessToken = generateAccessToken({ id: user.id, email: user.email });
  
      return res.status(200).json(
        new ApiResponse(200, { accessToken: newAccessToken }, "Access token refreshed.")
      );
    } catch (err) {
      console.error("Error refreshing token:", err);
      return res.status(401).json(new ApiResponse(401, {}, "Invalid or expired refresh token."));
    }
  });
const createUser = AsyncHandler(async (req, res) => {
    const { name, email, password } = req.body;

    // 1. Check if a user with the given email already exists
    const userExistsInLocal = await prisma.user.findUnique({ // Corrected: prisma.user.findUnique
        where: {
            email: email
        }
    });

    if (userExistsInLocal) {
        return res.status(400).json(new ApiResponse(400, {}, "User with this email already exists in our system."));
    }

    let newUser;
    // generate an OTP for the user to receive by email and save it in db
    const verificationToken = generateOtp();
    console.log("Email verfication token is :", verificationToken);

    try {
        // 2. Create the new user in the database
        newUser = await prisma.user.create({
            data: {
                name: name,
                email: email,
                password: password, // hashed with middleware hashpassword in auth middleware
                verificationToken: verificationToken // stored the otp in this field so we can check the otp after user is created
            },
            omit: {
                password:true,
                resetToken:true,
                verificationToken:true,
            }
        });

        console.log("User created in local DB Successfully", newUser);

        // 3. Send verification email
        const emailSubject = 'Verify your email address';
        const emailBody = `Your verification code is: ${verificationToken}`;

        try {
            // sending email to the newly registered user with the sendmail util in email handler
           await sendEmail( email, emailSubject, emailBody);

         
         
            console.log("Verification Email Sent to:", email);
            console.log(`Your verification code is: ${verificationToken}`);

            return res.status(200).json(new ApiResponse(200, {newUser}, " User Registered Successfully. Please verify your Email"))

        } catch (emailError) {
            console.error("Error sending verification email:", emailError);
            //  Handle email sending error.  For mobile, do NOT rollback.  Inform user.
            return res.status(200).json(new ApiResponse(200, { newUser, message: "User created, but verification email failed to send.  Please check your email settings and request a new verification link." }, "User created, but verification email failed to send.  Please check your email settings and request a new verification link."));

        }


    } catch (error) {
        // Handle user creation errors
        console.error("Error during local user creation:", error);
        return res.status(500).json(new ApiResponse(500, {}, "Failed to create user in local database."));
    }
});


const sendEmailVerificationOtp = AsyncHandler(async (req,res) => {
    const {email} = req.body


   
    const userExistsInLocal = await prisma.user.findUnique({
        where:{
            email: email
        }
    })

    if (!userExistsInLocal) {
        return res.status(404).json(new ApiResponse(404, {}, "User not found"))
    }
    // generate a new verification token
    const verificationToken = generateOtp();
    console.log("Email verfication token is :", verificationToken);
    

    //save the new verfication token to the database

    try {
            const updatedUser = await prisma.user.update({
                where: {
                    email: email
                },
                data: {
                    verificationToken: verificationToken
                }
            })

            console.log("New updated token :", updatedUser)
        
    } catch (error) {
        console.error("Error sending verification email:", emailError);
        
        return res.status(200).json(new ApiResponse(200, {},"Error white sending new otp" ));
    }


            // 3. Send verification email
            const emailSubject = 'Verify your email address';
            const emailBody = `Your verification code is: ${verificationToken}`;
    
            try {
                // sending email to the newly registered user with the sendmail util in email handler
                await sendmail("", "", res, email, emailSubject, emailBody);
                console.log("Verification Email Sent to:", email);
    
            } catch (emailError) {
                console.error("Error sending verification email:", emailError);
                //  Handle email sending error.  For mobile, do NOT rollback.  Inform user.
                return res.status(200).json(new ApiResponse(200, {},"OTP Send Failed" ));
            }
})

// controller to verify the email address via OTP
const verifyUser = AsyncHandler(async (req, res) => {
    console.log("verify email req received");
    const { token, userId, email, password } = req.body;

    console.log(" email=: ",email);


    // check if the user has sent a verification token or not
    if (!token ) {
        return res.status(400).json(new ApiResponse(400, {}, "Verification Token, User ID, and Email are Required"));
    }

    try {
        // find the user in db ,whether the user exists or not
        const userExistsInLocal = await prisma.user.findUnique({
            where: {
                email: email,
            },
        });

        if (!userExistsInLocal) {
            return res.status(404).json(new ApiResponse(404, {}, "No user found with such email")); // Changed message to reflect email
        }

        if (userExistsInLocal.isVerified) {
            return res.status(400).json(new ApiResponse(400, {}, "User Already Verified"));
        }
        // verify the token sent by the user with the token stored in the pg db
        if (userExistsInLocal.verificationToken !== token) {
            return res.status(400).json(new ApiResponse(400, {}, "Invalid verification token."));
        }

        // update the user table verification flag
        const updatedUser = await prisma.user.update({
            where: {
                email: email,
            },
            data: {
                isVerified: true,
                verificationToken: null,
            },
        });

        // if the user has been successfully verified, start the Traccar user creation process here
        if (updatedUser) {
            try {
                const traccarCreationResult = await createTraccarUser(updatedUser.name, updatedUser.email, password);

                if (!traccarCreationResult.success) {
                    console.error("Failed to create user in Traccar after verification. Rolling back local user:", updatedUser.id);
                    // Delete the local user if Traccar creation fails
                    await prisma.user.delete({
                        where: {
                            id: updatedUser.id,
                        },
                    });
                    return res.status(500).json(new ApiResponse(500, {}, "Registration could not be completed. Failed to create user on the Traccar server.")); // More informative
                }

                // IMPORTANT:  Do NOT send the password in the final response.
                const safeUserResponse = {
                    id: updatedUser.id,
                    name: updatedUser.name,
                    email: updatedUser.email,
                    isVerified: updatedUser.isVerified,
                    traccarId: traccarCreationResult.data.id,
                    created_at:updatedUser.created_at,
                    updated_at:updatedUser.updated_at
                    // ... include other safe user properties you want to expose
                };


                await prisma.user.update({
                    where:{
                        email: updatedUser.email
                    },
                    data:{
                        traccarId:traccarCreationResult.data.id
                    }
                })
                return res.status(200).json(
                    new ApiResponse(
                        200,
                        { user: safeUserResponse, traccarUser: traccarCreationResult.data }, // Removed password
                        "Email address verified successfully and Traccar user created."
                    )
                );
            } catch (traccarError) {
                // Handle errors from createTraccarUser
                console.error("Error creating Traccar user:", traccarError);
                return res.status(500).json(new ApiResponse(500, {}, "Failed to create user on Traccar server."));
            }
        }

        

        //  This handles the case where the user was updated, but for some reason,
        //  we didn't go through the Traccar creation (which should be impossible).
        return res.status(200).json(new ApiResponse(200, { user: updatedUser }, "Email address verified successfully."));
    } catch (error) {
        // Handle email verification errors
        console.error("Error verifying email:", error);
        return res.status(500).json(new ApiResponse(500, {}, "Failed to verify email address."));
    }
});


// controller to login user and generate traccar token and save in local db
const loginUser = AsyncHandler(async (req, res) => {
    const { email, password } = req.body;
  
    if (!email || !password) {
      return res.status(400).json(new ApiResponse(400, {}, "Email and password are required"));
    }
  
    const user = await prisma.user.findUnique({
      where: { email }
    });
  
    if (!user) {
      return res.status(404).json(new ApiResponse(404, {}, "User not found"));
    }
  
    if (!user.isVerified) {
      return res.status(400).json(new ApiResponse(400, {}, "Please verify your email first"));
    }
  
    const isPasswordValid = await compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json(new ApiResponse(401, {}, "Incorrect password"));
    }
  
    // Get Traccar Token
    const traccarTokenResult = await generateTraccarToken(email, password);
      const traccarSessionCookie =  await getTraccarSessionCookie(email,password);


    if (!traccarTokenResult.success) {
      return res.status(500).json(new ApiResponse(500, {}, "Failed to obtain Traccar token"));
    }
  
    if(!traccarSessionCookie.success) {
        return res.status(500).json(new ApiResponse(500, {}, "Failed to obtain Traccar Session"));
    }
    const traccarToken = traccarTokenResult.data;
    const traccarCookie = traccarSessionCookie.data;
  
    // Upsert traccar detail
    await prisma.traccarDetail.upsert({
      where: { traccarId: user.traccarId },
      update: { traccarToken },
      create: {
        userId: user.id,
        traccarId: user.traccarId,
        traccarToken
      }
    });
  
    // Tokens
    const accessToken = generateAccessToken({
      id: user.id,
      email: user.email,
      name: user.name, // Include the user's name
      profileImageKey: user.profileImageKey, // Include the profile image key
    });
    const refreshToken = generateRefreshToken({ id: user.id });
  
  
    // Save refresh token in DB
    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken }
    });
  
    const { password: _, ...userData } = user;
  
    return res.status(200).json(
      new ApiResponse(200, {
        user: {...userData,
        accessToken,
        refreshToken,
        traccarToken,
        'sessionCookie': traccarCookie
    }
      }, "Login successful")
    );
  });
// controller to SEND PASSWORD RESET OTP
const sendForgotPasswordOtp = AsyncHandler(async (req,res) => {
    const {email} = req.body
   
    const userExistsInLocal = await prisma.user.findUnique({
        where:{
            email: email
        }
    })

    if (!userExistsInLocal) {
        return res.status(404).json(new ApiResponse(404, {}, "User not found"))
    }
    // generate a new verification token
    const resetToken = generateOtp();
    console.log("Password reset token is :", resetToken);
    

    //save the new verfication token to the database

    try {
            const updatedUser = await prisma.user.update({
                where: {
                    email: email
                },
                data: {
                    resetToken: resetToken
                }
            })

            console.log("New updated token :", updatedUser)
        
    } catch (error) {
        console.error("Forgot Password Reset token:", emailError);
        
        return res.status(200).json(new ApiResponse(200, {},"Error white sending new otp" ));
    }


            // 3. Send verification email
            const emailSubject = 'Verify your email address';
            const emailBody = `Your Password Reset Token is: ${resetToken}`;
    
            try {
                // sending email to the newly registered user with the sendmail util in email handler
                await sendmail("", "", res, email, emailSubject, emailBody);
                console.log("Verification Email Sent to:", email);

                return res.status(200).json(new ApiResponse(200,{}, "OTP Sent successfully."))
    
            } catch (emailError) {
                console.error("Error sending verification email:", emailError);
                //  Handle email sending error.  For mobile, do NOT rollback.  Inform user.
                return res.status(200).json(new ApiResponse(200, {},"OTP Send Failed" ));
            }
})



//controller to VERIFY PASSWORD Reset OTP
const verifyResetPasswordOtp = AsyncHandler(async (req, res) => {
    const { token, email} = req.body;

    // check if the user has sent a verification token or not
    if (!token || !email) { // Simplified condition
        return res.status(400).json(new ApiResponse(400, {}, "Verification Token, User ID, and Email are Required"));
    }

    try {
        // find the user in db ,weather the user exists or not
        const userExistsInLocal = await prisma.user.findUnique({ // Corrected: prisma.user.findUnique
            where: {
                email: email
            }
        });

        if (!userExistsInLocal) {
            // if there is no user with such id
            return res.status(404).json(new ApiResponse(404, {}, "No user found with such id")); // Consistent return
        }

        // verify the token sent by the user with the token stored in the pg db
        if (userExistsInLocal.resetToken !== token) {
            return res.status(400).json(new ApiResponse(400, {}, "Invalid Reset token/otp."));
        }

        // update he user table verification flag
        const updatedUser = await prisma.user.update({
            where: {
                email: email
            },
            data: {        
                resetToken: token
            },
            omit: {
                password: true,
                resetToken:true,
                verificationToken:true,
            }
        });

        return res.status(200).json(new ApiResponse(200, { user: updatedUser }, "OTP Verified")); // More specific message
    } catch (error) {
        // Handle email verification errors
        console.error("Error verifying email:", error);
        return res.status(500).json(new ApiResponse(500, {}, "Failed to verify email address."));
    }
});


// controller to RESET-PASSWORD
const resetPassword = AsyncHandler(async (req, res) => {
    const { email, password, token } = req.body; // Assuming middleware hashes 'password'

    if (!email) {
        return res.status(400).json(new ApiResponse(400, {}, "Email is required"));
    }

    const userExistsInLocal = await prisma.user.findUnique({
        where: {
            email: email,
            resetToken: token
        }
    });

    if (!userExistsInLocal) {
        return res.status(404).json(new ApiResponse(404, {}, "Invalid or expired reset token. Please request a new one."));
    }


    try {
        await prisma.$transaction(async (tx) => {
            const changePasswordResult = await updateTraccarPassword(userExistsInLocal.traccarId, 
                password, 
                userExistsInLocal.name, 
                userExistsInLocal.email);

                if (!changePasswordResult.success) {
                    console.error("Failed to change password in Traccar", userExistsInLocal.traccarId);
                    res.status(500).json(new ApiResponse(500,{},"Failed to reset password"))
                }

                const hashedPassword = await bcrypt.hash(password, 10);

                const updatedUser = await tx.user.update({
                    where: {
                        email: userExistsInLocal.email,
                    },
                    data: {
                        password: hashedPassword, // Expecting this to be hashed by middleware
                        resetToken: null
                    },
                    omit: {
                        password: true,
                        resetToken:true,
                        verificationToken:true,
                    }
                })

                return res.status(200).json(new ApiResponse(200,{user : updatedUser}, "Password Reset successfully."))
        })

        
    } catch (error) {
        console.log("Error while resetting password",error);
        res.status(500).json(new ApiResponse(500,{},error))
    }

    // try {

    //     const changePasswordResult = await updateTraccarPassword(userExistsInLocal.traccarId, password, userExistsInLocal.name, userExistsInLocal.email)

    //     if (!changePasswordResult.success) {
    //         console.error("Failed to change password in Traccar", userExistsInLocal.traccarId);

    //         return res.status(500).json(new ApiResponse(500, {}, "Failed to change password")); // More informative
    //     }

    //     const hashedPassword = await bcrypt.hash(password, 10)
        

    //     const updatedUser = await prisma.user.update({
    //         where: {
    //             email: userExistsInLocal.email,
    //         },
    //         data: {
    //             password: hashedPassword, // Expecting this to be hashed by middleware
    //             resetToken: null
    //         },
    //         select: {
    //             id: true,
    //             name: true,
    //             email: true,
    //             isVerified: true,
    //             traccarId:true
    //         }
    //     });

    //     return res.status(200).json(new ApiResponse(200, { user: updatedUser }, "Password reset successfully."));

    // } catch (error) {
    //     console.error("Error while updating the reset password:", error);
    //     return res.status(500).json(new ApiResponse(500, {}, "Failed to reset password. Please try again later."));
    // }
});


// logout user

const logoutUser = AsyncHandler(async (req, res) => {
    const userId = req.user?.id;
  
    if (!userId) {
      return res.status(401).json(new ApiResponse(401, {}, "Unauthorized."));
    }
  
    try {
      // Clear refresh token from database
      await prisma.user.update({
        where: { id: userId },
        data: { refreshToken: null },
      });
  
      return res.status(200).json(new ApiResponse(200, {}, "Successfully logged out."));
    } catch (error) {
      console.error("Logout failed:", error);
      return res.status(500).json(new ApiResponse(500, {}, "Logout failed due to server error."));
    }
  });


export { 
    createUser, 
    verifyUser, 
    loginUser, 
    sendEmailVerificationOtp, 
    sendForgotPasswordOtp, 
    resetPassword,
    verifyResetPasswordOtp,
    refreshAccessToken,
    logoutUser
};