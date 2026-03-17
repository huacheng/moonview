#!/usr/bin/env python3
"""Rebuild .relations.jsonl from changelog and markdown cross-references (stdlib only, Python >= 3.9)."""
import os
import re
import sys
import json
import fcntl
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / 'core'))
from frontmatter import parse_frontmatter

def rebuild_relations():
    lib_path = Path(os.getenv('NB_WORKSPACES_LIBRARY', os.getenv('NB_WORKSPACES_ROOT', '.') + '/.library'))
    changelog_path = lib_path / '.changelog'
    relations_path = lib_path / '.relations.jsonl'

    if not lib_path.exists(): return

    relations = []

    # 1. Parse Changelog
    # D1: Changelog format per write-protocol.md:
    # <ISO8601Z> | <type> | <subpath> | <tags>
    # Tags may contain: caller:<sub-command> notebook:<name> topic:<topic> quality_status:<status>
    if changelog_path.exists():
        with open(changelog_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                parts = [p.strip() for p in line.split('|')]
                if len(parts) >= 4:
                    source_file = parts[2]
                    detail = parts[3]
                    # D1: Match notebook:<name> tag (per changelog format spec)
                    nb_match = re.search(r'notebook:([a-zA-Z0-9_-]+)', detail)
                    if nb_match:
                        relations.append({"s": source_file, "p": "used-by", "o": f"notebook:{nb_match.group(1)}", "w": 5})
                    # Also match legacy source: tag if present
                    src_match = re.search(r'source:(task-[a-zA-Z0-9_-]+)', detail)
                    if src_match and not nb_match:
                        relations.append({"s": source_file, "p": "used-by", "o": f"notebook:{src_match.group(1)}", "w": 5})

    # 2. Parse Markdown for links (using robust parser)
    memory_path = lib_path / '.memory'
    if memory_path.exists():
        for p in memory_path.rglob('*.md'):
            if p.name.startswith('.'): continue
            try:
                fm = parse_frontmatter(p.read_text(encoding='utf-8', errors='ignore'))
                rel_path = str(p.relative_to(lib_path))

                # 2a. Extract notebook from frontmatter (experience files)
                # New format: sources: [{notebook: <name>, ...}, ...]
                # Old format: notebook: <name> (top-level field)
                nb_names_found = set()

                # 2a-i. New format: sources[] list
                sources = fm.get('sources', [])
                if isinstance(sources, list):
                    for src in sources:
                        nb_name = None
                        if isinstance(src, dict):
                            nb_name = src.get('notebook')
                        elif isinstance(src, str):
                            # Handle simplified parser output: "notebook: xxx"
                            nb_match = re.match(r'notebook:\s*(.+)', src)
                            if nb_match:
                                nb_name = nb_match.group(1).strip()
                        if nb_name:
                            nb_names_found.add(nb_name)

                # 2a-ii. Old format: top-level notebook field (or source_notebook alias)
                for nb_field in ('notebook', 'source_notebook'):
                    top_level_nb = fm.get(nb_field)
                    if top_level_nb and isinstance(top_level_nb, str):
                        nb_names_found.add(top_level_nb)

                # Add relations for all found notebooks (deduplicated)
                for nb_name in nb_names_found:
                    relations.append({"s": rel_path, "p": "used-by", "o": f"notebook:{nb_name}", "w": 5})

                # 2b. Extract related_references (cross-reference links)
                related = fm.get('related_references', [])
                if isinstance(related, str):
                    related = [t.strip() for t in related.replace('[', '').replace(']', '').split(',')]

                for t in related:
                    if t:
                        relations.append({"s": rel_path, "p": "related-to", "o": t, "w": 1})
            except (OSError, UnicodeDecodeError, ValueError) as e:
                print(f"[WARN] Skipping {p}: {e}", file=sys.stderr)

    # D3: Atomic write via tmp + rename, with exclusive lock to prevent
    # data loss from concurrent append-relations.py O_APPEND writes.
    lock_path = relations_path.parent / '.relations.lock'
    lock_fd = open(lock_path, 'w')
    try:
        fcntl.flock(lock_fd, fcntl.LOCK_EX)
        tmp_path = relations_path.parent / '.relations.jsonl.tmp'
        with open(tmp_path, 'w', encoding='utf-8') as f:
            for rel in relations:
                f.write(json.dumps(rel) + '\n')
        tmp_path.rename(relations_path)
        print(f"Generated {len(relations)} relations.")
    finally:
        fcntl.flock(lock_fd, fcntl.LOCK_UN)
        lock_fd.close()
        try:
            lock_path.unlink()
        except OSError:
            pass

if __name__ == "__main__":
    rebuild_relations()
