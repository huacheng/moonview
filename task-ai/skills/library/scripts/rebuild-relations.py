#!/usr/bin/env python3
import os
import json
import re
from pathlib import Path

def rebuild_relations():
    lib_path = Path(os.getenv('NB_WORKSPACES_LIBRARY', os.getenv('NB_WORKSPACES_ROOT', '.') + '/.library'))
    changelog_path = lib_path / '.changelog'
    relations_path = lib_path / '.relations.jsonl'
    
    if not lib_path.exists():
        print(f"Error: Library path {lib_path} does not exist.")
        return

    relations = []

    # 1. Parse Changelog
    if changelog_path.exists():
        with open(changelog_path, 'r', encoding='utf-8') as f:
            for line in f:
                parts = [p.strip() for p in line.split('|')]
                if len(parts) >= 4:
                    source_file = parts[2]
                    detail = parts[3]
                    match = re.search(r'source:(task-[a-zA-Z0-9_-]+)', detail)
                    if match:
                        notebook = match.group(1)
                        relations.append({
                            "s": source_file,
                            "p": "used-by",
                            "o": f"notebook:{notebook}",
                            "w": 5
                        })

    # 2. Parse Markdown Frontmatter
    memory_path = lib_path / '.memory'
    if memory_path.exists():
        for p in memory_path.rglob('*.md'):
            if p.name.startswith('.'): continue
            
            try:
                content = p.read_text(encoding='utf-8', errors='ignore')
                match = re.search(r'related_references:\s*\[(.*?)\]', content)
                if match:
                    targets = [t.strip().strip('"').strip("'") for t in match.group(1).split(',')]
                    for t in targets:
                        relations.append({
                            "s": str(p.relative_to(lib_path)),
                            "p": "related-to",
                            "o": t,
                            "w": 1
                        })
            except Exception as e:
                print(f"Error processing {p}: {e}")

    # Write JSONL
    with open(relations_path, 'w', encoding='utf-8') as f:
        for rel in relations:
            f.write(json.dumps(rel) + '\n')
            
    print(f"Generated {len(relations)} relations in {relations_path}")

if __name__ == "__main__":
    rebuild_relations()
