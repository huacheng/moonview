#!/usr/bin/env python3
import os
import re
import json
from pathlib import Path
from datetime import datetime

def parse_frontmatter(content):
    """Simple parser for YAML-like frontmatter."""
    fm = {}
    match = re.search(r'^---\s*\n(.*?)\n---\s*\n', content, re.DOTALL)
    if match:
        for line in match.group(1).split('\n'):
            if ':' in line:
                parts = line.split(':', 1)
                if len(parts) == 2:
                    k, v = parts
                    fm[k.strip()] = v.strip()
    return fm

def rebuild_index():
    lib_path = Path(os.getenv('NB_WORKSPACES_LIBRARY', os.getenv('NB_WORKSPACES_ROOT', '.') + '/.library'))
    memory_path = lib_path / '.memory'
    master_index_path = lib_path / '.master-index.md'
    
    if not lib_path.exists():
        print(f"Error: Library path {lib_path} does not exist.")
        return

    print(f"Scanning Library at: {lib_path}")
    
    master_rows = []
    
    # Categories to scan
    categories = {
        '.references': 'Reference',
        '.experiences': 'Experience',
        '.type-profiles': 'Type-Profile',
        '.thinking/patterns': 'Pattern'
    }

    for sub_dir_name, cat_type in categories.items():
        dir_path = memory_path / sub_dir_name
        if not dir_path.exists():
            continue
            
        dir_rows = []
        for p in dir_path.rglob('*.md'):
            if p.name.startswith('.'): continue
            
            try:
                content = p.read_text(encoding='utf-8')
                fm = parse_frontmatter(content)
                
                topic = fm.get('topic') or fm.get('title') or p.stem
                type_field = fm.get('type', 'generic')
                keywords = fm.get('keywords', '')
                rel_path = p.relative_to(lib_path)
                
                master_rows.append(f"| {topic} | {type_field} | {keywords} | {rel_path} | system |")
                
                updated = fm.get('last_verified_at') or datetime.fromtimestamp(p.stat().st_mtime).strftime('%Y-%m-%d')
                dir_rows.append(f"| {topic} | {type_field} | {updated} | {p.name} |")
            except Exception as e:
                print(f"Error processing {p}: {e}")

        if dir_rows:
            index_md = dir_path / '.index.md'
            with open(index_md, 'w', encoding='utf-8') as f:
                f.write(f"# {cat_type} Index\n\n")
                f.write("| Topic | Type | Updated | File |\n")
                f.write("|-------|------|---------|------|\n")
                f.write('\n'.join(sorted(dir_rows)) + '\n')
            print(f"Updated {index_md}")

    if master_rows:
        with open(master_index_path, 'w', encoding='utf-8') as f:
            f.write("# Library Master Index\n\n")
            f.write("| Topic | Type | Keywords | File Path | Source |\n")
            f.write("|-------|------|----------|-----------|--------|\n")
            f.write('\n'.join(sorted(master_rows)) + '\n')
        print(f"Updated {master_index_path}")

if __name__ == "__main__":
    rebuild_index()
