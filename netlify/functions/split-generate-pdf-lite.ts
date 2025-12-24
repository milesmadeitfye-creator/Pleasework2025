import type { Handler } from '@netlify/functions';
import PDFDocument from 'pdfkit';

type LiteParticipant = {
  name: string;
  role?: string;
  master_rights_pct?: number;
  publishing_rights_pct?: number;
  performing_rights_org?: string;
  ipi_number?: string;
  how_to_credit?: string;
  signed_at?: string | null;
  signature_name?: string | null;
};

type PdfBody = {
  projectName: string;
  trackTitle?: string;
  createdAt?: string;
  hostName: string;
  participants: LiteParticipant[];
  beatFee?: number;
  advanceAmount?: number;
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

export const handler: Handler = async (event) => {
  console.log('[split-generate-pdf-lite] Request received');

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'METHOD_NOT_ALLOWED' }),
    };
  }

  try {
    if (!event.body) {
      return {
        statusCode: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'MISSING_BODY' }),
      };
    }

    const body = JSON.parse(event.body) as PdfBody;
    const { projectName, trackTitle, createdAt, hostName, participants, beatFee, advanceAmount } = body;

    if (!projectName || !hostName || !Array.isArray(participants)) {
      return {
        statusCode: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'MISSING_FIELDS',
          message: 'Missing required fields (projectName, hostName, participants)',
        }),
      };
    }

    console.log('[split-generate-pdf-lite] Generating PDF', {
      projectName,
      participantCount: participants.length,
    });

    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    const pdfPromise = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    doc
      .fontSize(18)
      .fillColor('#000000')
      .text('Ghoste One • Split Summary', { align: 'center' })
      .moveDown(0.5);

    doc
      .fontSize(12)
      .fillColor('#444444')
      .text(`Project: ${projectName}`)
      .text(`Track: ${trackTitle || 'N/A'}`)
      .text(`Host: ${hostName}`)
      .text(`Created: ${createdAt || new Date().toLocaleDateString()}`)
      .moveDown();

    doc
      .moveTo(50, doc.y)
      .lineTo(545, doc.y)
      .strokeColor('#cccccc')
      .stroke()
      .moveDown();

    if (beatFee || advanceAmount) {
      doc.fontSize(14).fillColor('#000000').text('Financial Terms').moveDown(0.5);

      if (beatFee) {
        doc.fontSize(11).fillColor('#222222').text(`Beat Fee: $${beatFee.toLocaleString()}`).moveDown(0.3);
      }

      if (advanceAmount) {
        doc.fontSize(11).fillColor('#222222').text(`Advance: $${advanceAmount.toLocaleString()}`).moveDown(0.3);
      }

      doc.moveDown();
      doc
        .moveTo(50, doc.y)
        .lineTo(545, doc.y)
        .strokeColor('#e5e5e5')
        .stroke()
        .moveDown();
    }

    doc.fontSize(14).fillColor('#000000').text('Participants & Splits').moveDown(0.5);

    const headerY = doc.y;
    doc.fontSize(11).fillColor('#555555');
    doc.text('Name', 50, headerY);
    doc.text('Role', 180, headerY);
    doc.text('Master %', 280, headerY);
    doc.text('Pub %', 350, headerY);
    doc.text('PRO', 410, headerY);
    doc.text('IPI', 470, headerY);
    doc.moveDown();

    doc
      .moveTo(50, doc.y)
      .lineTo(545, doc.y)
      .strokeColor('#e5e5e5')
      .stroke()
      .moveDown(0.3);

    doc.fontSize(11).fillColor('#222222');
    let currentY = doc.y;

    (participants || []).forEach((p) => {
      if (currentY > 750) {
        doc.addPage();
        currentY = 60;
      }

      const name = (p.name || '—').substring(0, 20);
      const role = (p.role || '—').substring(0, 15);
      const masterPct =
        typeof p.master_rights_pct === 'number' ? `${p.master_rights_pct.toFixed(1)}%` : '—';
      const pubPct =
        typeof p.publishing_rights_pct === 'number' ? `${p.publishing_rights_pct.toFixed(1)}%` : '—';
      const pro = (p.performing_rights_org || '—').substring(0, 10);
      const ipi = (p.ipi_number || '—').substring(0, 15);

      doc.text(name, 50, currentY, { width: 120 });
      doc.text(role, 180, currentY, { width: 90 });
      doc.text(masterPct, 280, currentY, { width: 60 });
      doc.text(pubPct, 350, currentY, { width: 50 });
      doc.text(pro, 410, currentY, { width: 50 });
      doc.text(ipi, 470, currentY, { width: 70 });
      currentY += 18;
    });

    doc.y = currentY;
    doc.moveDown(1);
    doc
      .moveTo(50, doc.y)
      .lineTo(545, doc.y)
      .strokeColor('#e5e5e5')
      .stroke()
      .moveDown(0.5);

    const totalMaster = participants.reduce((sum, p) => sum + (p.master_rights_pct || 0), 0);
    const totalPub = participants.reduce((sum, p) => sum + (p.publishing_rights_pct || 0), 0);

    doc
      .fontSize(11)
      .fillColor('#000000')
      .text(`Total Master Rights: ${totalMaster.toFixed(2)}%`)
      .moveDown(0.3);
    doc.text(`Total Publishing Rights: ${totalPub.toFixed(2)}%`).moveDown(1);

    doc
      .moveTo(50, doc.y)
      .lineTo(545, doc.y)
      .strokeColor('#e5e5e5')
      .stroke()
      .moveDown();

    doc.fontSize(14).fillColor('#000000').text('Signatures').moveDown(0.5);

    participants.forEach((p) => {
      if (doc.y > 720) {
        doc.addPage();
      }

      doc.fontSize(11).fillColor('#222222').text(`${p.name || '—'}`).moveDown(0.3);

      if (p.signed_at && p.signature_name) {
        doc
          .fontSize(9)
          .fillColor('#444444')
          .text(`Digitally signed by: ${p.signature_name}`)
          .moveDown(0.2);
        const signedDate = new Date(p.signed_at).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
        doc.text(`Date: ${signedDate}`).moveDown(0.5);
      } else {
        doc
          .fontSize(9)
          .fillColor('#888888')
          .text('________________________________')
          .moveDown(0.2);
        doc.text('Signature').moveDown(0.2);
        doc.text('Date: _______________________').moveDown(0.5);
      }
    });

    doc.moveDown(2);
    doc
      .fontSize(9)
      .fillColor('#666666')
      .text(
        'This document summarizes the current royalty split for this track. It is not a substitute for a fully executed legal agreement.',
        { align: 'left' }
      );

    doc.end();

    const pdfBuffer = await pdfPromise;
    const base64 = pdfBuffer.toString('base64');

    console.log('[split-generate-pdf-lite] PDF generated successfully', {
      size: pdfBuffer.length,
    });

    return {
      statusCode: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        success: true,
        filename: `${projectName.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-split-sheet.pdf`,
        base64,
      }),
    };
  } catch (e: any) {
    console.error('[split-generate-pdf-lite] Unexpected error', e);
    return {
      statusCode: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'INTERNAL_ERROR', message: e.message || 'Failed to generate PDF' }),
    };
  }
};

export default handler;
