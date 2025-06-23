import { prisma } from "../DB/db.config.js";
import { S3Util } from "../utils/s3_util.js"; // Assuming you have S3Util for deletion
import { AsyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { io } from "../socket/socketService.js";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";


/**
 * Enum for Chat Roles
 */
const ChatRole = {
  OWNER: 'OWNER',
  MODERATOR: 'MODERATOR',
  MEMBER: 'MEMBER',
};

/**
 * Enum for Join Request Status
 */
const JoinRequestStatus = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  DENIED: "DENIED"
};


/**
 * Create a new chat room (group)
 * @route POST /api/chatrooms
 * @access Private (only authenticated users can create a room)
 */
const createChatRoom = AsyncHandler(async (req, res) => {
  // Added 'image' to the destructured body
  const { name, description, state, city, isGroup = true, isInviteOnly = false, image } = req.body;
  const userId = req.user.id;

  // Validate input (name is required, add other validations as needed)
  if (!name || name.trim().length < 3) {
      return res.status(400).json(new ApiResponse(400, {}, "Name is required and should be at least 3 characters"));
  }

  try {
      // Sanitize name and other string inputs
      const sanitizedName = name.trim();
      const sanitizedDescription = description ? description.trim() : null;
      const sanitizedState = state ? state.trim() : null;
      const sanitizedCity = city ? city.trim() : null;

      // Check if chat room already exists by name if it's a group
      // For non-group chats (direct messages), you might have different logic
      if (isGroup) {
         const existingChatRoom = await prisma.chatRoom.findUnique({
             where: { name: sanitizedName },
         });

         if (existingChatRoom) {
             return res.status(409).json(new ApiResponse(409, {}, "Chat room with this name already exists"));
         }
      }


      // Create the new chat room
      const chatRoom = await prisma.chatRoom.create({
          data: {
              name: sanitizedName,
              description: sanitizedDescription,
              state: sanitizedState,
              city: sanitizedCity,
              isGroup,
              isInviteOnly,
              image: image || null, // Store the S3 key, use null if not provided
              users: {
                  create: {
                      userId,
                      role: ChatRole.OWNER, // Creator is the owner
                  },
              },
          },
          // Include the image in the response
          include: {
            users: {
              select: {
                userId: true,
                role: true,
              }
            }
          }
      });

      // Log the successful creation
      console.log(`Chat room "${sanitizedName}" created successfully by user ${userId}`);

      // Return success response
      return res.status(201).json(new ApiResponse(201, chatRoom, 'Chat room created successfully'));

  } catch (error) {
      // Log unexpected errors for debugging
      console.error("Error creating chat room:", error);

      // Handle specific database errors if needed
      if (error instanceof PrismaClientKnownRequestError) {
        console.error("Prisma Error Code:", error.code);
        return res.status(400).json(new ApiResponse(400, {}, "Database error creating chat room: " + error.message));
      }

      // Return a generic error message for other errors
      return res.status(500).json(new ApiResponse(500, {}, "An error occurred while creating the chat room"));
  }
});


/**
 * Update the details of an existing chat room (name, privacy settings, image, etc.)
 * @route PUT /api/chatrooms/:id
 * @access Private (only the owner or moderators can update)
 */
const updateChatRoom = AsyncHandler(async (req, res) => {
  // Added 'image' to the destructured body
  const { name, description, state, city, isGroup, isInviteOnly, image } = req.body;
  const chatRoomId = parseInt(req.params.id); // Ensure ID is parsed as integer
  const userId = req.user.id;

  // Validate chatRoomId
  if (isNaN(chatRoomId)) {
    return res.status(400).json(new ApiResponse(400, {}, "Invalid chat room ID"));
  }

  // Validate input (name update validation)
  if (name && name.trim().length < 3) {
    return res.status(400).json(new ApiResponse(400, {}, "Name should be at least 3 characters"));
  }

  try {
    // Find the chat room and include users to check permissions
    const chatRoom = await prisma.chatRoom.findUnique({
      where: { id: chatRoomId },
      select: { // Select fields needed for permission check and current image key
        id: true,
        name: true,
        image: true, // Fetch the current image key
        isGroup: true,
        isInviteOnly: true,
        users: {
          where: { userId }, // Only fetch the current user's role in this room
          select: {
            role: true,
          },
        },
      },
    });

    if (!chatRoom) {
      return res.status(404).json(new ApiResponse(404, {}, "Chat room not found"));
    }

    // Check if the user is the owner or a moderator of the chat room
    const userRoleInChatRoom = chatRoom.users[0]?.role; // Get the role of the requesting user
    if (!userRoleInChatRoom || (userRoleInChatRoom !== ChatRole.OWNER && userRoleInChatRoom !== ChatRole.MODERATOR)) {
      return res.status(403).json(new ApiResponse(403, {}, "You do not have permission to update this chat room"));
    }

    // Prepare update data, only include fields if they are provided in the request body
    const updateData = {
        updatedAt: new Date(), // Always update timestamp
    };

    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description ? description.trim() : null;
    if (state !== undefined) updateData.state = state ? state.trim() : null;
    if (city !== undefined) updateData.city = city ? city.trim() : null;
    if (isGroup !== undefined) updateData.isGroup = isGroup;
    if (isInviteOnly !== undefined) updateData.isInviteOnly = isInviteOnly;

    // Handle image update and potential deletion of the old image
    if (image !== undefined) { // Check if 'image' was included in the request body
        // If there was an old image and a new image is provided or the image is being removed (image is null)
        if (chatRoom.image && chatRoom.image !== image) {
            try {
                // Attempt to delete the old image from S3
                await S3Util.deleteFile(chatRoom.image);
                console.log(`Deleted old chat room image: ${chatRoom.image}`);
            } catch (s3Error) {
                console.warn(`Failed to delete old chat room image ${chatRoom.image}:`, s3Error.message);
                // Log the warning but don't stop the update operation
            }
        }
        // Set the new image key (or null if image is being removed)
        updateData.image = image || null;
    }


    // Update the chat room
    const updatedChatRoom = await prisma.chatRoom.update({
      where: { id: chatRoomId },
      data: updateData,
      // Include the image in the response
       include: {
            users: {
              select: {
                userId: true,
                role: true,
              }
            }
          }
    });

    // Return success response with the updated chat room
    return res.status(200).json(new ApiResponse(200, updatedChatRoom, 'Chat room updated successfully'));
  } catch (error) {
    console.error("Error updating chat room:", error);

     if (error instanceof PrismaClientKnownRequestError) {
        console.error("Prisma Error Code:", error.code);
        // Handle unique constraint violation if name is updated to an existing name
        if (error.code === 'P2002') {
            return res.status(409).json(new ApiResponse(409, {}, "Chat room with this name already exists"));
        }
        return res.status(400).json(new ApiResponse(400, {}, "Database error updating chat room: " + error.message));
      }

    return res.status(500).json(new ApiResponse(500, {}, "An error occurred while updating the chat room"));
  }
});

/**
 * Get all chat rooms for the authenticated user.
 * Includes the latest message and unread counts.
 * @route GET /api/chatrooms
 * @access Private
 */
