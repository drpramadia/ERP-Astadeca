"""Fix broken template literals in warehouse-system TSX files.

Pattern: template literal that doesn't close properly.
Fix: insert missing closing backtick.
"""
import re, os

base = r"C:\Users\Dio Pramdia\warehouse-system\src"

def find_broken_backticks(content: str) -> list[tuple[int, str, str]]:
    """Find template literals missing closing backtick.
    
    Strategy: scan line by line.
    - Track whether we're inside a template literal (backtick depth)
    - When we see ${ we enter expression mode
    - When we see } while in expression mode, exit expression
    - When we see a bare ` outside expression, it closes the template
    - If we reach end of line and still in template + expression, that's the bug
    """
    issues = []
    lines = content.split('\n')
    
    for lineno, line in enumerate(lines, 1):
        # Check for specific known patterns that indicate broken templates:
        
        # Pattern 1: aria-label={`...} - missing closing backtick
        # at end of JSX attribute value
        m = re.search(r'=\{`([^`]*)}$', line)
        if m and not line.rstrip().endswith('}`'):
            # Likely missing closing backtick
            inner = m.group(1)
            # The line ends with `} (backtick + close brace)
            # Should end with `}`
            issues.append((lineno, f"aria-label template literal: {line[m.start():m.start()+60]}", "missing closing ` after }"))
            continue
        
        # Pattern 2: `...} (template literal ending in closing brace, no backtick)
        # This looks like `${expr}` but missing the closing `
        m = re.search(r'`\}\s*$', line)
        if m:
            # Check if there's actually a template literal opening this
            issues.append((lineno, line.strip()[:80], "template ending in `} but no closing `"))
            continue
        
        # Pattern 3: inside expression but line ends with no closing
        # Look for `${` without matching closing
        # Simple: count backticks in the line
        # If odd number of backticks, check for incomplete expressions
        
        # More specific: look for expressions that start but don't end
        # e.g., className={`...${var}
        # The `} at end without a closing ` means missing backtick
        
        # Pattern: string that ends with ${something} and then }
        # and the template is an attribute value
        m = re.search(r'=\{`[^`]*\$\{[^}]+\}\s*$', line)
        if m:
            # This is `attr={`expr}` — missing closing backtick
            snippet = line[m.start():m.start()+80]
            issues.append((lineno, snippet, "JSX attr template literal missing closing `"))
    
    return issues


def fix_file(filepath: str) -> int:
    """Fix broken template literals in a single file. Returns count of fixes."""
    with open(filepath, encoding='utf-8', errors='replace') as f:
        content = f.read()
    
    original = content
    lines = content.split('\n')
    fixes = 0
    
    for lineno, line in enumerate(lines, 1):
        # Pattern: aria-label={`Komentar untuk ${request.title}}
        # Missing closing backtick after the final }}
        if re.search(r'=\{\`[^{]*\$\{[^}]+\}\}\s*$', line):
            # Find the pattern and fix it
            # Replace `} at end with `}`
            new_line = re.sub(r'(\$\{[^}]+\})\}\s*$', r'\1}`', line)
            if new_line != line:
                lines[lineno - 1] = new_line
                fixes += 1
                print(f"  FIX L{lineno}: {line.strip()[:60]} -> {new_line.strip()[:60]}")
        
        # Pattern: className={`...${var}}  - extra } before closing `
        # where we should have className={`...${var}`}
        # Fix: ${var}} -> ${var}`
        m = re.search(r'(\$\{[^}]+)\}\s*\}', line)
        if m:
            # Check if it's in a template context
            before = line[:m.start()]
            backticks_before = before.count('`')
            if backticks_before % 2 == 1:  # inside a template
                new_line = line[:m.end()-2] + '}' + line[m.end()-1:]
                # Actually let me be more precise
                # We have ${var}} and need ${var}`
                # The m.group(1) is ${var}, the match includes one }
                # We need to add a backtick after
                pass
        
        # Pattern: ${colorClass}} -> ${colorClass}`
        if re.search(r'\$\{[^}]+\}\}\s*\}', line):
            new_line = re.sub(r'(\$\{[^}]+\})\}\s*\}', r'\1}`', line)
            if new_line != line and '`}`' not in new_line:  # avoid double-backtick
                lines[lineno - 1] = new_line
                fixes += 1
                print(f"  FIX L{lineno}: {line.strip()[:60]} -> {new_line.strip()[:60]}")
        
        # Pattern: ${something}}  (within a template, missing closing `)
        # When a line has `${` but no closing ` before the end
        # and ends with }
        if re.search(r'\$\{[^}]+\}\}\s*(?:>[^<]*)?$', line):
            # Remove the extra }
            new_line = re.sub(r'(\$\{[^}]+)\}\s*(>[^<]*)?$', r'\1}`\2', line)
            if new_line != line:
                lines[lineno - 1] = new_line
                fixes += 1
    
    if fixes > 0:
        new_content = '\n'.join(lines)
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
    
    return fixes


def scan_all():
    """Scan all TSX files and report issues."""
    all_issues = {}
    
    for dirpath, dirnames, filenames in os.walk(base):
        if 'node_modules' in dirpath:
            continue
        for fname in filenames:
            if not fname.endswith('.tsx'):
                continue
            fpath = os.path.join(dirpath, fname)
            rel = fpath.replace(base, 'src').replace('\\', '/')
            with open(fpath, encoding='utf-8', errors='replace') as f:
                content = f.read()
            
            issues = find_broken_backticks(content)
            if issues:
                all_issues[rel] = issues
    
    return all_issues


if __name__ == '__main__':
    print("Scanning for broken template literals...")
    issues = scan_all()
    print(f"\nFound issues in {len(issues)} files:")
    for f, iss in sorted(issues.items()):
        print(f"\n{f}:")
        for lineno, snippet, desc in iss:
            print(f"  L{lineno}: {desc}")
            print(f"    {snippet}")
    
    print("\n\nFixing files...")
    total = 0
    for dirpath, dirnames, filenames in os.walk(base):
        if 'node_modules' in dirpath:
            continue
        for fname in filenames:
            if not fname.endswith('.tsx'):
                continue
            fpath = os.path.join(dirpath, fname)
            rel = fpath.replace(base, 'src').replace('\\', '/')
            n = fix_file(fpath)
            if n:
                total += n
                print(f"Fixed {rel}: {n} fix(es)")
    
    print(f"\nTotal fixes: {total}")
