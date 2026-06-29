import os
from fastapi_mail import FastMail, MessageSchema, ConnectionConfig, MessageType
from dotenv import load_dotenv
from datetime import datetime

load_dotenv()

# Configuración SMTP cargada desde .env
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5176")

conf = ConnectionConfig(
    MAIL_USERNAME=os.getenv("MAIL_USERNAME", ""),
    MAIL_PASSWORD=os.getenv("MAIL_PASSWORD", ""),
    MAIL_FROM=os.getenv("MAIL_FROM", ""),
    MAIL_PORT=int(os.getenv("MAIL_PORT", 587)),
    MAIL_SERVER=os.getenv("MAIL_SERVER", "smtp.gmail.com"),
    MAIL_STARTTLS=os.getenv("MAIL_TLS", "True") == "True",
    MAIL_SSL_TLS=os.getenv("MAIL_SSL", "False") == "True",
    USE_CREDENTIALS=True,
    VALIDATE_CERTS=True
)


async def send_status_email(email_to: str, contrato_id: int, cliente: str, nuevo_estatus: str):
    """Envia correo cuando un contrato avanza de estatus."""
    if not email_to or "@" not in email_to:
        print(f"⚠️ [EMAIL] No se envio correo: Email invalido ({email_to})")
        return

    estatus_label = nuevo_estatus.split("_", 1)[-1].replace("_", " ").title()

    html = f"""
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #2563eb, #3b82f6); padding: 28px; border-radius: 12px 12px 0 0;">
            <h1 style="color: #fff; margin: 0; font-size: 20px;">✅ Avance de Contrato #{contrato_id}</h1>
            <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px;">Portal ERP — Seguimiento Legal</p>
        </div>
        <div style="background: #f8f9fa; padding: 28px; border: 1px solid #e5e7eb; border-top: none;">
            <p style="color: #374151; font-size: 15px; margin-top: 0;">
                El contrato del cliente <strong>{cliente}</strong> ha avanzado de etapa.
            </p>
            <div style="background: #dbeafe; padding: 16px; border-left: 4px solid #2563eb; border-radius: 4px; margin: 16px 0;">
                <p style="margin: 0; color: #1e40af; font-weight: 600;">Nuevo Estatus: {estatus_label}</p>
                <p style="margin: 4px 0 0; color: #1e40af; font-size: 13px;">Fecha: {datetime.now().strftime('%d/%m/%Y %H:%M')}</p>
            </div>
            <div style="text-align: center; margin-top: 24px;">
                <a href="{FRONTEND_URL}/legal"
                   style="background: linear-gradient(135deg, #2563eb, #3b82f6); color: white; padding: 12px 32px;
                          text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">
                    Ir al Sistema
                </a>
            </div>
        </div>
        <div style="text-align: center; padding: 14px; color: #9ca3af; font-size: 11px;">
            Portal ERP • Notificación automática • {datetime.now().strftime('%Y')}
        </div>
    </div>
    """

    message = MessageSchema(
        subject=f"Actualización Contrato #{contrato_id} — {cliente}",
        recipients=[email_to],
        body=html,
        subtype=MessageType.html
    )

    fm = FastMail(conf)
    try:
        await fm.send_message(message)
        print(f"📧 [EMAIL] Notificacion de avance enviada a {email_to}")
    except Exception as e:
        print(f"❌ [EMAIL] Error enviando: {e}")


async def send_alert_email(email_to: str, contrato_id: int, cliente: str, estatus: str, dias: int):
    """Envia alerta de estancamiento (llamada por el scheduler cada 24h)."""
    if not email_to or "@" not in email_to:
        return

    estatus_label = estatus.split("_", 1)[-1].replace("_", " ").title()

    html = f"""
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #dc2626, #ef4444); padding: 28px; border-radius: 12px 12px 0 0;">
            <h1 style="color: #fff; margin: 0; font-size: 20px;">⚠️ ALERTA: Contrato #{contrato_id}</h1>
            <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px;">Portal ERP — Seguimiento Legal</p>
        </div>
        <div style="background: #f8f9fa; padding: 28px; border: 1px solid #e5e7eb; border-top: none;">
            <p style="color: #374151; font-size: 15px; margin-top: 0;">
                El contrato de <strong>{cliente}</strong> requiere atención inmediata.
            </p>
            <div style="background: #fef2f2; padding: 16px; border-left: 4px solid #dc2626; border-radius: 4px; margin: 16px 0;">
                <p style="margin: 0; color: #991b1b; font-weight: 600;">Estatus Actual: {estatus_label}</p>
                <p style="margin: 4px 0 0; color: #991b1b; font-size: 13px;">Tiempo sin movimiento: {dias} días</p>
            </div>
            <p style="color: #6b7280; font-size: 14px;">Por favor ingresa al sistema para gestionar este contrato.</p>
            <div style="text-align: center; margin-top: 24px;">
                <a href="{FRONTEND_URL}/legal"
                   style="background: linear-gradient(135deg, #dc2626, #ef4444); color: white; padding: 12px 32px;
                          text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">
                    Resolver Ahora
                </a>
            </div>
        </div>
        <div style="text-align: center; padding: 14px; color: #9ca3af; font-size: 11px;">
            Portal ERP • Alerta automática • {datetime.now().strftime('%Y')}
        </div>
    </div>
    """

    message = MessageSchema(
        subject=f"⚠️ URGENTE: Retraso en Contrato #{contrato_id} — {cliente}",
        recipients=[email_to],
        body=html,
        subtype=MessageType.html
    )

    fm = FastMail(conf)
    try:
        await fm.send_message(message)
        print(f"🚨 [EMAIL] Alerta de retraso enviada a {email_to}")
    except Exception as e:
        print(f"❌ [EMAIL] Error enviando alerta: {e}")


