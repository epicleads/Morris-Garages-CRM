import { supabaseAdmin } from '../config/supabase';
import { env } from '../config/env';

const BUCKET_NAME = 'support-tickets';

/**
 * Upload image to Supabase Storage
 */
export async function uploadTicketImage(
  file: Buffer,
  fileName: string,
  userId: number
): Promise<string> {
  // Create folder structure: userId/ticketId/timestamp-filename
  const timestamp = Date.now();
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
  const filePath = `${userId}/${timestamp}-${sanitizedFileName}`;

  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET_NAME)
    .upload(filePath, file, {
      contentType: 'image/jpeg', // Adjust based on file type
      upsert: false,
    });

  if (error) {
    throw new Error(`Failed to upload image: ${error.message}`);
  }

  // Get public URL (or signed URL for private buckets)
  const { data: urlData } = supabaseAdmin.storage
    .from(BUCKET_NAME)
    .getPublicUrl(filePath);

  return urlData.publicUrl;
}

/**
 * Delete image from Supabase Storage
 */
export async function deleteTicketImage(fileUrl: string): Promise<void> {
  // Extract file path from URL
  const urlParts = fileUrl.split('/');
  const filePath = urlParts.slice(urlParts.indexOf(BUCKET_NAME) + 1).join('/');

  const { error } = await supabaseAdmin.storage
    .from(BUCKET_NAME)
    .remove([filePath]);

  if (error) {
    throw new Error(`Failed to delete image: ${error.message}`);
  }
}

/**
 * Get signed URL for private image (if bucket is private)
 */
export async function getSignedImageUrl(filePath: string, expiresIn: number = 3600): Promise<string> {
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET_NAME)
    .createSignedUrl(filePath, expiresIn);

  if (error || !data) {
    throw new Error(`Failed to create signed URL: ${error?.message || 'Unknown error'}`);
  }

  return data.signedUrl;
}

