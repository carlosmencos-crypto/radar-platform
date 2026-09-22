"""Synthetic transport checks: no actual nominal source or network connection."""
import gzip
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("nominal_import", Path(__file__).resolve().parents[1] / "scripts/import-national-nominal-register.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class Transport(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.directory = Path(self.temporary.name)
        (self.directory / "batches").mkdir()
        payload = b'[{"synthetic":true}]'
        batches = []
        for number in (1, 2, 3):
            (self.directory / "batches" / f"{number:04d}.json.gz").write_bytes(gzip.compress(payload))
            batches.append({"batch_number": number, "expected_rows": 1, "payload_sha256": hashlib.sha256(payload).hexdigest()})
        (self.directory / "batch-manifest.json").write_text(json.dumps({"batches": batches}))
        (self.directory / "import-token").write_text("synthetic-test-token")
        self.receipts = self.directory / "upload-receipts.jsonl"

    def tearDown(self):
        self.temporary.cleanup()

    def run_upload(self):
        module.upload(self.directory, "synthetic-source", "https://example.invalid", 0, 1, 3)

    def test_group_acknowledgement_and_resume(self):
        def respond(request, **_):
            self.assertEqual(request.headers["Content-encoding"], "gzip")
            body = json.loads(gzip.decompress(request.data))
            self.assertEqual(body["source_id"], "synthetic-source")
            self.assertEqual([b["batch_number"] for b in body["batches"]], [1, 2, 3])
            return io.BytesIO(json.dumps({"receipts": [{"batch": n, "rows": 1} for n in (1, 2, 3)]}).encode())
        with patch.object(module.urllib.request, "urlopen", side_effect=respond) as network:
            self.run_upload()
            self.run_upload()
            self.assertEqual(network.call_count, 1)
        self.assertEqual(len(self.receipts.read_text().splitlines()), 3)

    def test_incomplete_group_never_marks_local_completion(self):
        response = io.BytesIO(b'{"receipts":[{"batch":1,"rows":1}]}')
        with patch.object(module.urllib.request, "urlopen", return_value=response):
            with self.assertRaisesRegex(ValueError, "Server count mismatch"):
                self.run_upload()
        self.assertFalse(self.receipts.exists())

    def test_changed_local_batch_never_reaches_network(self):
        (self.directory / "batches/0002.json.gz").write_bytes(gzip.compress(b'[]'))
        with patch.object(module.urllib.request, "urlopen") as network:
            with self.assertRaisesRegex(ValueError, "Local payload changed"):
                self.run_upload()
            network.assert_not_called()
        self.assertFalse(self.receipts.exists())

    def test_network_retry_still_writes_each_receipt_once(self):
        response = io.BytesIO(b'{"receipts":[{"batch":1,"rows":1},{"batch":2,"rows":1},{"batch":3,"rows":1}]}')
        with patch.object(module.urllib.request, "urlopen", side_effect=[TimeoutError(), response]), patch.object(module.time, "sleep"):
            self.run_upload()
        self.assertEqual(len(self.receipts.read_text().splitlines()), 3)


if __name__ == "__main__":
    unittest.main()