async def send_creation_email(email_to: str, contrato_id: int, cliente: str, tipo: str, responsable: str):
    """Envia correo de confirmación cuando se crea un contrato nuevo."""
    if not email_to or "@" not in email_to:
        print(f"⚠️ [EMAIL] No se envio correo de creación: Email invalido ({email_to})")
        return

    html = f"""
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 28px; border-radius: 12px 12px 0 0;">
            <h1 style="color: #fff; margin: 0; font-size: 20px;">📄 Nuevo Contrato Creado</h1>
            <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px;">Portal ERP — Seguimiento Legal</p>
        </div>
        <div style="background: #f8f9fa; padding: 28px; border: 1px solid #e5e7eb; border-top: none;">
            <p style="color: #374151; font-size: 15px; margin-top: 0;">
                Se ha registrado exitosamente un nuevo contrato en el sistema:
            </p>
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                <tr style="border-bottom: 1px solid #e5e7eb;">
                    <td style="padding: 12px; font-weight: 600; color: #6b7280; width: 40%;">ID Contrato</td>
                    <td style="padding: 12px; color: #111827; font-weight: 700;">#{contrato_id}</td>
                </tr>
                <tr style="border-bottom: 1px solid #e5e7eb;">
                    <td style="padding: 12px; font-weight: 600; color: #6b7280;">Cliente</td>
                    <td style="padding: 12px; color: #111827;">{cliente}</td>
                </tr>
                <tr style="border-bottom: 1px solid #e5e7eb;">
                    <td style="padding: 12px; font-weight: 600; color: #6b7280;">Tipo de Contrato</td>
                    <td style="padding: 12px; color: #111827;">{tipo}</td>
                </tr>
                <tr style="border-bottom: 1px solid #e5e7eb;">
                    <td style="padding: 12px; font-weight: 600; color: #6b7280;">Responsable</td>
                    <td style="padding: 12px; color: #111827;">{responsable}</td>
                </tr>
                <tr style="border-bottom: 1px solid #e5e7eb;">
                    <td style="padding: 12px; font-weight: 600; color: #6b7280;">Estatus Inicial</td>
                    <td style="padding: 12px;">
                        <span style="background: #dbeafe; color: #1d4ed8; padding: 4px 12px; border-radius: 20px; font-size: 13px; font-weight: 600;">
                            Redacción Legal
                        </span>
                    </td>
                </tr>
                <tr>
                    <td style="padding: 12px; font-weight: 600; color: #6b7280;">Fecha</td>
                    <td style="padding: 12px; color: #111827;">{datetime.now().strftime('%d/%m/%Y %H:%M')}</td>
                </tr>
            </table>
            <div style="text-align: center; margin-top: 24px;">
                <a href="{FRONTEND_URL}/legal"
                   style="background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; padding: 12px 32px;
                          text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">
                    Ir al Sistema
                </a>
            </div>
        </div>
        <div style="text-align: center; padding: 14px; color: #9ca3af; font-size: 11px;">
            Portal ERP • Notificación automática • {datetime.now().strftime('%Y')}
        </div>
    </div>
    """

    message = MessageSchema(
        subject=f"✅ Contrato #{contrato_id} creado — {cliente}",
        recipients=[email_to],
        body=html,
        subtype=MessageType.html
    )

    fm = FastMail(conf)
    try:
        await fm.send_message(message)
        print(f"📧 [EMAIL] Confirmación de creación enviada a {email_to}")
    except Exception as e:
        print(f"❌ [EMAIL] Error enviando confirmación: {e}")
