# Annotation Format (for `annotate` sub-command)

`.tmp-annotations.json` contains four `string[][]` arrays:

```json
{
  "Insert Annotations": [["Line{N}:...before20", "content", "after20..."]],
  "Delete Annotations": [["Line{N}:...before20", "selected", "after20..."]],
  "Replace Annotations": [["Line{N}:...before20", "selected", "replacement", "after20..."]],
  "Comment Annotations": [["Line{N}:...before20", "selected", "comment", "after20..."]]
}
```

| Type | Elements | Structure |
|------|----------|-----------|
| Insert | 3 | [context_before, content, context_after] |
| Delete | 3 | [context_before, selected_text, context_after] |
| Replace | 4 | [context_before, selected_text, replacement, context_after] |
| Comment | 4 | [context_before, selected_text, comment, context_after] |

Context: `context_before` = `"Line{N}:...{≤20 chars}"`, newlines as `↵`. `context_after` = `"{≤20 chars}..."`.
