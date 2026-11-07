import importlib.util
from pathlib import Path
from unittest.mock import Mock
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations
from fastapi.testclient import TestClient


def test_migracion_agrega_equipo_y_conserva_incidentes_existentes(tmp_path):
    engine = sa.create_engine('sqlite:///' + str(tmp_path / 'migration.db'))
    metadata = sa.MetaData()
    sa.Table('activos', metadata, sa.Column('id', sa.Integer, primary_key=True))
    sa.Table('incidentes_practica', metadata, sa.Column('id', sa.Integer, primary_key=True), sa.Column('descripcion', sa.Text, nullable=False))
    metadata.create_all(engine)
    file = Path(__file__).parents[1] / 'alembic/versions/d5e6f7a8b9c0_incidente_practica_activo.py'
    spec = importlib.util.spec_from_file_location('migracion_incidente', file)
    migration = importlib.util.module_from_spec(spec); spec.loader.exec_module(migration)
    with engine.begin() as connection:
        connection.execute(sa.text("INSERT INTO incidentes_practica (id, descripcion) VALUES (1, 'Incidente ficticio existente')"))
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
        fields = {c['name']: c for c in sa.inspect(connection).get_columns('incidentes_practica')}
        assert fields['activo_id']['nullable'] is True
        assert connection.execute(sa.text('SELECT descripcion, activo_id FROM incidentes_practica')).one() == ('Incidente ficticio existente', None)
        fk = sa.inspect(connection).get_foreign_keys('incidentes_practica')
        assert fk[0]['referred_table'] == 'activos'
        connection.execute(sa.text('INSERT INTO activos(id) VALUES (7)'))
        connection.execute(sa.text('UPDATE incidentes_practica SET activo_id=7 WHERE id=1'))
        assert connection.execute(sa.text('SELECT activo_id FROM incidentes_practica')).scalar_one() == 7
    engine.dispose()


def test_error_interno_conserva_cors_y_folio_en_app_real(monkeypatch):
    import main
    import middleware.error_handling as errors
    monkeypatch.setattr(errors, '_build_logger', lambda: Mock())
    before = list(main.app.router.routes)
    async def fallo():
        raise RuntimeError('Error ficticio de prueba')
    main.app.add_api_route('/_test_error_cors', fallo)
    try:
        client = TestClient(main.app, raise_server_exceptions=False)
        response = client.get('/_test_error_cors', headers={'Origin': 'https://siga-utecan.up.railway.app'})
        assert response.status_code == 500
        assert response.headers.get('access-control-allow-origin') in ('*', 'https://siga-utecan.up.railway.app')
        assert response.json()['folio'] == response.headers['x-request-id']
        assert 'Error ficticio' not in response.text
    finally:
        main.app.router.routes[:] = before