const getAllChatRoomsForUser = AsyncHandler(async (req, res) => {
  const userId = req.user.id;
  const page = parseInt(req.query.page) || 1; // Default to page 1
  const limit = parseInt(req.query.limit) || 10; // Default limit to 10
  const skip = (page - 1) * limit;

  try {
    const totalChatRooms = await prisma.chatRoom.count({
      where: {
        users: {
          some: {
            userId,
          },
        },
      },
    });

    const chatRooms = await prisma.chatRoom.findMany({
      where: {
        users: {
          some: {
            userId,
          },
        },
      },
      // Prisma includes all scalar fields (like 'image') by default when using 'include'
      include: {
        users: {
          select: {
            userId: true,
            role: true,
            lastReadAt: true,
            chatRoomId: true,
          },
        },
        messages: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 1, // latest message only
          select: {
            id: true,
            content: true,
            createdAt: true,
            sender: {
              select: {
                id: true,
                name: true,
                email: true,
                profileImageKey: true,
              },
            },
            // Include attachment details if snippet needs to reflect it
            attachments: {
                select: {
                    fileType: true,
                }
            }
          },
        },
      },
      skip: skip,
      take: limit,
    });

    if (!chatRooms.length && page === 1) {
      return res.status(404).json(new ApiResponse(404, {}, "No chat rooms found for this user"));
    } else if (!chatRooms.length && page > 1) {
      return res.status(200).json(new ApiResponse(200, [], "No more chat rooms found"));
    }

    // For each room, compute unread count based on lastReadAt
    const chatRoomsWithUnread = await Promise.all(
      chatRooms.map(async (room) => {
        const userInRoom = room.users.find((u) => u.userId === userId);
        // Use new Date(0) for users who have never read the room
        const lastReadAt = userInRoom?.lastReadAt ?? new Date(0);

        const unreadCount = await prisma.message.count({
          where: {
            chatRoomId: room.id,
            senderId: { not: userId },
            createdAt: { gt: lastReadAt },
          },
        });

         // Determine the last message snippet
         const lastMessage = room.messages[0];
         let lastMessageSnippet = 'No messages yet';
         if (lastMessage) {
             if (lastMessage.content) {
                 lastMessageSnippet = lastMessage.content;
             } else if (lastMessage.attachments && lastMessage.attachments.length > 0) {
                 lastMessageSnippet = '📷 Image/File'; // Indicate presence of attachment
             }
             // Truncate snippet if necessary
             lastMessageSnippet = lastMessageSnippet.length > 50 ? lastMessageSnippet.substring(0, 47) + '...' : lastMessageSnippet;
         }


        return {
          ...room, // This will include the 'image' field by default
          unreadCount,
          lastMessageSnippet, // Add the snippet
          lastMessageTime: lastMessage ? lastMessage.createdAt : room.createdAt, // Time of the last message or room creation
        };
      })
    );

    const totalPages = Math.ceil(totalChatRooms / limit);

    const responseData = {
      data: chatRoomsWithUnread,
      pagination: {
        currentPage: page,
        totalPages: totalPages,
        totalItems: totalChatRooms,
        itemsPerPage: limit,
      },
    };

    return res
      .status(200)
      .json(new ApiResponse(200, responseData, "Chat rooms fetched successfully"));
  } catch (error) {
    console.error("Error fetching chat rooms:", error);
    return res
      .status(500)
      .json(new ApiResponse(500, {}, "An error occurred while fetching the chat rooms"));
  }
});


/**
 * Get details for a specific chat room, including members and paginated messages.
 * @route GET /api/chatrooms/:chatRoomId
 * @access Private
 */
const getChatRoomDetails = AsyncHandler(async (req, res) => {
  const chatRoomId = parseInt(req.params.chatRoomId); // Ensure ID is parsed as integer
  const userId = req.user.id;

  // Pagination params for messages
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20; // Messages per page
  const offset = (page - 1) * limit;
  const cursorId = req.query.cursor ? parseInt(req.query.cursor) : null; // Cursor for older messages

  // Validate chatRoomId
  if (isNaN(chatRoomId)) {
    return res.status(400).json(new ApiResponse(400, {}, "Invalid chatRoomId"));
  }

  try {
    // Check user membership and get last read timestamp in a single query
    const membership = await prisma.chatRoomUser.findUnique({
      where: {
        userId_chatRoomId: {
          userId: userId,
          chatRoomId: chatRoomId,
        },
      },
      select: {
        lastReadAt: true, // Select lastReadAt for unread count calculation
        role: true, // Include role if needed for frontend display or permissions within the room view
      }
    });

    if (!membership) {
      return res.status(403).json(new ApiResponse(403, {}, "You are not a member of this chat room"));
    }

    // Fetch chat room details, including members (excluding messages here as they are paginated)
    const chatRoom = await prisma.chatRoom.findUnique({
      where: { id: chatRoomId },
      // Prisma includes all scalar fields (like 'image') by default when using 'include'
      include: {
        users: { // Include users with selected fields for member list
          select: {
            userId: true,
            role: true,
            user: {
              select: {
                id: true,
                name: true,
                profileImageKey: true, // Include member profile images
              },
            },
          },
        },
        // Do NOT include messages here, they are fetched separately with pagination
      },
    });

    if (!chatRoom) {
      // This case should ideally not happen if membership exists, but good for robustness
      return res.status(404).json(new ApiResponse(404, {}, "Chat room not found"));
    }

    // Fetch paginated messages
    const messages = await prisma.message.findMany({
      where: {
        chatRoomId: chatRoomId,
      },
      orderBy: {
        createdAt: 'desc', // Order by creation date descending (latest first)
      },
      take: limit, // Limit the number of messages per fetch
      ...(cursorId && { // Apply cursor pagination logic if cursorId is provided
          cursor: { id: cursorId }, // Start fetching AFTER the message with this ID
          skip: 1, // Skip the cursor message itself
      }),
      select: {
        id: true,
        content: true,
        createdAt: true,
        isEdited: true,
        parentMessageId: true, // Include parentMessageId
        sender: { // Select sender details for the message
          select: {
            id: true,
            name: true,
            profileImageKey: true, // Include sender profile image
          },
        },
        attachments: true, // Include attachments for the message
          parentMessage: { // Include the parent message details if this is a reply
              select: { // Select necessary fields for the parent message
                id: true,
                content: true,
                sender: {
                  select: {
                    id: true,
                    name: true,
                  }
                },
                // Include parent's attachments if needed in the quote UI
                attachments: {
                   select: {
                      fileType: true,
                   }
                }
              }
          },
      },
    });

    // Count total messages for pagination metadata
    const totalMessages = await prisma.message.count({
      where: { chatRoomId: chatRoomId },
    });

    // Count unread messages based on lastReadAt from membership
    let unreadMessages = 0;
    if (membership.lastReadAt) {
      unreadMessages = await prisma.message.count({
        where: {
          chatRoomId: chatRoomId,
          // Count messages created AFTER the user's lastReadAt timestamp
          createdAt: { gt: membership.lastReadAt },
          senderId: { not: userId } // Exclude messages sent by the current user
        },
      });
    } else {
        // If lastReadAt is null, it means the user has never read this chat.
        // Count all messages in the chat room as unread, excluding those sent by the current user.
        unreadMessages = await prisma.message.count({
            where: {
                chatRoomId: chatRoomId,
                senderId: { not: userId }
            }
        });
    }

       // Determine if there are potentially more messages older than the last fetched one
       // If the number of messages returned equals the limit, assume there's another page.
       const hasMore = messages.length === limit; // Simple check based on limit


    // Return the combined chat room details, paginated messages, and pagination info
    return res.status(200).json(new ApiResponse(200, {
      ...chatRoom, // Spread the chat room details (includes 'image')
      currentUserRole: membership.role, // Include the current user's role in this room
      messages: messages, // Include the fetched messages
      pagination: { // Include pagination details
        totalMessages: totalMessages,
        currentPage: page,
        pageSize: limit,
        nextCursor: messages.length > 0 ? messages[messages.length - 1].id : null, // Cursor for the next page (ID of the oldest message)
        hasMore: hasMore, // Indicate if more messages are available
      },
      unreadMessages: unreadMessages, // Include unread messages count
    }, "Chat room details fetched successfully"));
  } catch (error) {
      console.error("Error fetching chat room details:", error);

      if (error instanceof PrismaClientKnownRequestError) {
          console.error("Prisma Error Code:", error.code);
            return res.status(400).json(new ApiResponse(400, {}, "Database error fetching chat room details: " + error.message));
      }

      return res.status(500).json(new ApiResponse(500, {}, "An error occurred while fetching chat room details"));
  }
});



