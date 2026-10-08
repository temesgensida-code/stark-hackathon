import threading

from app.core import db


def test_init_db_survives_parallel_starts(tmp_path, monkeypatch):
    """Two API processes starting together used to crash one of them with 'table already exists'."""
    engine = db.make_engine(f"sqlite:///{tmp_path / 'race.db'}")
    monkeypatch.setattr(db, "engine", engine)
    errors = []

    def start():
        try:
            db.init_db()
        except Exception as exc:  # noqa: BLE001 - the test reports any failure
            errors.append(exc)

    threads = [threading.Thread(target=start) for _ in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert errors == []
    assert {"papers", "sections", "notes"} <= set(engine.dialect.get_table_names(engine.connect()))
