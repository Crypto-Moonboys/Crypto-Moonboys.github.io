#!/usr/bin/env python3
"""Verify preserved W81 bytes against two independent repository inventories."""
import argparse
import csv
import hashlib
import io
import json
from pathlib import Path
import re
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]
LEDGER = ROOT / 'brand-canon/wiki-rewrites/w81-archive-retirement-20261004.md'
REGISTER = ROOT / 'brand-canon/wiki-rewrites/raw-canon-20261008-source-register.csv'


def verify(raw, rows, ledger):
    expected_hash = re.search(r'Archive SHA-256: `([a-f0-9]{64})`', ledger).group(1)
    if hashlib.sha256(raw).hexdigest() != expected_hash:
        raise ValueError('Archive SHA-256 differs from immutable ledger')
    inventory = {name: (int(size), digest) for name, size, digest in re.findall(
        r'\| ([A-Za-z0-9]+\.txt) \| (\d+) \| `([a-f0-9]{64})` \|', ledger)}
    register = {row['source_file']: (int(row['source_bytes']), row['sha256']) for row in rows}
    if len(rows) != 94 or len(register) != 94 or len(inventory) != 94 or register != inventory:
        raise ValueError('CSV and immutable 94-entry ledger do not agree')
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        entries = [info for info in archive.infolist() if info.filename.lower().endswith('.txt')]
        if len(entries) != 94 or len({Path(info.filename).name for info in entries}) != 94:
            raise ValueError('Archive must contain exactly 94 distinct text filenames')
        files = {Path(info.filename).name: archive.read(info) for info in entries}
    actual = {name: (len(data), hashlib.sha256(data).hexdigest()) for name, data in files.items()}
    if actual != inventory:
        raise ValueError('Archive entry sizes/names/checksums do not match preserved ledger')
    return files


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', type=Path, help='Optional local original ZIP; defaults to immutable Git object')
    parser.add_argument('--output-dir', type=Path, help='Optional non-public extraction directory')
    args = parser.parse_args()
    ledger = LEDGER.read_text()
    commit = re.search(r'exact pre-retirement commit `([a-f0-9]{40})`', ledger).group(1)
    raw = args.archive.read_bytes() if args.archive else subprocess.check_output(
        ['git', 'show', f'{commit}:about/w81.zip'], cwd=ROOT)
    files = verify(raw, list(csv.DictReader(REGISTER.open())), ledger)
    if args.output_dir:
        output = args.output_dir.resolve()
        if output == ROOT or ROOT in output.parents:
            raise ValueError('Extract original sources outside the publication repository')
        output.mkdir(parents=True, exist_ok=True)
        for name, data in files.items():
            target = output / name
            if target.is_symlink():
                raise ValueError(f'Refusing symlink extraction: {name}')
            target.write_bytes(data)
    print(json.dumps({'archive_sha256': hashlib.sha256(raw).hexdigest(),
                      'historical_commit': commit, 'files_verified': len(files),
                      'unique_contents': len({hashlib.sha256(v).hexdigest() for v in files.values()}),
                      'uncompressed_bytes': sum(map(len, files.values())),
                      'semantic_reconciliation': 'not implied by byte verification'}, indent=2))


if __name__ == '__main__':
    main()
