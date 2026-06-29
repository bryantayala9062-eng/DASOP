import re
path = 'api/legal/router.py'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('from models.all_models import Contrato, Bitacora, Usuario, Comentario', 'from models.all_models import Contrato, Bitacora, Usuario, Comentario, DocumentoMaterialidad')

endpoint = '''
@router.get("/contratos/{contract_id}/materialidad")
def obtener_documentos_materialidad(contract_id: int, db: Session = Depends(get_db), current_user: Usuario = Depends(require_mod_legal)):
    c = db.query(Contrato).filter(Contrato.id == contract_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Contrato no encontrado")

    if not c.empresa_id:
        return {"empresa_id": None, "documentos": []}

    documentos = (
        db.query(DocumentoMaterialidad)
        .filter(DocumentoMaterialidad.empresa_id == c.empresa_id)
        .order_by(DocumentoMaterialidad.fecha_subida.desc())
        .all()
    )

    return {
        "empresa_id": c.empresa_id,
        "documentos": [
            {
                "id": d.id,
                "tipo_documento": d.tipo_documento,
                "fecha_subida": d.fecha_subida.isoformat(),
                "resultado_op": d.resultado_op,
                "periodo": d.periodo,
            }
            for d in documentos
        ]
    }

# ============================================================
#  BITACORA & COMENTARIOS
# ============================================================
'''
content = content.replace('# ============================================================\n#  BITACORA & COMENTARIOS\n# ============================================================', endpoint)

with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(content)
print('Listo')