const updateLastRead = AsyncHandler(async (req, res) => {
  const { chatRoomId } = req.params;
  const userId = req.user.id;

  const parsedChatRoomId = parseInt(chatRoomId);
  if (isNaN(parsedChatRoomId)) {
    return res.status(400).json(new ApiResponse(400, {}, "Invalid chat room ID"));
  }

  const chatRoomMembership = await prisma.chatRoomUser.findUnique({
    where: {
      userId_chatRoomId: {
        userId,
        chatRoomId: parsedChatRoomId,
      },
    },
  });

  if (!chatRoomMembership) {
    return res.status(404).json(new ApiResponse(404, {}, "You are not a member of this chat room"));
  }

  await prisma.chatRoomUser.update({
    where: {
      userId_chatRoomId: {
        userId,
        chatRoomId: parsedChatRoomId,
      },
    },
    data: {
      lastReadAt: new Date(),
    },
  });
  io.emit('conversationUpdated') // This is a broad emit, consider targeting specific users/rooms
  return res.status(200).json(new ApiResponse(200, {}, "Marked all messages as read"));

});

const getUnreadCounts = AsyncHandler(async (req, res) => {
  const userId = req.user.id;

  // Fetch rooms the user is part of
  const rooms = await prisma.chatRoomUser.findMany({
    where: { userId },
    select: {
      chatRoomId: true,
      lastReadAt: true,
      chatRoom: {
        select: { name: true, id: true } // Includes chat room name and ID
      },
    },
  });

  const unreadCounts = await Promise.all(
    rooms.map(async ({ chatRoomId, lastReadAt, chatRoom }) => {
      const count = await prisma.message.count({
        where: {
          chatRoomId,
          createdAt: {
            gt: lastReadAt || new Date(0), // If never read, count all
          },
          senderId: {
            not: userId, // Do not count own messages
          }
        },
      });

      return {
        chatRoomId,
        chatRoomName: chatRoom.name,
        unreadCount: count,
      };
    })
  );

  return res.status(200).json(new ApiResponse(200, unreadCounts, "Unread message counts fetched"));
});


const joinChatRoom = AsyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { chatRoomId } = req.params;

  try {
    const parsedChatRoomId = parseInt(chatRoomId);
    if (isNaN(parsedChatRoomId)) {
      return res.status(400).json(new ApiResponse(400, {}, "Invalid chat room ID"));
    }

    // Check if room exists
    const chatRoom = await prisma.chatRoom.findUnique({
      where: { id: parsedChatRoomId },
    });

    if (!chatRoom) {
      return res.status(404).json(new ApiResponse(404, {}, "Chat room not found"));
    }

    // Check if user is already a member
    const isAlreadyMember = await prisma.chatRoomUser.findUnique({
      where: {
        userId_chatRoomId: {
          userId,
          chatRoomId: parsedChatRoomId,
        },
      },
    });

    if (isAlreadyMember) {
      return res.status(409).json(new ApiResponse(409, {}, "You are already a member of this chat room"));
    }

    if (chatRoom.isInviteOnly) {
      // Check if join request already exists
      const existingRequest = await prisma.joinRequest.findUnique({
        where: {
          userId_chatRoomId: {
            userId,
            chatRoomId: parsedChatRoomId,
          },
        },
      });

      if (existingRequest) {
        return res.status(409).json(new ApiResponse(409, {}, "Join request already sent"));
      }

      // Create join request
      const joinRequest = await prisma.joinRequest.create({
        data: {
          userId,
          chatRoomId: parsedChatRoomId,
          status: JoinRequestStatus.PENDING,
        },
      });

      return res.status(200).json(new ApiResponse(200, joinRequest, "Join request sent"));
    }

    // If room is open, add user directly
    const addedUser = await prisma.chatRoomUser.create({
      data: {
        userId,
        chatRoomId: parsedChatRoomId,
        role: ChatRole.MEMBER,
      },
    });

    return res.status(201).json(new ApiResponse(201, addedUser, "Joined chat room successfully"));

  } catch (error) {
    console.error("Error joining chat room:", error);
    if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
         // Handle potential race condition where user is added right before this check
        return res.status(409).json(new ApiResponse(409, {}, "You are already a member of this chat room or a request is pending/processed."));
    }
    return res.status(500).json(new ApiResponse(500, {}, "An unexpected error occurred"));
  }
});


// handle join request
const handleJoinRequest = AsyncHandler(async (req, res) => {
  const { chatRoomId, userId } = req.params; // userId here is the user making the request
  const { targetUserId, action } = req.body; // targetUserId is the user whose request is being handled, action = 'approve' or 'deny'
  const currentUserId = req.user.id; // Ensure we use the authenticated user's ID

  try {
    const parsedChatRoomId = parseInt(chatRoomId);
    const parsedTargetUserId = parseInt(targetUserId);

     if (isNaN(parsedChatRoomId) || isNaN(parsedTargetUserId)) {
      return res.status(400).json(new ApiResponse(400, {}, "Invalid IDs provided"));
    }

    if (!['approve', 'deny'].includes(action)) {
      return res.status(400).json(new ApiResponse(400, {}, "Action must be 'approve' or 'deny'"));
    }

    // Check if current user has permission (is OWNER or MODERATOR in the chat room)
    const currentUserInRoom = await prisma.chatRoomUser.findUnique({
      where: {
        userId_chatRoomId: {
          userId: currentUserId,
          chatRoomId: parsedChatRoomId,
        },
      },
      select: {
        role: true,
      },
    });

    if (!currentUserInRoom || ![ChatRole.OWNER, ChatRole.MODERATOR].includes(currentUserInRoom.role)) {
      return res.status(403).json(new ApiResponse(403, {}, "You are not authorized to manage join requests for this chat room"));
    }

    // Find the join request
    const joinRequest = await prisma.joinRequest.findUnique({
      where: {
        userId_chatRoomId: {
          userId: parsedTargetUserId, // Look for the request from the target user
          chatRoomId: parsedChatRoomId,
        },
      },
    });

    if (!joinRequest) {
      return res.status(404).json(new ApiResponse(404, {}, "Join request not found"));
    }

    if (joinRequest.status !== JoinRequestStatus.PENDING) {
      return res.status(400).json(new ApiResponse(400, {}, "Join request has already been processed"));
    }

    // Use a transaction for approval to ensure both steps succeed or fail together
    await prisma.$transaction(async (tx) => {
        if (action === 'approve') {
          // Add user to chat room
          await tx.chatRoomUser.create({
            data: {
              userId: parsedTargetUserId,
              chatRoomId: parsedChatRoomId,
              role: ChatRole.MEMBER,
            },
          });

          // Update join request status to APPROVED
          await tx.joinRequest.update({
            where: {
              userId_chatRoomId: {
                userId: parsedTargetUserId,
                chatRoomId: parsedChatRoomId,
              },
            },
            data: { status: JoinRequestStatus.APPROVED },
          });

          // TODO: Optional - Notify the target user they have been approved
          // io.to(parsedTargetUserId).emit('joinRequestApproved', { chatRoomId: parsedChatRoomId });

          return res.status(200).json(new ApiResponse(200, {}, "User added to chat room and request approved"));
        } else { // action === 'deny'
           // Update join request status to DENIED
          await tx.joinRequest.update({
            where: {
              userId_chatRoomId: {
                userId: parsedTargetUserId,
                chatRoomId: parsedChatRoomId,
              },
            },
            data: { status: JoinRequestStatus.DENIED },
          });
           // TODO: Optional - Notify the target user their request was denied
          // io.to(parsedTargetUserId).emit('joinRequestDenied', { chatRoomId: parsedChatRoomId });

          return res.status(200).json(new ApiResponse(200, {}, "Join request denied"));
        }
    });


  } catch (error) {
    console.error("Error handling join request:", error);
     if (error instanceof PrismaClientKnownRequestError) {
        console.error("Prisma Error Code:", error.code);
        // Handle unique constraint violation if the user is already a member (should be caught by check above, but as a fallback)
        if (error.code === 'P2002') {
             return res.status(409).json(new ApiResponse(409, {}, "User is already a member of this chat room."));
        }
         return res.status(400).json(new ApiResponse(400, {}, "Database error handling join request: " + error.message));
      }
    return res.status(500).json(new ApiResponse(500, {}, "An unexpected error occurred while handling the join request"));
  }
});




