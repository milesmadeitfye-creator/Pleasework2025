import type { Handler } from "@netlify/functions";
import { createClient } from '@supabase/supabase-js';
import multiparty from 'multiparty';
import { readFileSync } from 'node:fs';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('[upload_presave_image] Missing Supabase credentials');
}

const supabase = createClient(supabaseUrl, supabaseKey);

const BUCKET_NAME = 'ghoste_link_images';
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export const handler: Handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  return new Promise((resolve) => {
    const form = new multiparty.Form();

    form.parse(event, async (err, fields, files) => {
      if (err) {
        console.error('[upload_presave_image] Parse error:', err);
        return resolve({
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            error: 'Failed to parse form data',
          }),
        });
      }

      try {
        // Extract slug and file
        const slug = fields.slug?.[0];
        const fileArray = files.file;

        if (!slug || !fileArray || fileArray.length === 0) {
          return resolve({
            statusCode: 400,
            headers,
            body: JSON.stringify({
              success: false,
              error: 'Missing slug or file',
            }),
          });
        }

        const file = fileArray[0];

        // Validate file size
        if (file.size > MAX_FILE_SIZE) {
          return resolve({
            statusCode: 400,
            headers,
            body: JSON.stringify({
              success: false,
              error: 'File too large. Maximum size is 5MB',
            }),
          });
        }

        // Validate file type
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedTypes.includes(file.headers['content-type'])) {
          return resolve({
            statusCode: 400,
            headers,
            body: JSON.stringify({
              success: false,
              error: 'Invalid file type. Only images are allowed',
            }),
          });
        }

        // Determine file extension
        const ext = file.originalFilename.split('.').pop() || 'jpg';
        const filePath = `presave/${slug}/cover.${ext}`;

        console.log('[upload_presave_image] Uploading:', filePath);

        // Read file buffer
        const fileBuffer = readFileSync(file.path);

        // Upload to Supabase Storage
        const { data, error: uploadError } = await supabase.storage
          .from(BUCKET_NAME)
          .upload(filePath, fileBuffer, {
            contentType: file.headers['content-type'],
            upsert: true,
          });

        if (uploadError) {
          console.error('[upload_presave_image] Upload error:', uploadError);
          return resolve({
            statusCode: 500,
            headers,
            body: JSON.stringify({
              success: false,
              error: 'Failed to upload image',
              details: uploadError.message,
            }),
          });
        }

        // Get public URL
        const { data: publicUrlData } = supabase.storage
          .from(BUCKET_NAME)
          .getPublicUrl(filePath);

        console.log('[upload_presave_image] Success:', filePath);

        return resolve({
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            path: filePath,
            public_url: publicUrlData.publicUrl,
          }),
        });
      } catch (error: any) {
        console.error('[upload_presave_image] Error:', error);
        return resolve({
          statusCode: 500,
          headers,
          body: JSON.stringify({
            success: false,
            error: 'Internal server error',
            details: error.message,
          }),
        });
      }
    });
  });
};
