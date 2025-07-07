// routes/chat.routes.js
import {Router } from 'express';
import { createTrip, patchTrip, deleteTrip, getAllTrips, getTripById } from '../controllers/trip.controller.js';
import { verifyJwt } from '../middleware/auth.middleware.js';

const router = Router();

// Apply auth middleware to all chat routes
router.use(verifyJwt);


router.post('/', createTrip);
router.get('/', getAllTrips);
router.get('/:tripId', getTripById);
router.delete('/:tripId', deleteTrip);
router.patch('/:tripId', patchTrip);

export {router}