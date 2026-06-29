# 📁 Carpeta de Plantillas de Contratos

## ⚠️ IMPORTANTE

Esta carpeta debe contener las **plantillas Word (.docx)** para cada empresa y tipo de contrato.

**Las plantillas NO se incluyen en el repositorio** por contener información privada de clientes.

---

## 📋 Estructura Requerida

```
templates/
├── NOMBRE_EMPRESA_1/
│   ├── TIPO_CONTRATO_A.docx
│   ├── TIPO_CONTRATO_B.docx
│   └── TIPO_CONTRATO_C/
│       └── plantilla.docx
├── NOMBRE_EMPRESA_2/
│   └── ...
└── README.md (este archivo)
```

---

## 🔧 Instrucciones de Configuración

1. **Obtener las plantillas**: Solicitar al administrador del sistema las plantillas Word originales.

2. **Copiar a esta carpeta**: Pegar todas las carpetas de empresas aquí dentro de `templates/`.

3. **Verificar estructura**: Cada empresa debe tener su propia carpeta con el nombre exacto.

4. **Etiquetas en Word**: Las plantillas deben contener estas etiquetas Jinja2:
   - `{{ nombre_de_la_empresa }}`
   - `{{ representante_legal }}`
   - `{{ nombre_del_cliente }}`
   - `{{ representante_legal_del_cliente }}`
   - `{{ declaraciones_del_cliente }}`
   - `{{ concepto_de_la_factura }}`
   - `{{ vigencia_del_contrato }}`
   - `{{ fecha_del_contrato }}`

---

## ❓ Problemas Comunes

| Error | Solución |
|-------|----------|
| "No se encontró la plantilla" | Verificar que el nombre de carpeta coincida con el catálogo de empresas |
| Texto no se reemplaza | Revisar que las etiquetas `{{ }}` estén correctamente escritas en Word |
| Caracteres extraños | Guardar el .docx en formato Word 2007+ (.docx) |
