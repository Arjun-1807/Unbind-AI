import asyncio
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.config import get_settings

logger = logging.getLogger(__name__)


def _send_smtp(
    to_email: str,
    subject: str,
    html_body: str,
    reply_to: str | None = None,
) -> None:
    """Blocking SMTP send — called inside a thread via asyncio.to_thread."""
    settings = get_settings()

    if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        print(
            "[SMTP WARNING] SMTP credentials not configured (SMTP_USER or SMTP_PASSWORD is empty) — email not sent.",
            flush=True,
        )
        raise ValueError("SMTP credentials not configured on the server")

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{settings.EMAIL_FROM_NAME} <{settings.SMTP_USER}>"
    msg["To"] = to_email
    if reply_to:
        msg["Reply-To"] = reply_to

    msg.attach(MIMEText(html_body, "html"))

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
        server.ehlo()
        server.starttls()
        server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        server.sendmail(settings.SMTP_USER, to_email, msg.as_string())

    logger.info("Email sent to %s (subject: %s)", to_email, subject)


async def send_email(
    to_email: str,
    subject: str,
    html_body: str,
    reply_to: str | None = None,
) -> None:
    """Non-blocking email send. Errors are logged but never raised to callers."""
    try:
        print(f"[SMTP] Attempting to send email to {to_email}...", flush=True)
        await asyncio.to_thread(_send_smtp, to_email, subject, html_body, reply_to)
        print(f"[SMTP] Successfully sent email to {to_email}", flush=True)
    except Exception as exc:
        print(f"[SMTP ERROR] Failed to send email to {to_email}: {exc}", flush=True)
        raise exc


# ── Pre-built template helpers ────────────────────────────────────────────────


