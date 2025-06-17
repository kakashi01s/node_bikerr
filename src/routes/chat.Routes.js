// routes/chat.routes.js
import {Router } from 'express';
import { createChatRoom, deleteMessage, editMessage, getAllChatRoomsForUser, getAllChatRoomsPaginated, getChatRoomDetails, getJoinRequestsForChatRoom, getMessagesForChatRoom, getUnreadCounts, handleJoinRequest, joinChatRoom, leaveChatRoom, removeUserFromChatRoom, replyToMessage, sendMessage, transferOwnership, updateChatRoom, updateLastRead } from '../controllers/chat.controller.js';
import { verifyJwt } from '../middleware/auth.middleware.js';

const router = Router();

// Apply auth middleware to all chat routes
router.use(verifyJwt);


// chat Room routes
router.post('/createChatRoom',createChatRoom);
router.post('/updateChatRoom/:id',updateChatRoom);
router.get('/getUserChatRooms',getAllChatRoomsForUser);
router.get('/chatRooms',getAllChatRoomsPaginated);
router.get('/getChatRoomDetail/:chatRoomId',getChatRoomDetails);
router.put("/updateLastRead/:chatRoomId", updateLastRead);
router.get("/unread-counts", getUnreadCounts);
router.post("/join/:chatRoomId",joinChatRoom);
router.post('/:chatRoomId/join-requests/:userId', handleJoinRequest);
router.get('/:chatRoomId/join-requests',getJoinRequestsForChatRoom);
// DELETE /api/chatrooms/:chatRoomId/users/:targetUserId
router.delete('/removeUser/:chatRoomId/:targetUserId', removeUserFromChatRoom);
// DELETE /api/chatrooms/:chatRoomId/leave
router.delete('/:chatRoomId/leave',  leaveChatRoom);
// PUT /api/chatrooms/:chatRoomId/transfer-ownership
router.put('/:chatRoomId/transfer-ownership', transferOwnership);
router.post('/send', sendMessage); // Send message route
router.get('/messages/:chatRoomId/', getMessagesForChatRoom);// get all messages from a chat room
router.delete('/messages/:messageId', deleteMessage);
// PUT /api/messages/:messageId/edit
router.put('/messages/:messageId/edit', editMessage);
router.post('/messages/reply/:messageId', replyToMessage);




export {router}