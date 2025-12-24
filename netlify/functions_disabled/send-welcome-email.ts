import type { Handler } from "@netlify/functions";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { email, name } = body;

    if (!email) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing email" }),
      };
    }

    const displayName = name || "there";
    const dashboardUrl = `${process.env.URL || "https://ghoste.one"}/dashboard`;

    const emailHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Ghoste</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%);">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse; background: linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%); border-radius: 16px; border: 1px solid #2a2a2a; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);">

          <!-- Header with Celebration -->
          <tr>
            <td style="padding: 40px 40px 30px 40px; text-align: center; background: linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(59, 130, 246, 0.1) 100%); border-radius: 16px 16px 0 0;">
              <div style="display: inline-block; padding: 16px 32px; background: linear-gradient(135deg, #10b981 0%, #3b82f6 100%); border-radius: 50px; margin-bottom: 24px; box-shadow: 0 8px 24px rgba(16, 185, 129, 0.3);">
                <span style="font-size: 40px;">🎉</span>
              </div>
              <h1 style="margin: 0 0 12px 0; font-size: 36px; font-weight: bold; background: linear-gradient(135deg, #10b981 0%, #3b82f6 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">
                Welcome to Ghoste!
              </h1>
              <p style="margin: 0; font-size: 18px; color: #9ca3af;">
                You're all set, ${displayName}
              </p>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 40px; color: #d1d5db;">
              <p style="margin: 0 0 24px 0; font-size: 18px; line-height: 1.6; color: #ffffff; font-weight: 600;">
                Thank you for confirming your email!
              </p>
              <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: #9ca3af;">
                Your account is now fully activated and ready to go. You can start creating smart links, tracking analytics, and connecting with your fans.
              </p>

              <!-- Feature Highlights -->
              <div style="margin: 32px 0;">
                <h2 style="margin: 0 0 20px 0; font-size: 20px; font-weight: bold; color: #ffffff;">
                  What you can do now:
                </h2>

                <!-- Feature 1 -->
                <div style="margin: 0 0 16px 0; padding: 16px; background: rgba(16, 185, 129, 0.05); border: 1px solid rgba(16, 185, 129, 0.2); border-radius: 8px; display: flex; align-items: start;">
                  <div style="flex-shrink: 0; margin-right: 12px;">
                    <span style="font-size: 24px;">🔗</span>
                  </div>
                  <div>
                    <p style="margin: 0 0 4px 0; font-size: 16px; font-weight: 600; color: #10b981;">
                      Create Smart Links
                    </p>
                    <p style="margin: 0; font-size: 14px; line-height: 1.5; color: #9ca3af;">
                      Build beautiful landing pages for your music across all streaming platforms
                    </p>
                  </div>
                </div>

                <!-- Feature 2 -->
                <div style="margin: 0 0 16px 0; padding: 16px; background: rgba(59, 130, 246, 0.05); border: 1px solid rgba(59, 130, 246, 0.2); border-radius: 8px; display: flex; align-items: start;">
                  <div style="flex-shrink: 0; margin-right: 12px;">
                    <span style="font-size: 24px;">📊</span>
                  </div>
                  <div>
                    <p style="margin: 0 0 4px 0; font-size: 16px; font-weight: 600; color: #3b82f6;">
                      Track Analytics
                    </p>
                    <p style="margin: 0; font-size: 14px; line-height: 1.5; color: #9ca3af;">
                      Monitor clicks, engagement, and fan demographics in real-time
                    </p>
                  </div>
                </div>

                <!-- Feature 3 -->
                <div style="margin: 0 0 16px 0; padding: 16px; background: rgba(168, 85, 247, 0.05); border: 1px solid rgba(168, 85, 247, 0.2); border-radius: 8px; display: flex; align-items: start;">
                  <div style="flex-shrink: 0; margin-right: 12px;">
                    <span style="font-size: 24px;">🎯</span>
                  </div>
                  <div>
                    <p style="margin: 0 0 4px 0; font-size: 16px; font-weight: 600; color: #a855f7;">
                      Run Ad Campaigns
                    </p>
                    <p style="margin: 0; font-size: 14px; line-height: 1.5; color: #9ca3af;">
                      Connect your Meta Pixel and create targeted ads for your releases
                    </p>
                  </div>
                </div>

                <!-- Feature 4 -->
                <div style="margin: 0 0 16px 0; padding: 16px; background: rgba(236, 72, 153, 0.05); border: 1px solid rgba(236, 72, 153, 0.2); border-radius: 8px; display: flex; align-items: start;">
                  <div style="flex-shrink: 0; margin-right: 12px;">
                    <span style="font-size: 24px;">🎨</span>
                  </div>
                  <div>
                    <p style="margin: 0 0 4px 0; font-size: 16px; font-weight: 600; color: #ec4899;">
                      AI Cover Art
                    </p>
                    <p style="margin: 0; font-size: 14px; line-height: 1.5; color: #9ca3af;">
                      Generate stunning cover artwork with our AI-powered tools
                    </p>
                  </div>
                </div>
              </div>

              <!-- CTA Button -->
              <table role="presentation" style="margin: 40px 0 30px 0; width: 100%;">
                <tr>
                  <td align="center">
                    <a href="${dashboardUrl}" style="display: inline-block; padding: 18px 48px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 16px rgba(16, 185, 129, 0.4);">
                      Go to Dashboard
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Support Section -->
              <div style="margin: 30px 0 0 0; padding: 24px; background: rgba(59, 130, 246, 0.05); border: 1px solid rgba(59, 130, 246, 0.2); border-radius: 8px;">
                <p style="margin: 0 0 12px 0; font-size: 16px; font-weight: 600; color: #ffffff;">
                  Need help getting started?
                </p>
                <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.6; color: #9ca3af;">
                  Check out our guides and tutorials, or reach out to our support team. We're here to help you succeed.
                </p>
                <a href="${dashboardUrl}" style="color: #3b82f6; text-decoration: none; font-size: 14px; font-weight: 500;">
                  Visit Help Center →
                </a>
              </div>

              <p style="margin: 30px 0 0 0; font-size: 16px; color: #9ca3af; line-height: 1.6;">
                Thanks for choosing Ghoste,<br/>
                <span style="color: #ffffff; font-weight: 600;">The Ghoste Team</span>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; text-align: center; border-top: 1px solid #2a2a2a;">
              <table role="presentation" style="margin: 0 auto 16px auto;">
                <tr>
                  <td style="padding: 0 12px;">
                    <a href="${dashboardUrl}" style="color: #6b7280; text-decoration: none; font-size: 12px;">Dashboard</a>
                  </td>
                  <td style="padding: 0 12px; color: #4b5563;">•</td>
                  <td style="padding: 0 12px;">
                    <a href="${process.env.URL || "https://ghoste.one"}/pricing" style="color: #6b7280; text-decoration: none; font-size: 12px;">Pricing</a>
                  </td>
                  <td style="padding: 0 12px; color: #4b5563;">•</td>
                  <td style="padding: 0 12px;">
                    <a href="${process.env.URL || "https://ghoste.one"}/privacy-policy" style="color: #6b7280; text-decoration: none; font-size: 12px;">Privacy</a>
                  </td>
                </tr>
              </table>
              <p style="margin: 0 0 8px 0; font-size: 12px; color: #6b7280;">
                © ${new Date().getFullYear()} Ghoste. All rights reserved.
              </p>
              <p style="margin: 0; font-size: 11px; color: #4b5563;">
                Smart links for musicians and creators
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    console.log("Welcome email template generated for:", email);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: "Welcome email template generated",
        email,
      }),
    };
  } catch (err: any) {
    console.error("send-welcome-email error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || "Internal server error" }),
    };
  }
};
