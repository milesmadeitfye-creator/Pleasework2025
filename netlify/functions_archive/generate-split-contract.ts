import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { negotiation_id } = JSON.parse(event.body || "{}");

    if (!negotiation_id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing negotiation_id" }),
      };
    }

    const { data: negotiation, error: negotiationError } = await supabase
      .from("split_negotiations")
      .select("*")
      .eq("id", negotiation_id)
      .single();

    if (negotiationError) {
      console.error("[generate-split-contract] Error:", negotiationError);
      if (negotiationError.message?.includes("does not exist")) {
        throw new Error("Split negotiations feature is not enabled");
      }
      throw new Error("Negotiation not found");
    }

    if (!negotiation) {
      throw new Error("Negotiation not found");
    }

    const { data: participants, error: participantsError } = await supabase
      .from("split_participants")
      .select("*")
      .eq("negotiation_id", negotiation_id);

    if (participantsError || !participants) {
      throw new Error("Participants not found");
    }

    const allSigned = participants.every(p => p.signed);

    const contractHtml = generateContractHTML(negotiation, participants, allSigned);

    return {
      statusCode: 200,
      headers: { "Content-Type": "text/html" },
      body: contractHtml,
    };
  } catch (err: any) {
    console.error("generate-split-contract error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || "Internal server error" }),
    };
  }
};