// fetch all pending requests for a specific group
const getJoinRequestsForChatRoom = AsyncHandler(async (req, res) => {
  const { chatRoomId } = req.params;
  const userId = req.user.id; // User requesting the list of join requests

  try {
    const parsedChatRoomId = parseInt(chatRoomId);
    if (isNaN(parsedChatRoomId)) {
      return res.status(400).json(new ApiResponse(400, {}, "Invalid chat room ID"));
    }


    // Ensure the user is part of the room and has permission (OWNER or MODERATOR)
    const member = await prisma.chatRoomUser.findUnique({
      where: {
        userId_chatRoomId: {
          userId,
          chatRoomId: parsedChatRoomId,
        },
      },
      select: {
         role: true, // Select the role to check permissions
      }
    });

    if (!member || ![ChatRole.OWNER, ChatRole.MODERATOR].includes(member.role)) {
      return res.status(403).json(new ApiResponse(403, {}, "You are not authorized to view join requests for this room"));
    }

    // Get all pending join requests for this room
    const requests = await prisma.joinRequest.findMany({
      where: {
        chatRoomId: parsedChatRoomId,
        status: JoinRequestStatus.PENDING, // Only fetch pending requests
      },
      include: {
        user: { // Include details of the user who sent the request
          select: {
            id: true,
            name: true,
            email: true, // Consider if email should be public
            profileImageKey: true, // Include user profile image
          },
        },
      },
       orderBy: {
           requestedAt: 'asc', // Order by when the request was made
       }
    });

     if (!requests || requests.length === 0) {
         return res.status(404).json(new ApiResponse(404, {}, "No pending join requests found for this chat room"));
     }

    return res.status(200).json(new ApiResponse(200, requests, "Pending join requests fetched successfully"));

  } catch (error) {
    console.error("Error fetching join requests:", error);

     if (error instanceof PrismaClientKnownRequestError) {
          console.error("Prisma Error Code:", error.code);
          return res.status(400).json(new ApiResponse(400, {}, "Database error fetching join requests: " + error.message));
      }

    return res.status(500).json(new ApiResponse(500, {}, "An error occurred while retrieving join requests"));
  }
});



const removeUserFromChatRoom = AsyncHandler(async (req, res) => {
  const { chatRoomId, targetUserId } = req.params;
  const userId = req.user.id; // User performing the removal

  try {
    const parsedChatRoomId = parseInt(chatRoomId);
    const parsedTargetUserId = parseInt(targetUserId);

    if (isNaN(parsedChatRoomId) || isNaN(parsedTargetUserId)) {
        return res.status(400).json(new ApiResponse(400, {}, "Invalid IDs provided"));
    }

    if (parsedTargetUserId === userId) {
      return res.status(400).json(new ApiResponse(400, {}, "You cannot remove yourself. Use leave chat room function."));
    }

    // Fetch roles of both the requester and the target in the specific chat room
    const [requester, target] = await Promise.all([
        prisma.chatRoomUser.findUnique({
          where: {
            userId_chatRoomId: {
              userId,
              chatRoomId: parsedChatRoomId,
            },
          },
           select: { role: true }
        }),
        prisma.chatRoomUser.findUnique({
          where: {
            userId_chatRoomId: {
              userId: parsedTargetUserId,
              chatRoomId: parsedChatRoomId,
            },
          },
           select: { role: true }
        })
    ]);


    if (!requester) {
      return res.status(403).json(new ApiResponse(403, {}, "You are not a member of this chat room"));
    }

    if (!target) {
      return res.status(404).json(new ApiResponse(404, {}, "Target user is not in the chat room"));
    }

    // Permission logic:
    // - Only OWNER or MODERATOR can remove users.
    // - MODERATORs cannot remove OWNERs or other MODERATORs.
    if (requester.role === ChatRole.MEMBER) {
      return res.status(403).json(new ApiResponse(403, {}, "You do not have permission to remove users from this chat room"));
    }

    if (requester.role === ChatRole.MODERATOR && target.role !== ChatRole.MEMBER) {
      return res.status(403).json(new ApiResponse(403, {}, "Moderators can only remove members from this chat room"));
    }

    // Proceed with deletion of the target user's membership
    await prisma.chatRoomUser.delete({
      where: {
        userId_chatRoomId: {
          userId: parsedTargetUserId,
          chatRoomId: parsedChatRoomId,
        },
      },
    });

     // TODO: Optional - Notify the removed user
     // io.to(parsedTargetUserId).emit('removedFromChatRoom', { chatRoomId: parsedChatRoomId });


    return res.status(200).json(new ApiResponse(200, {}, "User removed from chat room successfully"));

  } catch (error) {
    console.error("Error removing user from chat room:", error);

     if (error instanceof PrismaClientKnownRequestError) {
          console.error("Prisma Error Code:", error.code);
           // P2025 indicates a record to be deleted was not found - though we checked above, this adds robustness
           if (error.code === 'P2025') {
               return res.status(404).json(new ApiResponse(404, {}, "User is already not a member of this chat room."));
           }
           return res.status(400).json(new ApiResponse(400, {}, "Database error removing user from chat room: " + error.message));
     }

    return res.status(500).json(new ApiResponse(500, {}, "An error occurred while removing the user from the chat room"));
  }
});


const leaveChatRoom = AsyncHandler(async (req, res) => {
  const { chatRoomId } = req.params;
  const userId = req.user.id; // User leaving the room

  try {
    const parsedChatRoomId = parseInt(chatRoomId);
     if (isNaN(parsedChatRoomId)) {
        return res.status(400).json(new ApiResponse(400, {}, "Invalid chat room ID"));
    }


    // Check if user is part of the chat room and get their role
    const chatRoomUser = await prisma.chatRoomUser.findUnique({
      where: {
        userId_chatRoomId: {
          userId,
          chatRoomId: parsedChatRoomId,
        },
      },
      select: { role: true }
    });

    if (!chatRoomUser) {
      return res.status(404).json(new ApiResponse(404, {}, "You are not a member of this chat room"));
    }

    // Prevent OWNER from leaving
    if (chatRoomUser.role === ChatRole.OWNER) {
      // Check if it's the last member in the room (optional, but good practice for OWNER leaving)
      const memberCount = await prisma.chatRoomUser.count({
          where: { chatRoomId: parsedChatRoomId }
      });

      if (memberCount > 1) {
          return res.status(403).json(new ApiResponse(403, {}, "Owners cannot leave the chat room unless they are the only member. Please transfer ownership or delete the group"));
      } else {
           // If they are the last member, allow leaving (which effectively makes the room empty)
           console.log(`Owner ${userId} is the last member in room ${parsedChatRoomId}. Allowing leave.`);
           // Proceed to deletion below
      }
    }

    // Proceed with removal of the user's membership
    await prisma.chatRoomUser.delete({
      where: {
        userId_chatRoomId: {
          userId,
          chatRoomId: parsedChatRoomId,
        },
      },
    });

     // TODO: Optional - Emit an event to notify other members that a user has left
     // io.to(parsedChatRoomId).emit('userLeftChatRoom', { chatRoomId: parsedChatRoomId, userId: userId });


    return res.status(200).json(new ApiResponse(200, {}, "You have left the chat room"));

  } catch (error) {
    console.error("Error leaving chat room:", error);

     if (error instanceof PrismaClientKnownRequestError && error.code === 'P2025') {
         return res.status(404).json(new ApiResponse(404, {}, "You are already not a member of this chat room."));
     }

    return res.status(500).json(new ApiResponse(500, {}, "An error occurred while leaving the chat room"));
  }
});


