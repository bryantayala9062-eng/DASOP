# Guía Definitiva: Exponer tu ERP a Internet con Cloudflare

¡Excelente decisión! Cloudflare no solo te proveerá el dominio, sino que su servicio de **Zero Trust (Tunnels)** protegerá tu red local sin necesidad de abrir puertos inseguros.

Sigue estos pasos en orden.

---

## FASE 1: Comprar el Dominio

Dado que ya autorizaron el pago, la forma más sencilla es comprar el dominio directamente a través de Cloudflare.

1. **Crea una cuenta**: Ve a [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up) y regístrate.
2. **Método de Pago**: Ve a "Billing" (Facturación) en el panel izquierdo y agrega tu tarjeta o PayPal.
3. **Buscar Dominio**: En el panel izquierdo, busca la sección **"Domain Registration"** y haz clic en **"Register Domains"**.
4. **Comprar**: Escribe el nombre que deseas (ej. `miempresa-erp.com`, `miempresa.dev`, etc.).
5. Selecciona el dominio, paga y espera a que aparezca como "Activo" en tu panel.

---

## FASE 2: Descargar e Instalar `cloudflared`

Vamos a descargar la herramienta oficial de Cloudflare que creará el túnel seguro desde tu servidor.

1. Abre tu terminal de **PowerShell** en tu servidor.
2. Posiciónate en la carpeta del ERP con este comando:
   ```powershell
   cd c:\Compacw\Documentos\PORTAL_ERP
   ```
3. Descarga el ejecutable (cópialo y pégalo tal cual):
   ```powershell
   Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile "cloudflared.exe"
   ```

---

## FASE 3: Vincular el Túnel con tu Cuenta 

Ahora conectaremos tu servidor con tu nueva cuenta de Cloudflare.

1. En la misma consola donde descargaste el archivo, ejecuta:
   ```bat
   .\cloudflared.exe tunnel login
   ```
2. Esto **abrirá una ventana del navegador**. Se te pedirá que inicies sesión en Cloudflare y que **elijas tu dominio recién comprado** para autorizarlo.
3. Si el navegador no se abre, la consola te dará un URL. Cópialo y pégalo en el navegador para autorizarlo.

---

## FASE 4: Crear y Enlazar el Túnel

1. Vamos a crear el túnel asignándole el nombre `tunel-erp`:
   ```bat
   .\cloudflared.exe tunnel create tunel-erp
   ```
2. Aparecerá un mensaje indicando el ID del túnel creado con éxito.
3. Ahora, vamos a decirle que el subdominio `erp.tudominio.com` apuntará a este túnel (reemplaza `tudominio.com` por el dominio que compraste):
   ```bat
   .\cloudflared.exe tunnel route dns tunel-erp erp.tudominio.com
   ```
   *(Nota: si quieres usar el dominio principal, omite el `erp.` y solo pon tu dominio).*

---

## FASE 5: Levantar el Túnel

Necesitamos decirle a Cloudflare a dónde enviar el tráfico. Gracias a que tu servidor frontend Vite (puerto 5190) ya maneja las encuestas al backend, solo debes exponer ese puerto.

Ejecuta el siguiente comando para **encender el túnel**:

```bat
.\cloudflared.exe tunnel --url http://localhost:5190 run tunel-erp
```

> **¡Y LISTO!** Mientras esta consola diga "Registered tunnel connection" y tengas tu frontend operando, tus jefes podrán entrar a `https://erp.tudominio.com` desde sus casas sin afectar la red del servidor.

---

## FASE 6: Archivo Automático para Uso Diario

Para no escribir todos los días ese comando, crea un archivo llamado **`INICIAR_TUNEL.bat`** en `C:\Compacw\Documentos\PORTAL_ERP` con lo siguiente:

```bat
@echo off
title Tunel Cloudflare ERP
echo Iniciando Tunel de Cloudflare hacia tu Portal ERP...
pushd "C:\Compacw\Documentos\PORTAL_ERP"
cloudflared.exe tunnel --url http://localhost:5190 run tunel-erp
pause
```

De esta forma tus procesos diarios seran:
1. Abrir `INICIAR_ERP.bat`
2. Abrir `INICIAR_TUNEL.bat`
