def test_simulate_websocket_handshake_and_write(client):
    with client.websocket_connect("/braille/simulate") as ws:
        hello = ws.receive_json()
        assert hello["type"] == "hello"
        assert hello["driver"] == "virtual-sim"
        assert hello["cells"] == 40
        assert hello["rows"] == 1

        init_cells = ws.receive_json()
        assert init_cells["type"] == "write"
        assert len(init_cells["cells"]) == 40

        # Send write message
        test_cells = [1, 2, 3] + [0] * 37
        ws.send_json({"type": "write", "cells": test_cells})

        # Ask for info
        ws.send_json({"type": "info"})
        info = ws.receive_json()
        assert info["type"] == "hello"
        assert info["cells"] == 40
        cells_resp = ws.receive_json()
        assert cells_resp["type"] == "write"
        assert cells_resp["cells"][:3] == [1, 2, 3]


def test_simulate_broadcast_keys_and_writes_between_clients(client):
    with client.websocket_connect("/braille/simulate") as ws1:
        _ = ws1.receive_json()  # hello
        _ = ws1.receive_json()  # initial cells

        with client.websocket_connect("/braille/simulate") as ws2:
            _ = ws2.receive_json()  # hello
            _ = ws2.receive_json()  # initial cells

            # ws1 sends a write frame
            ws1.send_json({"type": "write", "cells": [5, 10, 15]})

            # ws2 should receive the broadcasted write
            msg = ws2.receive_json()
            assert msg["type"] == "write"
            assert msg["cells"][:3] == [5, 10, 15]

            # ws2 sends a routing key
            ws2.send_json({"type": "key", "kind": "route", "index": 7})
            key_msg = ws1.receive_json()
            assert key_msg == {"type": "key", "kind": "route", "index": 7}

            # ws2 sends a pan key
            ws2.send_json({"type": "key", "kind": "pan", "dir": "right"})
            pan_msg = ws1.receive_json()
            assert pan_msg == {"type": "key", "kind": "pan", "dir": "right"}

            # ws2 sends a perkins chord
            ws2.send_json({"type": "key", "kind": "dots", "dots": 27})
            dots_msg = ws1.receive_json()
            assert dots_msg == {"type": "key", "kind": "dots", "dots": 27}


def test_simulate_state_endpoint(client):
    r = client.get("/braille/simulate/state")
    assert r.status_code == 200
    data = r.json()
    assert "cells" in data
    assert len(data["cells"]) == 40
    assert data["model"] == "Virtual 40-Cell Display"