const transferOwnership = AsyncHandler(async (req, res) => {
  const { chatRoomId } = req.params;
  const { newOwnerId } = req.body;
  const userId = req.user.id; // Current owner making the request

  const parsedChatRoomId = parseInt(chatRoomId);
  const parsedNewOwnerId = parseInt(newOwnerId);

   if (isNaN(parsedChatRoomId) || isNaN(parsedNewOwnerId)) {
        return res.status(400).json(new ApiResponse(400, {}, "Invalid IDs provided"));
    }


  try {
    // Get current role of the user making the request in this chat room
    const currentUser = await prisma.chatRoomUser.findUnique({
      where: {
        userId_chatRoomId: {
          userId,
          chatRoomId: parsedChatRoomId,
        },
      },
      select: { role: true }
    });

    if (!currentUser || currentUser.role !== ChatRole.OWNER) {
      return res.status(403).json(new ApiResponse(403, {}, "You must be the owner to transfer ownership"));
    }

    // Check that the new owner is a member of the chat room
    const targetUser = await prisma.chatRoomUser.findUnique({
      where: {
        userId_chatRoomId: {
          userId: parsedNewOwnerId,
          chatRoomId: parsedChatRoomId,
        },
      },
      select: { role: true }
    });

    if (!targetUser) {
      return res.status(404).json(new ApiResponse(404, {}, "The selected user is not a member of this chat room"));
    }

     if (userId === parsedNewOwnerId) {
         return res.status(400).json(new ApiResponse(400, {}, "You are already the owner. Cannot transfer ownership to yourself."));
     }


    // Use a transaction to update roles atomically
    await prisma.$transaction(async (tx) => {
        // Update the new owner's role to OWNER
        await tx.chatRoomUser.update({
          where: {
            userId_chatRoomId: {
              userId: parsedNewOwnerId,
              chatRoomId: parsedChatRoomId,
            },
          },
          data: {
            role: ChatRole.OWNER,
          },
        });

        // Update the previous owner's role to MEMBER
        await tx.chatRoomUser.update({
          where: {
            userId_chatRoomId: {
              userId,
              chatRoomId: parsedChatRoomId,
            },
          },
          data: {
            role: ChatRole.MEMBER,
          },
        });
    });

     // TODO: Optional - Emit an event to notify users of the ownership change
     // io.to(parsedChatRoomId).emit('ownershipTransferred', { chatRoomId: parsedChatRoomId, oldOwnerId: userId, newOwnerId: parsedNewOwnerId });


    return res.status(200).json(new ApiResponse(200, {}, "Ownership transferred successfully"));

  } catch (error) {
    console.error("Error transferring ownership:", error);

     if (error instanceof PrismaClientKnownRequestError) {
          console.error("Prisma Error Code:", error.code);
           // P2025 might indicate the target user or current user membership was not found during the transaction
           if (error.code === 'P2025') {
                return res.status(404).json(new ApiResponse(404, {}, "Failed to transfer ownership. Ensure both users are members of the chat room."));
           }
           return res.status(400).json(new ApiResponse(400, {}, "Database error transferring ownership: " + error.message));
      }

    return res.status(500).json(new ApiResponse(500, {}, "An error occurred while transferring ownership"));
  }
});


/**
 * Send a new message to a chat room. Can include content and/or attachments.
 * @route POST /api/v1/chats/messages
 * @access Private
 */
const sendMessage = AsyncHandler(async (req, res) => {
  console.log('sendMessage called, io:', io); // Add this line
  // Destructure attachments with a default empty array
  const { chatRoomId, content, attachments = [] } = req.body;
  const sender = req.user; // Assuming req.user is populated by auth middleware

  // Validate the request: Either content or attachments must be present
  // Ensure chatRoomId is a number
  const chatRoomIdInt = parseInt(chatRoomId);
  if (isNaN(chatRoomIdInt) || (!content && attachments.length === 0)) {
    return res.status(400).json(new ApiResponse(400, {}, "Invalid chatRoomId or message must have content or at least one attachment."));
  }

  try {
    // Check if the user is part of the chat room
    const membership = await prisma.chatRoomUser.findUnique({
      where: {
        userId_chatRoomId: {
          userId: sender.id,
          chatRoomId: chatRoomIdInt,
        },
      },
    });

    if (!membership) {
      return res.status(403).json(new ApiResponse(403, {}, "You are not a member of this chat room."));
    }

    // Prepare attachments data for Prisma create.
    // Ensure 'attachments' from req.body is an array and map fileKey to 'key'.
    const attachmentsData = Array.isArray(attachments) ? attachments.map(att => ({
      // <<< CORRECTED: Map frontend's 'fileKey' to Prisma's 'key' field >>>
      key: att.fileKey, // Prisma schema field is 'key'
      fileType: att.fileType, // Keep 'fileType' as it matches schema
      // Add other attachment fields if your schema requires them and frontend provides them (e.g., name: att.fileName)
    })) : []; // Ensure attachmentsData is an array


    // Start constructing the message object for Prisma create
    const messageCreateData = {
      content: content ? content.trim() : null, // Store empty content as null if it's an image-only message
      senderId: sender.id,
      chatRoomId: chatRoomIdInt,
      // If this endpoint could also handle replies with attachments,
      // you would include parentMessageId here based on the request body.
      // parentMessageId: req.body.parentMessageId || null, // Example if applicable
    };

    // Only include the 'attachments.create' block if there are attachments to create
    if (attachmentsData.length > 0) {
      messageCreateData.attachments = {
        create: attachmentsData, // Use the correctly mapped attachments data
      };
    }

    // Create the message in the database
    const message = await prisma.message.create({
      data: messageCreateData, // Use the prepared data
      include: { // Include relations needed for the socket emission and API response
         sender: { // Include sender details
           select: {
             id: true,
             name: true,
             profileImageKey: true, // Include profile image key
           },
         },
         attachments: true, // Include the created attachments in the returned object
         // Include parentMessage if this message could be a reply (e.g., image reply)
         // parentMessage: { include: { sender: { select: { ... } } } }, // Example if applicable
      }
    });

    // --- Socket Emission ---
    // Prepare the message object to send over Socket.IO.
    // This structure should match what your frontend MessageModel.fromJson expects.
    // It should include sender details, attachments, and potentially parentMessage for replies.
    const messageToSend = {
        id: message.id,
        chatRoomId: message.chatRoomId,
        content: message.content,
        sender: { // Sender of the new message (use data from included sender)
            id: message.sender.id,
            name: message.sender.name,
            profileImageKey: message.sender.profileImageKey,
        },
        createdAt: message.createdAt, // This is a Date object
        updatedAt: message.updatedAt, // This is a Date object
        isEdited: message.isEdited,
        parentMessageId: message.parentMessageId,
        // Include parentMessage if this was a reply (based on prisma include)
        // parentMessage: message.parentMessage ? { ... } : null, // Format parent if included

        // Include attachments if any, using the correct field names from the saved message object
        attachments: message.attachments.map(att => ({
             id: att.id,
             key: att.key, // Use the 'key' field from the saved attachment
             fileType: att.fileType,
             messageId: att.messageId,
             // Add other fields if needed, like a URL to access the attachment
             // url: `${process.env.S3_BASE_URL}/${att.key}` // Example if you need URL on frontend
        })),
        // Include other fields like timestamp if your frontend MessageModel expects them
        // timestamp: message.createdAt.toISOString(), // Example if needed
    };


    // Emit the new message to the specific chat room channel
    // The event name 'newMessage' must match your frontend socket listener.
    io.to(message.chatRoomId).emit('newMessage', messageToSend); // Use chatRoomId from saved message


    // Optional: Emit a conversationUpdated event if needed for chat list views etc.
    // Adjust lastMessage snippet logic for image-only messages
    let lastMessageSnippet = message.content;
     if (!lastMessageSnippet && message.attachments.length > 0) {
         lastMessageSnippet = '📷 Image/File';
     } else if (!lastMessageSnippet) {
         lastMessageSnippet = 'Empty message';
     }
     // Truncate snippet if necessary
     lastMessageSnippet = lastMessageSnippet.length > 50 ? lastMessageSnippet.substring(0, 47) + '...' : lastMessageSnippet;


    io.to(message.chatRoomId).emit("conversationUpdated", {
      chatRoomId: message.chatRoomId,
      lastMessageSnippet: lastMessageSnippet, // Use the calculated snippet
      lastMessageTime: message.createdAt // Use the Date object
    });
    // --- End Socket Emission ---


    // Respond to the API caller with the created message details (optional, socket handles real-time)
    // It's good practice to return the same data structure emitted via socket
    return res.status(201).json(new ApiResponse(201, messageToSend, "Message sent successfully"));

  } catch (error) {
    console.error("Error sending message:", error);

    // Handle specific database errors and provide clearer messages
    if (error instanceof PrismaClientKnownRequestError) {
      console.error("Prisma Error Code:", error.code); // Log Prisma error code
      return res.status(400).json(new ApiResponse(400, {}, "Database error sending message: " + error.message));
    }

    // Handle general server errors
    return res.status(500).json(new ApiResponse(500, {}, "Failed to send message. Please try again later."));
  }
});


