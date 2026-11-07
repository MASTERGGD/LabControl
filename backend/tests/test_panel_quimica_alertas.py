import datetime
from fastapi import HTTPException
import pytest
from models.practica_laboratorio import InsumoLaboratorio
from models.usuario import RolUsuario
from routers.practicas_laboratorio import resumen_laboratorio


def test_alertas_limites_de_caducidad_stock_y_laboratorio(db, lab, docente_user, monkeypatch):
    import routers.practicas_laboratorio as router
    hoy = datetime.date(2026,11,6)
    monkeypatch.setattr(router, 'now_mx', lambda: datetime.datetime(2026,11,6,12))
    lab.categoria='QUIMICA'; docente_user.rol=RolUsuario.RESPONSABLE_LAB; docente_user.laboratorio_id=lab.id
    for nombre, categoria, dias, qty, minimo, activo in [
        ('Hoy','REACTIVO',0,4,1,True),('Día 30','REACTIVO',30,1,1,True),
        ('Día 31','REACTIVO',31,5,1,True),('Vencido','REACTIVO',-1,0,1,True),
        ('Consumible','CONSUMIBLE',2,5,1,True),('Inactivo','REACTIVO',1,0,1,False),
    ]:
        db.add(InsumoLaboratorio(laboratorio_id=lab.id,nombre=nombre,categoria=categoria,caduca_en=hoy+datetime.timedelta(days=dias),cantidad_disponible=qty,stock_minimo=minimo,activo=activo))
    db.commit()
    r=resumen_laboratorio(lab.id,db,docente_user)
    assert r['insumos_total']==5 and r['stock_bajo']==2 and r['insumos_caducados']==1
    assert r['reactivos_por_vencer']==2 and r['por_vencer_dias']==30
    assert [i['nombre'] for i in r['alertas_insumos']['por_vencer']]==['Hoy','Día 30']
    assert r['practicas_solicitadas']==0
    docente_user.laboratorio_id=None
    with pytest.raises(HTTPException) as exc: resumen_laboratorio(lab.id,db,docente_user)
    assert exc.value.status_code==403


def test_laboratorio_sin_insumos_explica_ausencia_de_registros(db, lab, admin_user):
    lab.categoria='AGROINDUSTRIA';db.commit()
    r=resumen_laboratorio(lab.id,db,admin_user)
    assert r['insumos_total']==0 and r['reactivos_por_vencer']==0
    assert r['alertas_insumos']=={'stock_bajo':[],'por_vencer':[],'caducados':[]}
