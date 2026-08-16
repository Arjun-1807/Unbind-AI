"""Tests for the outbound email templates and the embedding client's isolation.

The templates build HTML by f-string interpolation, so every value that reaches
one has to be escaped — a receipt is mail our users trust, and an unescaped
field is an injection hole one refactor away from being reachable.
"""

import pytest

from app.services import email_service


@pytest.fixture
def captured(monkeypatch):
    """Capture what send_email would have delivered, without touching SMTP."""
    sent = {}

    async def fake_send_email(**kwargs):
        sent.update(kwargs)

    monkeypatch.setattr(email_service, "send_email", fake_send_email)
    return sent


# ── Receipt escaping ─────────────────────────────────────────────────────────


async def test_receipt_escapes_every_interpolated_field(captured):
    await email_service.send_payment_receipt_email(
        to_email="user@example.com",
        plan_label="<script>alert('plan')</script>",
        amount=45000,
        currency="INR",
        payment_id="pay_<img src=x onerror=alert(1)>",
        order_id='order_"><b>bold</b>',
        expires_at="2027-01-01T00:00:00+00:00",
    )
    body = captured["html_body"]
    assert "<script>alert('plan')</script>" not in body
    assert "&lt;script&gt;" in body
    assert "<img src=x" not in body
    assert "<b>bold</b>" not in body


async def test_receipt_escapes_the_validity_line(captured):
    """expires_at is sliced straight into the template, so it needs escaping too."""
    await email_service.send_payment_receipt_email(
        to_email="user@example.com",
        plan_label="Pro",
        amount=45000,
        currency="INR",
        payment_id="pay_1",
        order_id="order_1",
        expires_at="<b>2027-01</b>",
    )
    assert "<b>2027-01</b>" not in captured["html_body"]


# ── Money formatting ─────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "amount,expected",
    [
        (45000, "₹450.00"),
        (99, "₹0.99"),
        (0, "₹0.00"),
        (1, "₹0.01"),
        (123456789, "₹1,234,567.89"),
        # 8.615 in binary float rounds the wrong way with f"{x:,.2f}"; Decimal
        # keeps the exact paise value the payment processor recorded.
        (861_5, "₹86.15"),
    ],
)
async def test_amount_is_formatted_exactly_from_the_integer_paise(captured, amount, expected):
    await email_service.send_payment_receipt_email(
        to_email="user@example.com",
        plan_label="Pro",
        amount=amount,
        currency="INR",
        payment_id="pay_1",
        order_id="order_1",
    )
    assert f"{expected} INR" in captured["html_body"]


async def test_non_inr_currency_has_no_rupee_symbol(captured):
    await email_service.send_payment_receipt_email(
        to_email="user@example.com",
        plan_label="Pro",
        amount=1999,
        currency="usd",
        payment_id="pay_1",
        order_id="order_1",
    )
    assert "19.99 USD" in captured["html_body"]
    assert "₹" not in captured["html_body"]


# ── send_email's real contract ───────────────────────────────────────────────


async def test_send_email_reraises_so_callers_can_react(monkeypatch):
    """Every call site wraps this in try/except and depends on the raise."""

    def boom(*args, **kwargs):
        raise RuntimeError("smtp down")

    monkeypatch.setattr(email_service, "_send_smtp", boom)
    with pytest.raises(RuntimeError):
        await email_service.send_email("u@example.com", "subject", "<p>hi</p>")
