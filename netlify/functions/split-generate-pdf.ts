import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

function jsonResponse(statusCode: number, data: any) {
  return {
    statusCode,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  };
}

export const handler: Handler = async (event) => {
  console.log('[split-generate-pdf] Request received');

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST' && event.httpMethod !== 'GET') {
    return jsonResponse(405, { error: 'METHOD_NOT_ALLOWED', message: 'Only GET and POST methods are allowed' });
  }

  try {
    // Auth check
    const authHeader = event.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('[split-generate-pdf] Missing or invalid authorization header');
      return jsonResponse(401, { error: 'UNAUTHORIZED', message: 'Missing or invalid authorization header' });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('[split-generate-pdf] Auth verification failed:', authError);
      return jsonResponse(401, { error: 'INVALID_TOKEN', message: 'Invalid or expired token' });
    }

    console.log('[split-generate-pdf] User authenticated:', { userId: user.id.substring(0, 8) + '...' });

    // Get negotiation_id from body or query
    const body = event.body ? JSON.parse(event.body) : {};
    const negotiationId = body.negotiation_id || event.queryStringParameters?.negotiation_id;

    if (!negotiationId) {
      return jsonResponse(400, {
        error: 'MISSING_NEGOTIATION_ID',
        message: 'negotiation_id is required',
      });
    }

    console.log('[split-generate-pdf] Generating PDF for negotiation:', negotiationId);

    // Fetch negotiation data
    const { data: negotiation, error: negError } = await supabase
      .from('split_negotiations')
      .select('*')
      .eq('id', negotiationId)
      .maybeSingle();

    if (negError || !negotiation) {
      console.error('[split-generate-pdf] Negotiation not found:', negError);
      return jsonResponse(404, {
        error: 'NEGOTIATION_NOT_FOUND',
        message: 'Split negotiation not found',
      });
    }

    // Verify ownership
    if (negotiation.user_id !== user.id && negotiation.created_by !== user.id) {
      return jsonResponse(403, {
        error: 'FORBIDDEN',
        message: 'You do not have permission to generate this split sheet',
      });
    }

    // Fetch all participants
    const { data: participants, error: partError } = await supabase
      .from('split_participants')
      .select('*')
      .eq('negotiation_id', negotiationId)
      .order('created_at', { ascending: true });

    if (partError) {
      console.error('[split-generate-pdf] Failed to fetch participants:', partError);
      return jsonResponse(500, {
        error: 'DATABASE_ERROR',
        message: 'Failed to fetch participants',
      });
    }

    if (!participants || participants.length === 0) {
      return jsonResponse(400, {
        error: 'NO_PARTICIPANTS',
        message: 'No participants found for this split negotiation',
      });
    }

    console.log('[split-generate-pdf] Generating PDF with', participants.length, 'participants');

    // Generate PDF
    const pdfBuffer = await generatePDFBuffer(negotiation, participants);

    // Upload to Supabase Storage
    const fileName = `splits/${negotiationId}.pdf`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('split_sheets')
      .upload(fileName, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) {
      console.error('[split-generate-pdf] Failed to upload PDF:', uploadError);
      return jsonResponse(500, {
        error: 'UPLOAD_FAILED',
        message: 'Failed to upload PDF to storage',
      });
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from('split_sheets')
      .getPublicUrl(fileName);

    const publicUrl = publicUrlData.publicUrl;

    // Update negotiation with PDF URL
    await supabase
      .from('split_negotiations')
      .update({ pdf_url: publicUrl })
      .eq('id', negotiationId);

    console.log('[split-generate-pdf] PDF generated successfully:', publicUrl);

    return jsonResponse(200, {
      success: true,
      pdf_url: publicUrl,
      message: 'Split sheet PDF generated successfully',
    });
  } catch (err: any) {
    console.error('[split-generate-pdf] Unexpected error:', err);
    return jsonResponse(500, {
      error: 'INTERNAL_ERROR',
      message: err.message || 'Failed to generate PDF',
    });
  }
};

