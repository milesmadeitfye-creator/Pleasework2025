import type { Handler } from "@netlify/functions";
import { getSupabaseAdmin } from "./_supabaseAdmin";
import PDFDocument from "pdfkit";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function jsonResponse(statusCode: number, data: any) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
    body: JSON.stringify(data),
  };
}

export const handler: Handler = async (event) => {
  console.log("[generate-split-sheet] Request received:", event.httpMethod);

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { success: false, error: "Method not allowed" });
  }

  try {
    let payload: any;
    try {
      payload = JSON.parse(event.body || "{}");
    } catch (err) {
      return jsonResponse(400, { success: false, error: "Invalid JSON body" });
    }

    const { negotiation_id } = payload;

    if (!negotiation_id || typeof negotiation_id !== "string") {
      return jsonResponse(400, {
        success: false,
        error: "Missing or invalid negotiation_id",
      });
    }

    console.log("[generate-split-sheet] Generating split sheet for:", negotiation_id);

    const supabase = getSupabaseAdmin();

    // Fetch negotiation
    const { data: negotiation, error: negError } = await supabase
      .from("split_negotiations")
      .select("*")
      .eq("id", negotiation_id)
      .single();

    if (negError || !negotiation) {
      console.error("[generate-split-sheet] Negotiation not found:", negError);
      return jsonResponse(404, {
        success: false,
        error: "Negotiation not found",
        details: negError?.message,
      });
    }

    // Fetch participants
    const { data: participants, error: partError } = await supabase
      .from("split_participants")
      .select("*")
      .eq("negotiation_id", negotiation_id)
      .order("created_at", { ascending: true });

    if (partError) {
      console.error("[generate-split-sheet] Error fetching participants:", partError);
      return jsonResponse(500, {
        success: false,
        error: "Failed to fetch participants",
        details: partError.message,
      });
    }

    if (!participants || participants.length === 0) {
      return jsonResponse(400, {
        success: false,
        error: "No participants found for this negotiation",
      });
    }

    console.log("[generate-split-sheet] Found", participants.length, "participants");

    // Generate PDF
    let pdfBuffer: Buffer;
    try {
      const doc = new PDFDocument({
        size: "LETTER",
        margin: 50,
        bufferPages: true
      });
      const chunks: Buffer[] = [];

      doc.on("data", (chunk) => chunks.push(chunk));

      await new Promise<void>((resolve, reject) => {
        doc.on("end", () => resolve());
        doc.on("error", (err) => reject(err));

      // Header
      doc.fontSize(20).fillColor("#000000").text("Split Sheet Agreement", { align: "center" });
      doc.moveDown();

      // Project Details
      doc.fontSize(14).fillColor("#000000").text("Project Details");
      doc.moveDown(0.5);
      doc.fontSize(11).fillColor("#000000");
      doc.text(`Project Name: ${negotiation.project_name}`);
      doc.text(`Date Generated: ${new Date().toLocaleDateString()}`);
      if (negotiation.beat_fee) {
        doc.text(`Beat Fee (USD): $${negotiation.beat_fee.toLocaleString()}`);
      }
      doc.moveDown();

      // Disclaimer
      doc.fontSize(9).fillColor("#666666");
      doc.text(
        "This split sheet is for reference only and not legal advice. For legally binding agreements, consult an attorney.",
        { align: "center" }
      );
      doc.fillColor("#000000");
      doc.moveDown();

      // Participants Table Header
      doc.fontSize(14).fillColor("#000000").text("Participants & Splits");
      doc.moveDown(0.5);

      // Table
      const tableTop = doc.y;
      const col1X = 50;
      const col2X = 180;
      const col3X = 280;
      const col4X = 380;
      const col5X = 480;

      doc.fontSize(9).fillColor("#000000");
      doc.text("Name / Email", col1X, tableTop);
      doc.text("Role", col2X, tableTop);
      doc.text("Credit", col3X, tableTop);
      doc.text("Master %", col4X, tableTop);
      doc.text("Pub %", col5X, tableTop);

      let yPos = tableTop + 20;

      participants.forEach((p, index) => {
        if (yPos > 700) {
          doc.addPage();
          yPos = 50;
        }

        doc.fontSize(9).fillColor("#000000");
        doc.text(p.name || "—", col1X, yPos, { width: 120 });
        doc.text(p.email || "—", col1X, yPos + 12, { width: 120 });
        doc.text(p.role || "—", col2X, yPos, { width: 90 });
        doc.text(p.how_to_credit || "—", col3X, yPos, { width: 90 });
        doc.text(`${p.master_rights_pct || 0}%`, col4X, yPos);
        doc.text(`${p.publishing_rights_pct || 0}%`, col5X, yPos);

        if (p.performing_rights_org || p.ipi_number) {
          const detailsY = yPos + 24;
          doc.fontSize(8).fillColor("#666666");
          if (p.performing_rights_org) {
            doc.text(`PRO: ${p.performing_rights_org}`, col1X, detailsY, { width: 200 });
          }
          if (p.ipi_number) {
            doc.text(`IPI: ${p.ipi_number}`, col3X, detailsY, { width: 200 });
          }
          doc.fillColor("#000000");
          yPos += 50;
        } else {
          yPos += 35;
        }

        if (index < participants.length - 1) {
          doc
            .moveTo(col1X, yPos - 5)
            .lineTo(530, yPos - 5)
            .stroke("#CCCCCC");
        }
      });

      doc.moveDown(2);

      // Signatures Section
      if (doc.y > 600) {
        doc.addPage();
      }

      doc.fontSize(14).fillColor("#000000").text("Signatures");
      doc.moveDown();

      participants.forEach((p) => {
        if (doc.y > 680) {
          doc.addPage();
        }

        doc.fontSize(11).fillColor("#000000");
        doc.text(`Name: ${p.name || "________________"}`);

        if (p.signed_at && p.signature_name) {
          doc.text(`Signature: ${p.signature_name}`);
          doc.text(`Date: ${new Date(p.signed_at).toLocaleDateString()}`);
          doc.fontSize(9).fillColor("#00AA00").text("✓ Signed", { continued: false });
          doc.fillColor("#000000");
        } else {
          doc.text("Signature: ________________");
          doc.text("Date: ________________");
        }

        doc.moveDown();
      });

      // Footer
      doc.fontSize(8).fillColor("#666666");
      doc.text(
        "Generated by Ghoste • For reference only, not legal advice",
        50,
        doc.page.height - 50,
        { align: "center" }
      );

        doc.end();
      });

      pdfBuffer = Buffer.concat(chunks);
      console.log("[generate-split-sheet] PDF generated, size:", pdfBuffer.length, "bytes");
    } catch (pdfError: any) {
      console.error("[generate-split-sheet] PDF generation error:", pdfError);
      return jsonResponse(500, {
        success: false,
        error: "Failed to generate PDF",
        details: pdfError.message,
      });
    }

    // Upload to Supabase Storage with consistent filename
    const filePath = `${negotiation_id}/split-sheet-latest.pdf`;

    const { error: uploadError } = await supabase.storage
      .from("split_sheets")
      .upload(filePath, pdfBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      console.error("[generate-split-sheet] Upload error:", uploadError);
      return jsonResponse(500, {
        success: false,
        error: "Failed to upload PDF",
        details: uploadError.message,
      });
    }

    console.log("[generate-split-sheet] PDF uploaded to:", filePath);

    // Build Ghoste route URL for the contract review page
    const contractUrl = `https://ghoste.one/contracts/${negotiation_id}`;

    // Update negotiation with contract_url pointing to Ghoste route
    const { error: updateError } = await supabase
      .from("split_negotiations")
      .update({ contract_url: contractUrl })
      .eq("id", negotiation_id);

    if (updateError) {
      console.error("[generate-split-sheet] Update error:", updateError);
      // Non-fatal - PDF is uploaded, just return the URL
    }

    console.log("[generate-split-sheet] Success! Contract URL:", contractUrl);

    return jsonResponse(200, {
      success: true,
      contractUrl: contractUrl,
    });
  } catch (err: any) {
    console.error("[generate-split-sheet] Unexpected error:", err);
    return jsonResponse(500, {
      success: false,
      error: "Unexpected server error",
      details: err?.message || String(err),
    });
  }
};