const deleteMessage = AsyncHandler(async (req, res) => {
  const userId = req.user.id;
  const messageId = parseInt(req.params.messageId);

  if (isNaN(messageId)) {
    return res.status(400).json(new ApiResponse(400, {}, "Invalid message ID"));
  }

  try {
    // Find the message and include attachments and the user's role in the chat room
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: {
        attachments: true, // Include attachments to delete them from S3
        chatRoom: { // Include chatRoom and the user's role in it for permission check
          include: {
            users: {
              where: { userId }, // Filter for the current user's membership in this room
              select: { role: true } // Select only the role
            }
          }
        }
      }
    });

    if (!message) {
      return res.status(404).json(new ApiResponse(404, {}, "Message not found"));
    }

    const userRoleInRoom = message.chatRoom.users[0]?.role; // Get the role of the requesting user

    // Check if the user is the sender OR has a role (OWNER or MODERATOR) that allows deletion
    const isOwnerOrMod = userRoleInRoom === ChatRole.OWNER || userRoleInRoom === ChatRole.MODERATOR;
    const isSender = message.senderId === userId;

    // Users can delete their own messages. Owners/Moderators can delete any message.
    if (!isOwnerOrMod && !isSender) {
      return res.status(403).json(new ApiResponse(403, {}, "You are not authorized to delete this message"));
    }

    // If the message has attachments, delete them from S3
    if (message.attachments && message.attachments.length > 0) {
        console.log(`Deleting ${message.attachments.length} attachments from S3 for message ${messageId}`);
        for (const attachment of message.attachments) {
          try {
            await S3Util.deleteFile(attachment.key);
            console.log(`Deleted S3 file: ${attachment.key}`);
          } catch (err) {
            console.warn(`S3 deletion failed for key ${attachment.key}:`, err.message);
            // Log the warning but continue with message deletion
          }
        }
    }


    // Delete the message from the database. Prisma will automatically cascade delete attachments.
    const deletedMessage = await prisma.message.delete({
      where: { id: messageId }
    });

    // TODO: Optional - Emit a socket event to notify clients that a message was deleted
    // io.to(deletedMessage.chatRoomId).emit('messageDeleted', { messageId: deletedMessage.id, chatRoomId: deletedMessage.chatRoomId });


    return res.status(200).json(new ApiResponse(200, {}, "Message deleted successfully"));
  } catch (error) {
    console.error("Delete message error:", error);

     if (error instanceof PrismaClientKnownRequestError) {
          console.error("Prisma Error Code:", error.code);
           // P2025 indicates the message was not found (already checked, but for robustness)
           if (error.code === 'P2025') {
                return res.status(404).json(new ApiResponse(404, {}, "Message not found or already deleted."));
           }
           return res.status(400).json(new ApiResponse(400, {}, "Database error deleting message: " + error.message));
     }

    return res.status(500).json(new ApiResponse(500, {}, "Something went wrong while deleting the message"));
  }
});

const editMessage = AsyncHandler(async (req, res) => {
  const userId = req.user.id;
  const messageId = parseInt(req.params.messageId);
  const { newContent } = req.body;

  if (!newContent || newContent.trim().length < 1) {
    return res.status(400).json(new ApiResponse(400, {}, "New message content is required"));
  }

  if (isNaN(messageId)) {
    return res.status(400).json(new ApiResponse(400, {}, "Invalid message ID"));
  }

  try {
    // Find the message to check if the user is the sender
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { // Select only necessary fields
          id: true,
          senderId: true,
          chatRoomId: true, // Needed for socket emission
      }
    });

    if (!message) {
      return res.status(404).json(new ApiResponse(404, {}, "Message not found"));
    }

    // Only the original sender can edit the message
    if (message.senderId !== userId) {
      return res.status(403).json(new ApiResponse(403, {}, "You are not authorized to edit this message"));
    }

    // Update the message content and set isEdited flag
    const updatedMessage = await prisma.message.update({
      where: { id: messageId },
      data: {
        content: newContent.trim(),
        isEdited: true,
      },
      // Include necessary fields for the response and socket emission
      include: {
          sender: { select: { id: true, name: true, profileImageKey: true } },
          attachments: true, // Include attachments (they are not changed by editing content)
          parentMessage: {
              select: { // Select necessary fields for the parent message
                 id: true,
                 content: true,
                 sender: { select: { id: true, name: true } },
                 attachments: { select: { fileType: true } }
              }
          },
      }
    });

     // TODO: Optional - Emit a socket event to notify clients that a message was edited
     // Format the updated message data similarly to `sendMessage` and `getMessagesForChatRoom`
     const editedMessageToSend = {
        id: updatedMessage.id,
        chatRoomId: updatedMessage.chatRoomId,
        content: updatedMessage.content,
        sender: {
            id: updatedMessage.sender.id,
            name: updatedMessage.sender.name,
            profileImageKey: updatedMessage.sender.profileImageKey,
        },
        createdAt: updatedMessage.createdAt,
        updatedAt: updatedMessage.updatedAt,
        isEdited: updatedMessage.isEdited,
        parentMessageId: updatedMessage.parentMessageId,
        parentMessage: updatedMessage.parentMessage ? {
             id: updatedMessage.parentMessage.id,
             content: updatedMessage.parentMessage.content,
             sender: {
                id: updatedMessage.parentMessage.sender.id,
                name: updatedMessage.parentMessage.sender.name,
                // profileImageKey might not be needed for the parent in an edit update
             },
             attachments: updatedMessage.parentMessage.attachments,
         } : null,
        attachments: updatedMessage.attachments.map(att => ({
             id: att.id, key: att.key, fileType: att.fileType, messageId: att.messageId
        })),
     };

     io.to(editedMessageToSend.chatRoomId).emit('messageEdited', editedMessageToSend);


    return res.status(200).json(new ApiResponse(200, editedMessageToSend, "Message edited successfully"));
  } catch (error) {
    console.error("Error editing message:", error);

     if (error instanceof PrismaClientKnownRequestError) {
        console.error("Prisma Error Code:", error.code);
        // P2025 indicates the message was not found (already checked, but for robustness)
        if (error.code === 'P2025') {
             return res.status(404).json(new ApiResponse(404, {}, "Message not found."));
        }
         return res.status(400).json(new ApiResponse(400, {}, "Database error editing message: " + error.message));
      }

    return res.status(500).json(new ApiResponse(500, {}, "An error occurred while editing the message"));
  }
});

/**
 * Get messages for a specific chat room with pagination.
 * Includes replies and optionally includes the parent message details for replies.
 * @route GET /api/v1/chats/messages/:chatRoomId
 * @access Private
 */