async function generatePDFBuffer(negotiation: any, participants: any[]): Promise<Buffer> {
  try {
    // Create a new PDF document
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // US Letter size (8.5" x 11" = 612 x 792 points)
    const page = pdfDoc.addPage([612, 792]);
    const { width, height } = page.getSize();

    let y = height - 60;
    const margin = 50;
    const lineHeight = 20;

    // Helper function to draw text
    const drawText = (text: string, options: { x?: number; y?: number; size?: number; font?: any; color?: any } = {}) => {
      page.drawText(text, {
        x: options.x ?? margin,
        y: options.y ?? y,
        size: options.size ?? 10,
        font: options.font ?? font,
        color: options.color ?? rgb(0, 0, 0),
      });
    };

    // Header - Title
    drawText('SPLIT SHEET', {
      x: width / 2 - 60,
      size: 20,
      font: boldFont,
    });
    y -= 25;

    // Project Name
    drawText(`For: ${negotiation.project_name || 'Untitled Project'}`, {
      x: width / 2 - 80,
      size: 12,
    });
    y -= 30;

    // Date
    const date = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    drawText(`Generated: ${date}`, {
      x: width - 200,
      size: 9,
      color: rgb(0.4, 0.4, 0.4),
    });
    y -= 30;

    // Financial Terms
    if (negotiation.beat_fee || negotiation.advance_amount) {
      drawText('Financial Terms:', { size: 11, font: boldFont });
      y -= lineHeight;

      if (negotiation.beat_fee) {
        drawText(`Beat Fee: $${negotiation.beat_fee.toLocaleString()}`, { size: 10 });
        y -= lineHeight;
      }

      if (negotiation.advance_amount) {
        drawText(`Advance: $${negotiation.advance_amount.toLocaleString()}`, { size: 10 });
        y -= lineHeight;
      }

      y -= 10;
    }

    // Participants Table
    drawText('Participants & Splits:', { size: 11, font: boldFont });
    y -= 25;

    // Table headers
    const col1X = margin;
    const col2X = 180;
    const col3X = 280;
    const col4X = 360;
    const col5X = 440;

    drawText('Name', { x: col1X, size: 9, font: boldFont });
    drawText('Role', { x: col2X, size: 9, font: boldFont });
    drawText('Master %', { x: col3X, size: 9, font: boldFont });
    drawText('Pub %', { x: col4X, size: 9, font: boldFont });
    drawText('Signed', { x: col5X, size: 9, font: boldFont });
    y -= 20;

    // Table rows
    participants.forEach((p) => {
      const name = (p.name || p.email || 'N/A').substring(0, 25);
      const role = (p.role || 'N/A').substring(0, 20);
      const masterPct = p.master_rights_pct || 0;
      const pubPct = p.publishing_rights_pct || 0;
      const signed = p.signed_at ? 'Yes' : 'No';

      drawText(name, { x: col1X, size: 9 });
      drawText(role, { x: col2X, size: 9 });
      drawText(`${masterPct}%`, { x: col3X, size: 9 });
      drawText(`${pubPct}%`, { x: col4X, size: 9 });
      drawText(signed, { x: col5X, size: 9 });
      y -= lineHeight;

      // Check if we need a new page
      if (y < 100) {
        const newPage = pdfDoc.addPage([612, 792]);
        y = height - 60;
      }
    });

    y -= 10;

    // Totals
    const totalMaster = participants.reduce((sum, p) => sum + (p.master_rights_pct || 0), 0);
    const totalPub = participants.reduce((sum, p) => sum + (p.publishing_rights_pct || 0), 0);

    drawText(`Total Master Rights: ${totalMaster.toFixed(2)}%`, { size: 10, font: boldFont });
    y -= lineHeight;
    drawText(`Total Publishing Rights: ${totalPub.toFixed(2)}%`, { size: 10, font: boldFont });
    y -= 40;

    // Signatures section
    drawText('Signatures:', { size: 11, font: boldFont });
    y -= 25;

    participants.forEach((p) => {
      if (y < 150) {
        const newPage = pdfDoc.addPage([612, 792]);
        y = height - 60;
      }

      drawText(`${p.name || p.email}`, { size: 9, font: boldFont });
      y -= lineHeight;

      if (p.signed_at && p.signature_name) {
        drawText(`Digitally signed by: ${p.signature_name}`, { size: 8 });
        y -= 15;
        const signedDate = new Date(p.signed_at).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
        drawText(`Date: ${signedDate}`, { size: 8 });
        y -= 20;
      } else {
        drawText('________________________________', { size: 8 });
        y -= 15;
        drawText('Signature', { size: 8, color: rgb(0.5, 0.5, 0.5) });
        y -= 15;
        drawText('Date: _______________________', { size: 8, color: rgb(0.5, 0.5, 0.5) });
        y -= 25;
      }
    });

    // Footer disclaimer
    const disclaimer = 'This split sheet is for reference and documentation purposes. It is not legal advice. Consult an attorney for legally binding agreements.';
    const disclaimerLines = [
      'This split sheet is for reference and documentation purposes.',
      'It is not legal advice. Consult an attorney for legally binding agreements.',
    ];

    let footerY = 40;
    disclaimerLines.forEach((line) => {
      drawText(line, {
        x: width / 2 - 200,
        y: footerY,
        size: 7,
        color: rgb(0.4, 0.4, 0.4),
      });
      footerY += 10;
    });

    // Serialize the PDF document to bytes
    const pdfBytes = await pdfDoc.save();

    return Buffer.from(pdfBytes);
  } catch (error: any) {
    console.error('[split-generate-pdf] Error generating PDF with pdf-lib:', error);
    throw new Error(`PDF generation failed: ${error.message}`);
  }
}

export default handler;
