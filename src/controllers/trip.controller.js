import { prisma } from "../DB/db.config.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { AsyncHandler } from "../utils/asyncHandler.js";



/**
 * POST /api/trips
 * @desc Create a new trip with positions
 */
 const createTrip = AsyncHandler(async (req, res) => {
  const userId = req.user?.id;
  const { name, description, startTime, endTime, positions } = req.body;

  if (!userId) {
    return res.status(401).json(new ApiResponse(401, {}, "Unauthorized: User not authenticated"));
  }

  if (!startTime || !endTime || !Array.isArray(positions) || positions.length === 0) {
    return res.status(400).json(new ApiResponse(400, {}, "Missing or invalid fields: startTime, endTime, positions required"));
  }

  // Autogenerate name if not provided
  const autoName = name ?? `Trip ${userId} - ${new Date().toISOString().split('T')[0]}`;

  // Create trip with nested positions
  const newTrip = await prisma.trip.create({
    data: {
      userId,
      name: autoName,
      description: description ?? '',
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      positions: {
        createMany: {
          data: positions.map(p => ({
            latitude: p.latitude,
            longitude: p.longitude,
            timestamp: new Date(p.timestamp),
            speed: p.speed ?? null,
            accuracy: p.accuracy ?? null,
            bearing: p.bearing ?? null,
            altitude: p.altitude ?? null,
          })),
        },
      },
    },
    include: {
      positions: true,
    },
  });

  return res
    .status(201)
    .json(new ApiResponse(201, newTrip, "Trip created successfully"));
});


/**
 * GET /api/trips
 * @desc Get all trips for the logged-in user (paginated)
 * @query page, pageSize
 */
 const getAllTrips = AsyncHandler(async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json(new ApiResponse(401, {}, "Unauthorized"));
  }

  const page = parseInt(req.query.page, 10) || 1;
  const pageSize = parseInt(req.query.pageSize, 10) || 10;
  const skip = (page - 1) * pageSize;

  const [trips, totalCount] = await Promise.all([
    prisma.trip.findMany({
      where: { userId },
      skip,
      take: pageSize,
      orderBy: { startTime: 'desc' },
      select: {
        id: true,
        name: true,
        description: true,
        startTime: true,
        endTime: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.trip.count({ where: { userId } }),
  ]);

  return res.status(200).json(new ApiResponse(200, {
    trips,
    pagination: {
      total: totalCount,
      page,
      pageSize,
      hasMore: page * pageSize < totalCount,
    },
  }, "Trips fetched successfully"));
});


/**
 * GET /api/trips/:tripId
 * @desc Get trip by ID with positions
 */
 const getTripById = AsyncHandler(async (req, res) => {
  const userId = req.user?.id;
  const { tripId } = req.params;

  if (!userId) {
    return res.status(401).json(new ApiResponse(401, {}, "Unauthorized"));
  }

  const trip = await prisma.trip.findUnique({
    where: {
      id: parseInt(tripId, 10),
    },
    include: {
      positions: {
        orderBy: { timestamp: 'asc' },
      },
    },
  });

  if (!trip || trip.userId !== userId) {
    return res.status(404).json(new ApiResponse(404, {}, "Trip not found or access denied"));
  }

  return res.status(200).json(new ApiResponse(200, trip, "Trip fetched successfully"));
});


/**
 * DELETE /api/trips/:tripId
 * @desc Delete a trip by ID (only owner can delete)
 */
 const deleteTrip = AsyncHandler(async (req, res) => {
  const userId = req.user?.id;
  const { tripId } = req.params;

  if (!userId) {
    return res.status(401).json(new ApiResponse(401, {}, "Unauthorized"));
  }

  const trip = await prisma.trip.findUnique({
    where: { id: parseInt(tripId, 10) },
  });

  if (!trip || trip.userId !== userId) {
    return res.status(404).json(new ApiResponse(404, {}, "Trip not found or access denied"));
  }

  // Delete trip along with its positions (cascade onDelete in schema or manually)
  await prisma.position.deleteMany({ where: { tripId: trip.id } });
  await prisma.trip.delete({ where: { id: trip.id } });

  return res.status(200).json(new ApiResponse(200, {}, "Trip deleted successfully"));
});


/**
 * PATCH /api/trips/:tripId
 * @desc Partially update trip fields (name, description)
 */
 const patchTrip = AsyncHandler(async (req, res) => {
  const userId = req.user?.id;
  const { tripId } = req.params;
  const { name, description } = req.body;

  if (!userId) {
    return res.status(401).json(new ApiResponse(401, {}, "Unauthorized"));
  }

  const trip = await prisma.trip.findUnique({
    where: { id: parseInt(tripId, 10) },
  });

  if (!trip || trip.userId !== userId) {
    return res.status(404).json(new ApiResponse(404, {}, "Trip not found or access denied"));
  }

  // Only include fields provided in request
  const updateData = {};
  if (name !== undefined) updateData.name = name;
  if (description !== undefined) updateData.description = description;

  if (Object.keys(updateData).length === 0) {
    return res.status(400).json(new ApiResponse(400, {}, "No fields provided for update"));
  }

  const updatedTrip = await prisma.trip.update({
    where: { id: trip.id },
    data: updateData,
  });

  return res.status(200).json(new ApiResponse(200, updatedTrip, "Trip updated successfully"));
});



export {
    patchTrip,
    createTrip,
    getTripById,
    deleteTrip,
    getAllTrips,
};