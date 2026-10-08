"""Exercise the two-ledger verifier with corruption at each trust boundary."""
import csv
import importlib.util
from pathlib import Path
import subprocess
import unittest

spec = importlib.util.spec_from_file_location('w81_verifier', Path(__file__).with_name('verify-w81-archive.py'))
verifier = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verifier)


class SourceVerificationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.raw = subprocess.check_output(['git', 'show', '44f180a6da267c6bc476c6ca6b777dd297ee1e65:about/w81.zip'], cwd=verifier.ROOT)
        cls.ledger = verifier.LEDGER.read_text()
        with verifier.REGISTER.open() as handle:
            cls.rows = list(csv.DictReader(handle))

    def test_all_original_files(self):
        files = verifier.verify(self.raw, self.rows, self.ledger)
        self.assertEqual(len(files), 94)
        self.assertEqual(sum(map(len, files.values())), 2334149)
        self.assertEqual(files['w51.txt'], files['w52.txt'])

    def test_corrupt_archive_rejected(self):
        with self.assertRaisesRegex(ValueError, 'Archive SHA-256'):
            verifier.verify(self.raw[:-1] + bytes([self.raw[-1] ^ 1]), self.rows, self.ledger)

    def test_false_csv_checksum_rejected_by_independent_ledger(self):
        rows = [dict(row) for row in self.rows]
        rows[0]['sha256'] = '0' * 64
        with self.assertRaisesRegex(ValueError, 'do not agree'):
            verifier.verify(self.raw, rows, self.ledger)

    def test_duplicate_or_missing_source_rejected(self):
        rows = [dict(row) for row in self.rows]
        rows[-1] = dict(rows[0])
        with self.assertRaisesRegex(ValueError, 'do not agree'):
            verifier.verify(self.raw, rows, self.ledger)


if __name__ == '__main__':
    unittest.main()
