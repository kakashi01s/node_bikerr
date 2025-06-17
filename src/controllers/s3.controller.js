import { S3Util } from '../utils/s3_util.js'; // Assuming you have the S3 utility
import { AsyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/apiResponse.js';

/**
 * Generate a pre-signed URL for uploading a file to S3.
 * Allows specifying the folder.
 * @route POST /api/generate-upload-url // Consider a more general route
 * @access Private (only authenticated users can request)
 */
const generateUploadUrl = AsyncHandler(async (req, res) => {
  // Added default folder for chat rooms, or allow specifying in body
  const { fileType, folder = 'uploads/chatrooms', fileName = 'image.jpg' } = req.body; // Allow fileName override

  // Validate the fileType (MIME type) is provided
  if (!fileType) {
    return res.status(400).json(new ApiResponse(400, {}, 'File type is required'));
  }

   if (!folder) {
       return res.status(400).json(new ApiResponse(400, {}, 'Folder is required'));
   }


  // Generate a unique file key within the specified folder
  const fileKey = S3Util.generateFileKey(folder, fileName); // Use the provided fileName or default

  try {
    // Generate the pre-signed URL for uploading
    const uploadUrl = await S3Util.generateUploadUrl(fileKey, fileType);

    // Send the URL back to the client
    return res.status(200).json(new ApiResponse(200, { uploadUrl, fileKey }, 'Pre-signed URL generated successfully'));
  } catch (error) {
    // Log the error for debugging
    console.error('Error generating upload URL:', error);

    // Handle different types of errors
    // More specific error handling based on AWS SDK errors can be added here
    if (error.statusCode === 403) { // Example: AWS credential issues or permissions
         return res.status(403).json(new ApiResponse(403, {}, 'AWS Permissions Error or Invalid Credentials'));
    }
    if (error.statusCode === 404) { // Example: Bucket not found
        return res.status(404).json(new ApiResponse(404, {}, 'S3 Bucket not found'));
    }


    // Return a generic error message for other errors
    return res.status(500).json(new ApiResponse(500, {}, 'An error occurred while generating the upload URL'));
  }
});

export { generateUploadUrl };