const getMessagesForChatRoom = AsyncHandler(async (req, res) => {
  const chatRoomId = parseInt(req.params.chatRoomId);
  const userId = req.user.id;
  // Capture query parameters for pagination and frontend info
  const pageSize = parseInt(req.query.pageSize) || 20; // Default page size
  const cursorId = req.query.cursor ? parseInt(req.query.cursor) : null; // Cursor for older messages (ID of the oldest message from previous batch)
  const page = parseInt(req.query.page) || 1; // Capture page number (mainly for frontend logging/info)

  if (!chatRoomId || isNaN(chatRoomId)) {
    return res.status(400).json(new ApiResponse(400, {}, "Invalid chatRoomId"));
  }

  try {
    // Check if the user is a member of the chat room
    const membership = await prisma.chatRoomUser.findUnique({
      where: {
        userId_chatRoomId: {
          userId,
          chatRoomId: chatRoomId,
        },
      },
    });

    if (!membership) {
      return res.status(403).json(new ApiResponse(403, {}, "Access denied to this chat room."));
    }

    // <<< ADDED: Fetch Chat Room Details >>>
    // Note: This section was already present in the snippet you provided before.
    // We ensure it remains and is correctly used in the response.
    const chatRoomDetails = await prisma.chatRoom.findUnique({
        where: { id: chatRoomId },
        include: { // Include any necessary relationships for the chat room itself (e.g., users)
           users: { // Include users in the chat room details
               select: {
                   userId: true,
                   role: true,
                   user: { // Include user details for each chat room user
                       select: {
                           id: true,
                           name: true,
                           profileImageKey: true,
                       }
                   }
               }
           },
           // Add other chat room specific includes if needed (e.g., admin user)
        }
    });

    // Handle case where chat room details themselves aren't found (though membership check above makes this less likely)
    if (!chatRoomDetails) {
         // This is a redundant check if membership exists, but useful if flow changes.
         // Given membership check, a 404 here is unlikely but robust.
         return res.status(404).json(new ApiResponse(404, {}, "Chat room not found."));
    }
    // <<< END ADDED >>>


    // Fetch messages, including replies, ordered by creation date descending (newest first)
    const messages = await prisma.message.findMany({
      where: {
        chatRoomId: chatRoomId,
        // <<< REMOVED: parentMessageId: null, >>> // Remove this filter to include replies - Already done in your snippet
      },
      orderBy: {
        createdAt: 'desc', // Fetch newest messages first from the database
      },
      take: pageSize, // Limit the number of messages per fetch
      ...(cursorId && { // Apply cursor pagination logic if cursorId is provided
        cursor: { id: cursorId }, // Start fetching AFTER the message with this ID
        skip: 1, // Skip the cursor message itself
      }),
      include: {
        sender: { // Include the sender details for the CURRENT message
          select: {
            id: true,
            name: true,
            profileImageKey: true, // Assuming profileImageKey is needed
          },
        },
        attachments: true, // Include attachments for the CURRENT message (selects all fields by default)
        // <<< ADDED: Include the parentMessage relationship for replies >>> - Already done in your snippet
        parentMessage: {
           include: { // Include sender details for the PARENT message as well - Already done in your snippet
             sender: {
               select: {
                 id: true,
                 name: true,
                 profileImageKey: true, // Assuming profileImageKey is needed for parent sender
               }
             },
             attachments: true, // Include parent's attachments (selects all fields by default) - Already done in your snippet
           }
        },
      },
    });

    // Count total messages for pagination metadata (optional but good practice)
    // This count can be expensive on large tables, consider optimizing if needed.
    // Note: Depending on how you use totalMessages on the frontend, you might need
    // to fetch this count only once or infrequently due to performance.
    const totalMessages = await prisma.message.count({
      where: { chatRoomId: chatRoomId },
    });

    // Determine if there are potentially more messages older than the last fetched one
    // If the number of messages returned equals the pageSize, assume there's another page.
    const hasMore = messages.length === pageSize; // Simple check based on pageSize

    // The fetched messages are in descending order (newest first).
    // For displaying chat history, you usually want the oldest message at the top.
    // Let's reverse it here for convenience before sending to the frontend.
    // Use slice() to create a shallow copy before reversing to avoid modifying the original `messages` array
    // if it were used elsewhere after this point (good practice, though not strictly needed in this snippet).
    const orderedMessages = messages.slice().reverse();


    return res.status(200).json(
      new ApiResponse(200,
        { // <<< UPDATED: Include chatRoomDetails in the data payload >>>
          chatRoom: chatRoomDetails, // Include the fetched chat room details here
          messages: orderedMessages, // The array of fetched messages (now oldest to newest)
          pagination: { // Pagination details for frontend
            totalMessages: totalMessages, // Include total count
            currentPage: page, // Use the captured page number
            pageSize: pageSize, // Include page size used
             // The ID of the OLDEST message in the *original* fetched batch (which is the FIRST message after reverse)
             // is the cursor for the NEXT fetch for *older* messages.
            nextCursor: messages.length > 0 ? messages[messages.length - 1].id : null,
            hasMore: hasMore, // Indicate if more messages are likely available
          },
          // You might also include unreadMessages count here if relevant for the initial load endpoint
          // unreadMessages: // ... calculate and include if needed ...
        },
        "Messages and chat details retrieved successfully." // Updated message
      )
    );
  } catch (error) {
    console.error("Error fetching messages:", error);
    // Handle specific database errors
     if (error instanceof PrismaClientKnownRequestError) {
      // Log or handle specific Prisma errors if needed
      return res.status(400).json(new ApiResponse(400, {}, "Database error fetching messages: " + error.message));
    }
    // Catch any other unhandled errors
    return res.status(500).json(new ApiResponse(500, {}, "An error occurred while fetching messages."));
  }
});
/**
 * Reply to an existing message.
 * Creates a new message linked to the parent message.
 * @route POST /api/v1/chats/messages/reply/:messageId
 * @access Private
 */