function generateContractHTML(negotiation: any, participants: any[], allSigned: boolean) {
  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const masterTotal = participants.reduce((sum, p) => sum + (p.master_percentage || p.percentage), 0);
  const publishingTotal = participants.reduce((sum, p) => sum + (p.publishing_percentage || p.percentage), 0);

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Split Agreement - ${negotiation.project_name}</title>
  <style>
    @media print {
      @page { margin: 0.5in; }
      body { margin: 0; padding: 20px; }
      .no-print { display: none; }
    }
    body {
      font-family: 'Times New Roman', serif;
      line-height: 1.6;
      color: #000;
      max-width: 8.5in;
      margin: 0 auto;
      padding: 40px;
      background: #fff;
    }
    h1 {
      text-align: center;
      font-size: 24px;
      margin-bottom: 30px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    h2 {
      font-size: 18px;
      margin-top: 30px;
      margin-bottom: 15px;
      border-bottom: 2px solid #000;
      padding-bottom: 5px;
    }
    p {
      margin-bottom: 15px;
      text-align: justify;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    th, td {
      border: 1px solid #000;
      padding: 12px;
      text-align: left;
    }
    th {
      background: #f0f0f0;
      font-weight: bold;
    }
    .signature-section {
      margin-top: 40px;
      page-break-inside: avoid;
    }
    .signature-block {
      margin-bottom: 40px;
      page-break-inside: avoid;
    }
    .signature-line {
      border-top: 1px solid #000;
      width: 300px;
      margin-top: 40px;
    }
    .date-line {
      border-top: 1px solid #000;
      width: 200px;
      margin-top: 40px;
      display: inline-block;
    }
    .signed {
      color: #059669;
      font-weight: bold;
    }
    .button {
      display: inline-block;
      padding: 12px 24px;
      background: #3b82f6;
      color: #fff;
      text-decoration: none;
      border-radius: 6px;
      font-weight: bold;
      margin: 20px 10px 20px 0;
    }
    .button:hover {
      background: #2563eb;
    }
  </style>
</head>
<body>
  <div class="no-print" style="text-align: center; margin-bottom: 30px;">
    <button onclick="window.print()" class="button">Print Contract</button>
    <button onclick="downloadPDF()" class="button">Download PDF</button>
  </div>

  <h1>Music Rights Split Agreement</h1>

  <p><strong>Project Name:</strong> ${negotiation.project_name}</p>
  <p><strong>Agreement Date:</strong> ${today}</p>
  <p><strong>Status:</strong> ${allSigned ? '<span class="signed">FULLY EXECUTED</span>' : 'PENDING SIGNATURES'}</p>

  <h2>1. Parties</h2>
  <p>This Split Agreement ("Agreement") is entered into by and between the following parties (collectively, the "Parties"):</p>

  <table>
    <thead>
      <tr>
        <th>Name</th>
        <th>Email</th>
        <th>Role</th>
        <th>Credit As</th>
      </tr>
    </thead>
    <tbody>
      ${participants.map(p => `
      <tr>
        <td>${p.name}</td>
        <td>${p.email}</td>
        <td>${p.role}</td>
        <td>${p.credit_name || p.name}</td>
      </tr>
      `).join('')}
    </tbody>
  </table>

  <h2>2. Master Recording Rights Split</h2>
  <p>The Parties agree to the following division of master recording rights and revenue for the musical composition titled "<strong>${negotiation.project_name}</strong>":</p>

  <table>
    <thead>
      <tr>
        <th>Name</th>
        <th>Role</th>
        <th>Master Rights %</th>
      </tr>
    </thead>
    <tbody>
      ${participants.map(p => `
      <tr>
        <td>${p.name}</td>
        <td>${p.role}</td>
        <td><strong>${p.master_percentage || p.percentage}%</strong></td>
      </tr>
      `).join('')}
      <tr style="background: #f0f0f0;">
        <td colspan="2"><strong>TOTAL</strong></td>
        <td><strong>${masterTotal.toFixed(2)}%</strong></td>
      </tr>
    </tbody>
  </table>

  <h2>3. Publishing Rights Split</h2>
  <p>The Parties agree to the following division of publishing rights and revenue:</p>

  <table>
    <thead>
      <tr>
        <th>Name</th>
        <th>Role</th>
        <th>Publishing Rights %</th>
      </tr>
    </thead>
    <tbody>
      ${participants.map(p => `
      <tr>
        <td>${p.name}</td>
        <td>${p.role}</td>
        <td><strong>${p.publishing_percentage || p.percentage}%</strong></td>
      </tr>
      `).join('')}
      <tr style="background: #f0f0f0;">
        <td colspan="2"><strong>TOTAL</strong></td>
        <td><strong>${publishingTotal.toFixed(2)}%</strong></td>
      </tr>
    </tbody>
  </table>

  <h2>4. Terms and Conditions</h2>

  <p><strong>4.1 Revenue Distribution:</strong> All revenue generated from the exploitation of the master recording and publishing rights shall be distributed to the Parties according to their respective percentages outlined above.</p>

  <p><strong>4.2 Credit:</strong> Each Party shall be credited as specified in Section 1 on all releases, promotional materials, and public performances where credits are provided.</p>

  <p><strong>4.3 Rights Granted:</strong> Each Party retains ownership of their respective percentages of both master and publishing rights as outlined in this Agreement.</p>

  <p><strong>4.4 Administration:</strong> The Parties agree to collectively determine the administration of rights, or to appoint a designated administrator subject to unanimous consent.</p>

  <p><strong>4.5 Modifications:</strong> This Agreement may only be modified by written consent of all Parties.</p>

  <p><strong>4.6 Dispute Resolution:</strong> Any disputes arising from this Agreement shall be resolved through good faith negotiation or mediation before pursuing legal action.</p>

  <p><strong>4.7 Binding Effect:</strong> This Agreement shall be binding upon and inure to the benefit of the Parties and their respective heirs, successors, and assigns.</p>

  <h2>5. Signatures</h2>
  <p>By signing below, each Party acknowledges that they have read, understood, and agree to be bound by the terms of this Agreement.</p>

  <div class="signature-section">
    ${participants.map(p => `
    <div class="signature-block">
      <p><strong>${p.name}</strong></p>
      <p>Role: ${p.role}</p>
      <p>Email: ${p.email}</p>
      ${p.signed ? `
        <p class="signed">✓ SIGNED on ${new Date(p.signed_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
      ` : `
        <div class="signature-line"></div>
        <p style="margin-top: 5px; font-size: 12px;">Signature</p>
        <div class="date-line" style="margin-left: 0;"></div>
        <p style="margin-top: 5px; font-size: 12px;">Date</p>
      `}
    </div>
    `).join('')}
  </div>

  <p style="margin-top: 60px; font-size: 11px; text-align: center; color: #666;">
    This agreement was generated via Ghoste (ghoste.one) on ${today}.
  </p>

  <script>
    function downloadPDF() {
      alert('To download as PDF, use your browser\\'s Print function and select "Save as PDF" as the destination.');
      window.print();
    }
  </script>
</body>
</html>
  `;
}
