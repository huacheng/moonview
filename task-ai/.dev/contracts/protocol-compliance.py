#!/usr/bin/env python3
"""L3: Verify SKILL.md '§' references point to existing sections in protocol files"""
import re
import sys
sys.path.insert(0, str(__import__('pathlib').Path(__file__).resolve().parent))
from lib import (
    find_skills, find_references, strip_code_blocks,
    emit_pass, emit_fail, emit_warn, summary,
    TASK_AI_ROOT
)

# Build a map of protocol file headings
protocol_files = {}
protocol_headings: dict[str, set[str]] = {}  # filename -> set of heading texts

# Check commands/references/ for protocol files
refs_dir = TASK_AI_ROOT / 'commands' / 'references'
if refs_dir.exists():
    for ref_file in refs_dir.glob('*.md'):
        content = ref_file.read_text()
        headings: set[str] = set()
        for line in content.split('\n'):
            m = re.match(r'^(#{1,6})\s+(.+)$', line)
            if m:
                heading_text = m.group(2).strip()
                headings.add(heading_text)
                # Also add without trailing punctuation
                headings.add(heading_text.rstrip('.,:;'))
        protocol_files[ref_file.name] = ref_file
        protocol_headings[ref_file.name] = headings

# Scan all SKILL.md files for § references
# Patterns: "See protocol § Section Name", "§ Section Name", "See `file` § Section"
section_ref_pattern = re.compile(r'§\s*([^§\n\|`]+?)(?:\s*[`|\n]|$)')
see_protocol_pattern = re.compile(r'[Ss]ee\s+(?:protocol\s+)?§\s*([^§\n\|`]+?)(?:\s*[`|\n]|$)')
see_file_pattern = re.compile(r'[Ss]ee\s+`([^`]+)`\s+§\s*([^§\n\|`]+?)(?:\s*[`|\n]|$)')

found_refs = 0

for skill_file in find_skills():
    skill_name = skill_file.parent.name
    content = strip_code_blocks(skill_file.read_text())

    for line in content.split('\n'):
        # Pattern 1: See `file` § Section
        for m in see_file_pattern.finditer(line):
            ref_file = m.group(1).strip()
            section = m.group(2).strip()
            found_refs += 1

            if ref_file in protocol_headings:
                if section in protocol_headings[ref_file]:
                    emit_pass(f'{skill_name}: § ref "{section}" found in {ref_file}')
                else:
                    emit_fail(f'{skill_name}: § ref "{section}" NOT found in {ref_file}')
            else:
                emit_fail(f'{skill_name}: protocol file "{ref_file}" not found')

        # Pattern 2: See protocol § Section (no specific file)
        for m in see_protocol_pattern.finditer(line):
            if see_file_pattern.search(line):
                continue  # Already handled
            section = m.group(1).strip()
            found_refs += 1

            # Search all protocol files for this section
            found_in_any = False
            for fname, headings in protocol_headings.items():
                if section in headings:
                    found_in_any = True
                    break

            if found_in_any:
                emit_pass(f'{skill_name}: § ref "{section}" found in protocols')
            else:
                emit_fail(f'{skill_name}: § ref "{section}" NOT found in any protocol')

if found_refs == 0:
    emit_warn('protocol-compliance: no § references found (protocol not yet integrated)')
else:
    emit_pass(f'protocol-compliance: checked {found_refs} § references')

sys.exit(summary())