const replyToMessage = AsyncHandler(async (req, res) => {
  const userId = req.user.id;
  const parentMessageId = parseInt(req.params.messageId); // This is the ID of the parent message
  const { content } = req.body;
  // Assuming replies don't support attachments via this endpoint based on frontend event

  if (!content || content.trim().length < 1) {
    return res.status(400).json(new ApiResponse(400, {}, "Content is required for the reply"));
  }

  if (isNaN(parentMessageId)) {
    return res.status(400).json(new ApiResponse(400, {}, "Invalid parent message ID"));
  }

  try {
    // Find the parent message to get its chat room ID and verify it exists
    // Include sender and attachments details of the parent message for the socket emission data
    const parentMessage = await prisma.message.findUnique({
      where: { id: parentMessageId },
      select: { // Select specific fields needed for validation and socket emission data
         id: true,
         chatRoomId: true, // Need chat room ID for membership check and message creation
         content: true, // Parent content for the socket data
         createdAt: true,
         updatedAt: true,
         isEdited: true,
         parentMessageId: true, // Parent's parentId for deeper threads
         sender: { // Include parent sender to format the parent message data for the frontend socket
           select: {
             id: true,
             name: true,
             profileImageKey: true,
           },
         },
         // <<< ADDED: Include parent's attachments if needed in the quote UI >>>
         attachments: true, // Include parent's attachments
         // <<< END ADDED >>>
      }
    });

    if (!parentMessage) {
      return res.status(404).json(new ApiResponse(404, {}, "Parent message not found"));
    }

    // Check if the user is a member of the chat room before allowing reply
    const membership = await prisma.chatRoomUser.findUnique({
      where: {
        userId_chatRoomId: {
          userId: userId,
          chatRoomId: parentMessage.chatRoomId,
        },
      },
       select: { id: true } // Just need to know if membership exists
    });

    if (!membership) {
      return res.status(403).json(new ApiResponse(403, {}, "You are not a member of this chat room. Cannot reply."));
    }


    // Create the reply message in the database
    const replyMessage = await prisma.message.create({
      data: {
        content: content.trim(),
        senderId: userId, // Sender is the current user
        chatRoomId: parentMessage.chatRoomId, // Reply is in the same chat room as the parent
        parentMessageId: parentMessage.id,    // Link to the immediate parent message
      },
      include: { // Include sender and attachments details for the new reply message object for socket emission
         sender: {
           select: {
             id: true,
             name: true,
             profileImageKey: true,
           },
         },
         // Attachments would typically be handled by a separate mechanism if supported for replies
         // attachments: true, // Include reply's attachments (should be empty if not supported)
      }
    });

    // --- Socket Emission after successful reply creation ---
    // Format the new reply message data to emit over Socket.IO
    // This structure should match what your frontend MessageModel.fromJson expects,
    // including the nested parentMessage object.
    const replyMessageToSend = {
      id: replyMessage.id,
      chatRoomId: replyMessage.chatRoomId,
      content: replyMessage.content,
      sender: { // Sender of the new reply message (use data from included sender)
        id: replyMessage.sender.id,
        name: replyMessage.sender.name,
        profileImageKey: replyMessage.sender.profileImageKey, // Include profile image key
      },
      createdAt: replyMessage.createdAt, // This is a Date object
      updatedAt: replyMessage.updatedAt, // This is a Date object
      isEdited: replyMessage.isEdited, // Default false for new message
      parentMessageId: replyMessage.parentMessageId,
      // --- Include parent message details (fetched earlier) for the frontend UI ---
      // The frontend MessageModel expects a nested 'parentMessage' object for replies.
      parentMessage: {
         id: parentMessage.id,
         content: parentMessage.content,
         createdAt: parentMessage.createdAt, // Include parent's creation date
         updatedAt: parentMessage.updatedAt, // Include parent's update date
         isEdited: parentMessage.isEdited, // Include parent's edited status
         parentMessageId: parentMessage.parentMessageId, // Include parent's parentMessageId for deeper threads
         // Include sender details for the parent message
         sender: {
           id: parentMessage.sender.id,
           name: parentMessage.sender.name,
           profileImageKey: parentMessage.sender.profileImageKey, // Include profile image key
         },
         // Add other parent message fields if needed by your frontend MessageModel
         // <<< ADDED: Include parent's attachments in the emitted parentMessage object >>>
         attachments: parentMessage.attachments, // Include parent's attachments if needed in the quote UI
         // <<< END ADDED >>>
      },
      // ----------------------------------------------------------------------
      // Include attachments for the reply message itself (should be empty if replies don't support attachments)
      // attachments: replyMessage.attachments.map(att => ({ ... })), // Uncomment if replies can have attachments
        attachments: [] // Assuming replies don't have attachments via this endpoint
    };

    // Emit the new reply message to the specific chat room channel
    // The event name 'newMessage' must match your frontend socket listener.
    io.to(replyMessage.chatRoomId).emit('newMessage', replyMessageToSend);


    // Optional: Emit a conversationUpdated event for the chat list view
    // Use the reply message content as the last message indicator
     let lastMessageSnippet = replyMessage.content;
     // Truncate snippet if necessary
     lastMessageSnippet = lastMessageSnippet.length > 50 ? lastMessageSnippet.substring(0, 47) + '...' : lastMessageSnippet;

    io.to(replyMessage.chatRoomId).emit("conversationUpdated", {
      chatRoomId: replyMessage.chatRoomId,
      lastMessageSnippet: lastMessageSnippet, // Use the calculated snippet
      lastMessageTime: replyMessage.createdAt // Use the Date object
    });
    // --- End Socket Emission ---


    // Respond to the API caller with the created reply message details
    // It's good practice to return the same data structure emitted via socket
    return res.status(201).json(new ApiResponse(201, replyMessageToSend, "Message replied successfully"));
  } catch (error) {
    console.error("Error replying to message:", error);
    // Handle specific database errors
     if (error instanceof PrismaClientKnownRequestError) {
       console.error("Prisma Error Code:", error.code); // Log Prisma error code
      return res.status(400).json(new ApiResponse(400, {}, "Database error replying to message: " + error.message));
    }
    // Catch any other unhandled errors
    return res.status(500).json(new ApiResponse(500, {}, "An error occurred while replying to the message"));
  }
});

/**
 * Get all chat rooms paginated and sorted by member count (highest to lowest).
 * Includes a flag indicating if the requesting user is a member.
 * WARNING: This method fetches ALL chat rooms and sorts in memory due to Prisma limitations
 * with sorting by aggregates before pagination using standard findMany. This can impact
 * performance and memory usage for large numbers of chat rooms.
 * @route GET /api/v1/chats/chatRooms
 * @access Private // Assuming private access like other chat routes
 * @queryParam {number} page - The page number for pagination (default: 1)
 * @queryParam {number} pageSize - The number of items per page (default: 10)
 */
const getAllChatRoomsPaginated = AsyncHandler(async (req, res) => {
  const userId = req.user.id; // Get the current user ID from the request

  // Extract and validate pagination parameters
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 10;
  const offset = (page - 1) * pageSize;

  if (page < 1 || pageSize < 1) {
    return res.status(400).json(new ApiResponse(400, {}, "Invalid page or pageSize. Must be positive integers."));
  }

  if (!userId) {
    return res.status(401).json(new ApiResponse(401, {}, "User not authenticated."));
  }

  try {
    const allChatRooms = await prisma.chatRoom.findMany({
      select: {
        id: true,
        name: true,
        isPublic: true,
        createdAt: true,
        updatedAt: true,
        image: true,

        _count: {
          select: { users: true },
        },

        users: {
          where: {
            userId: userId,
          },
          select: {
            userId: true,
          },
        },
        // --- UPDATED: Select the 'status' of the join request, remove status filter here ---
        joinRequests: {
          where: {
            userId: userId,
            // Removed: status: prisma.JoinRequestStatus.PENDING, // We want all requests for the user
          },
          select: {
            status: true, // Select the actual status
          },
          // Limit to 1, as a user should only have one request per room unique constraint
          take: 1,
        },
      },
    });

    allChatRooms.sort((a, b) => b._count.users - a._count.users);

    const paginatedChatRooms = allChatRooms.slice(offset, offset + pageSize);

   const formattedChatRooms = paginatedChatRooms.map(room => {
  const joinRequestStatus = room.joinRequests.length > 0
    ? room.joinRequests[0].status
    : null;

  console.log('--- DEEPER PRISMA DEBUG ---');
  console.log('Type of `prisma`:', typeof prisma);
  console.log('Is `prisma` null/undefined?', prisma === null || prisma === undefined);
  console.log('Properties of `prisma`:', Object.keys(prisma || {})); // Log all properties if prisma is not null/undefined
  console.log('Value of `prisma.JoinRequestStatus`:', prisma.JoinRequestStatus);
  console.log('---------------------------');

  return {
    id: room.id,
    name: room.name,
    isPublic: room.isPublic,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
    image: room.image,
    memberCount: room._count.users,
    isMember: room.users.length > 0,
    joinRequestStatus: joinRequestStatus,
    isRequestedByCurrentUser: joinRequestStatus === JoinRequestStatus.PENDING, // This is line 1885
  };
});
    const totalRooms = await prisma.chatRoom.count();
    const hasMore = (page * pageSize) < totalRooms;

    console.log("ChatRooms ", {
      chatRooms: formattedChatRooms,
      pagination: {
        totalRooms: totalRooms,
        currentPage: page,
        pageSize: pageSize,
        hasMore: hasMore,
      },
    });

    return res.status(200).json(
      new ApiResponse(200,
        {
          chatRooms: formattedChatRooms,
          pagination: {
            totalRooms: totalRooms,
            currentPage: page,
            pageSize: pageSize,
            hasMore: hasMore,
          },
        },
        "Paginated chat rooms retrieved successfully (sorted in memory)."
      )
    );

  } catch (error) {
    console.error("Error fetching paginated chat rooms:", error);
    if (error instanceof PrismaClientKnownRequestError) {
      console.error("Prisma Error Code:", error.code);
      return res.status(500).json(new ApiResponse(500, {}, "Database error fetching chat rooms: " + error.message));
    }
    return res.status(500).json(new ApiResponse(500, {}, "An error occurred while fetching chat rooms."));
  }
});


export {
  getAllChatRoomsPaginated,
createChatRoom,
updateChatRoom,
getAllChatRoomsForUser,
getChatRoomDetails,
updateLastRead,
getUnreadCounts,
joinChatRoom,
handleJoinRequest,
getJoinRequestsForChatRoom,
removeUserFromChatRoom,
leaveChatRoom,
transferOwnership,
sendMessage,
getMessagesForChatRoom,
deleteMessage,
editMessage,
replyToMessage
};