async def send_lawyer_contact_email(
    lawyer_email: str,
    lawyer_name: str,
    user_email: str,
    message: str,
) -> None:
    """
    Send a contact request email TO the lawyer FROM the platform,
    with the user's email as Reply-To so the lawyer can reply directly.
    """
    subject = f"New Client Enquiry via UnBind AI — {user_email}"
    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8"/>
      <style>
        body {{ font-family: 'Segoe UI', Arial, sans-serif; background: #0f0f13; margin: 0; padding: 0; color: #e5e7eb; }}
        .wrapper {{ max-width: 580px; margin: 40px auto; background: #1a1a2e; border: 1px solid #2d2d44; border-radius: 12px; overflow: hidden; }}
        .header {{ background: linear-gradient(135deg, #4f46e5, #7c3aed); padding: 32px 36px; }}
        .header h1 {{ margin: 0; font-size: 22px; color: #fff; font-weight: 700; letter-spacing: -0.3px; }}
        .header p {{ margin: 6px 0 0; font-size: 14px; color: rgba(255,255,255,0.7); }}
        .body {{ padding: 32px 36px; }}
        .greeting {{ font-size: 16px; color: #c7d2fe; margin-bottom: 20px; }}
        .message-box {{ background: #0f0f20; border: 1px solid #312e6b; border-radius: 8px; padding: 20px 24px; margin: 20px 0; }}
        .message-box p {{ margin: 0; font-size: 15px; color: #e5e7eb; line-height: 1.65; white-space: pre-wrap; }}
        .info-row {{ display: flex; align-items: center; gap: 10px; margin: 14px 0; font-size: 14px; color: #9ca3af; }}
        .info-label {{ color: #6366f1; font-weight: 600; min-width: 100px; }}
        .reply-btn {{ display: inline-block; margin-top: 28px; padding: 12px 28px; background: #4f46e5; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-size: 15px; font-weight: 600; }}
        .footer {{ padding: 20px 36px; border-top: 1px solid #2d2d44; font-size: 12px; color: #6b7280; text-align: center; }}
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="header">
          <h1>New Client Enquiry</h1>
          <p>UnBind AI · Lawyer Referral Network</p>
        </div>
        <div class="body">
          <p class="greeting">Hi <strong>{lawyer_name}</strong>,</p>
          <p style="font-size:15px; color:#9ca3af; line-height:1.6;">
            A potential client has sent you a contact request through the UnBind AI Lawyer Referral Network.
          </p>

          <div class="info-row"><span class="info-label">From:</span> {user_email}</div>

          <div class="message-box">
            <p>{message}</p>
          </div>

          <a href="mailto:{user_email}" class="reply-btn" style="color: #ffffff !important; text-decoration: none;">Reply to {user_email}</a>

          <p style="margin-top:28px; font-size:13px; color:#6b7280; line-height:1.6;">
            This message was sent via the UnBind AI platform. Reply directly to this email or
            use the button above to respond to the client.
          </p>
        </div>
        <div class="footer">
          UnBind AI · Lawyer Referral Network<br/>
          You are receiving this because you are registered in our lawyer directory.
        </div>
      </div>
    </body>
    </html>
    """
    await send_email(
        to_email=lawyer_email,
        subject=subject,
        html_body=html_body,
        reply_to=user_email,
    )


async def send_payment_receipt_email(
    to_email: str,
    plan_label: str,
    amount: int,
    currency: str,
    payment_id: str,
    order_id: str,
    expires_at: str | None = None,
) -> None:
    """Send a payment confirmation / receipt to the user after a successful
    plan purchase. ``amount`` is in the smallest currency unit (paise for INR).
    """
    # Format the amount for display, e.g. 45000 paise -> "₹450.00".
    symbol = "₹" if currency.upper() == "INR" else ""
    amount_display = f"{symbol}{amount / 100:,.2f} {currency.upper()}".strip()
    validity = f"Valid until {expires_at[:10]}" if expires_at else "Lifetime access — never expires"

    subject = f"Your UnBind AI receipt — {plan_label}"
    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8"/>
      <style>
        body {{ font-family: 'Segoe UI', Arial, sans-serif; background: #0f0f13; margin: 0; padding: 0; color: #e5e7eb; }}
        .wrapper {{ max-width: 580px; margin: 40px auto; background: #1a1a2e; border: 1px solid #2d2d44; border-radius: 12px; overflow: hidden; }}
        .header {{ background: linear-gradient(135deg, #4f46e5, #7c3aed); padding: 32px 36px; }}
        .header h1 {{ margin: 0; font-size: 22px; color: #fff; font-weight: 700; letter-spacing: -0.3px; }}
        .header p {{ margin: 6px 0 0; font-size: 14px; color: rgba(255,255,255,0.7); }}
        .body {{ padding: 32px 36px; }}
        .amount {{ font-size: 32px; font-weight: 700; color: #fff; margin: 8px 0 24px; }}
        .row {{ display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #2d2d44; font-size: 14px; }}
        .row .label {{ color: #9ca3af; }}
        .row .value {{ color: #e5e7eb; font-weight: 600; text-align: right; }}
        .badge {{ display: inline-block; margin-top: 20px; padding: 8px 16px; background: #052e1b; color: #4ade80; border: 1px solid #14532d; border-radius: 8px; font-size: 13px; font-weight: 600; }}
        .footer {{ padding: 20px 36px; border-top: 1px solid #2d2d44; font-size: 12px; color: #6b7280; text-align: center; }}
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="header">
          <h1>Payment Successful</h1>
          <p>UnBind AI · Receipt</p>
        </div>
        <div class="body">
          <p style="font-size:15px; color:#9ca3af; margin:0;">Thank you for your purchase. Your plan is now active.</p>
          <div class="amount">{amount_display}</div>
          <div class="row"><span class="label">Plan</span><span class="value">{plan_label}</span></div>
          <div class="row"><span class="label">Validity</span><span class="value">{validity}</span></div>
          <div class="row"><span class="label">Payment ID</span><span class="value">{payment_id}</span></div>
          <div class="row"><span class="label">Order ID</span><span class="value">{order_id}</span></div>
          <div class="badge">✓ Plan activated</div>
          <p style="margin-top:28px; font-size:13px; color:#6b7280; line-height:1.6;">
            Keep this email for your records. If you have any questions about your
            subscription, just reply to this message.
          </p>
        </div>
        <div class="footer">
          UnBind AI · AI-powered legal contract analysis
        </div>
      </div>
    </body>
    </html>
    """
    await send_email(to_email=to_email, subject=subject, html_body=html_body)
