#!/usr/bin/env python3
import os
import json
import re
from pathlib import Path

# 复用鲁棒的解析器
def parse_frontmatter(content):
    fm = {}
    match = re.search(r'^---\s*\n(.*?)\n---\s*\n', content, re.DOTALL | re.MULTILINE)
    if not match: return fm
    lines = match.group(1).split('\n')
    current_key = None
    for line in lines:
        stripped = line.strip()
        if not stripped: continue
        if ':' in line and not stripped.startswith('-'):
            k, v = line.split(':', 1)
            current_key = k.strip()
            val = v.strip().strip('"').strip("'")
            fm[current_key] = val if val else []
        elif stripped.startswith('-') and current_key:
            val = stripped[1:].strip().strip('"').strip("'")
            if isinstance(fm.get(current_key), list):
                fm[current_key].append(val)
    return fm

def rebuild_relations():
    lib_path = Path(os.getenv('NB_WORKSPACES_LIBRARY', os.getenv('NB_WORKSPACES_ROOT', '.') + '/.library'))
    changelog_path = lib_path / '.changelog'
    relations_path = lib_path / '.relations.jsonl'
    
    if not lib_path.exists(): return

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
                        relations.append({"s": source_file, "p": "used-by", "o": f"notebook:{match.group(1)}", "w": 5})

    # 2. Parse Markdown for links (using robust parser)
    memory_path = lib_path / '.memory'
    if memory_path.exists():
        for p in memory_path.rglob('*.md'):
            if p.name.startswith('.') or p.name == '.index.md': continue
            try:
                fm = parse_frontmatter(p.read_text(encoding='utf-8'))
                related = fm.get('related_references', [])
                if isinstance(related, str):
                    related = [t.strip() for t in related.replace('[', '').replace(']', '').split(',')]
                
                for t in related:
                    if t:
                        relations.append({"s": str(p.relative_to(lib_path)), "p": "related-to", "o": t, "w": 1})
            except Exception: pass

    with open(relations_path, 'w', encoding='utf-8') as f:
        for rel in relations:
            f.write(json.dumps(rel) + '\n')
    print(f"Generated {len(relations)} relations.")

if __name__ == "__main__":
    rebuild_relations()
