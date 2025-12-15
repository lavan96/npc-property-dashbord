import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CallAlertEmailRequest {
  to: string;
  alertName: string;
  callId: string;
  customerName?: string;
  phoneNumber?: string;
  sentiment?: string;
  duration?: number;
  outcome?: string;
  cost?: number;
  message: string;
  isPositive: boolean;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      to,
      alertName,
      callId,
      customerName,
      phoneNumber,
      sentiment,
      duration,
      outcome,
      cost,
      message,
      isPositive,
    }: CallAlertEmailRequest = await req.json();

    console.log(`Sending call alert email to ${to} for alert: ${alertName}`);

    const formatDuration = (seconds?: number) => {
      if (!seconds) return "N/A";
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}m ${secs}s`;
    };

    const alertColor = isPositive ? "#22c55e" : "#ef4444";
    const alertIcon = isPositive ? "✓" : "⚠";

    const emailResponse = await resend.emails.send({
      from: "NPC Services Call Alerts <onboarding@resend.dev>",
      to: [to],
      subject: `${alertIcon} Call Alert: ${alertName}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f4f4f5; margin: 0; padding: 20px;">
          <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <div style="background: ${alertColor}; color: white; padding: 20px; text-align: center;">
              <h1 style="margin: 0; font-size: 24px;">${alertIcon} Call Alert Triggered</h1>
            </div>
            
            <div style="padding: 24px;">
              <div style="background: #f8fafc; border-radius: 6px; padding: 16px; margin-bottom: 20px;">
                <h2 style="margin: 0 0 8px 0; color: #1e293b; font-size: 18px;">${alertName}</h2>
                <p style="margin: 0; color: #64748b; font-size: 14px;">${message}</p>
              </div>
              
              <h3 style="color: #1e293b; font-size: 16px; margin: 0 0 16px 0;">Call Details</h3>
              
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 14px;">Customer</td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0; color: #1e293b; font-size: 14px; text-align: right;">${customerName || "Unknown"}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 14px;">Phone Number</td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0; color: #1e293b; font-size: 14px; text-align: right;">${phoneNumber || "N/A"}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 14px;">Sentiment</td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0; color: #1e293b; font-size: 14px; text-align: right;">
                    <span style="display: inline-block; padding: 2px 8px; border-radius: 4px; background: ${sentiment === 'positive' ? '#dcfce7' : sentiment === 'negative' ? '#fee2e2' : '#f1f5f9'}; color: ${sentiment === 'positive' ? '#166534' : sentiment === 'negative' ? '#991b1b' : '#475569'};">
                      ${sentiment || "Unknown"}
                    </span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 14px;">Duration</td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0; color: #1e293b; font-size: 14px; text-align: right;">${formatDuration(duration)}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 14px;">Outcome</td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0; color: #1e293b; font-size: 14px; text-align: right;">${outcome || "N/A"}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Cost</td>
                  <td style="padding: 8px 0; color: #1e293b; font-size: 14px; text-align: right;">${cost ? `$${cost.toFixed(4)}` : "N/A"}</td>
                </tr>
              </table>
              
              <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0;">
                <p style="margin: 0; color: #64748b; font-size: 12px; text-align: center;">
                  Call ID: ${callId}<br>
                  This is an automated alert from NPC Services Call Monitoring System.
                </p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    console.log("Email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ success: true, data: emailResponse }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error sending call alert email:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
