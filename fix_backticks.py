"""Find and fix broken template literal patterns in TSX files."""
import re, os

base = r"C:\Users\Dio Pramdia\warehouse-system\src"

def find_all_issues():
    """Find ALL template literal issues in the app directory."""
    issues = []
    for dirpath, dirnames, filenames in os.walk(base + "/app"):
        for fname in filenames:
            if not fname.endswith('.tsx'):
                continue
            fpath = os.path.join(dirpath, fname)
            rel = fpath.replace(base, '').replace('\\', '/')
            with open(fpath, 'rb') as f:
                data = f.read()
            
            # Check for odd backtick count per line
            lines = data.split(b'\n')
            for i, line in enumerate(lines):
                bt = line.count(b'`')
                if bt % 2 == 1:  # odd backticks = missing close
                    issues.append((rel, i+1, 'odd_backticks', bt, line.decode('utf-8', errors='replace')[:200]))
    
    return issues

def fix_file_byte_level(fpath, issues):
    """Fix issues in a file using byte-level operations."""
    with open(fpath, 'rb') as f:
        data = f.read()
    
    original = data
    lines = data.split(b'\n')
    
    for rel, lineno, issue_type, bt_count, snippet in issues:
        if not fpath.endswith(rel.lstrip('/')):
            continue
        
        idx = lineno - 1
        if idx >= len(lines):
            continue
        
        line = lines[idx]
        
        if issue_type == 'odd_backticks':
            # Pattern 1: aria-label={`text}` -> aria-label={`text`}
            # Pattern 2: className={`...${var}` -> className={`...${var}`}
            # Pattern 3: label={`...${var}` -> label={`...${var}`}
            # Fix: add closing backtick before ` at end of JSX attribute
            
            # Check if it's the pattern: attr={`...${expr}` (missing closing `)
            # The line should end with ` followed by " or >
            # Pattern: ...${expr}` followed by " OR >
            # Missing: the ` before the " or >
            
            # Simple heuristic: if line ends with `}" or `}> or `}` (bare)
            # We need to add a closing `
            
            stripped = line.rstrip()
            if stripped.endswith(b'`}"') or stripped.endswith(b'`}>') or stripped.endswith(b'`}`):
                # Check if there's a matching opening backtick
                # Find the last opening backtick before the end
                last_open = line.rfind(b'`')
                if last_open >= 0:
                    before_last = line[:last_open]
                    bt_before = before_last.count(b'`')
                    if bt_before % 2 == 0:  # even = we need one more to close
                        # The missing backtick is right before the existing `
                        # Fix: add ` before the last `
                        new_line = before_last + b'`' + line[last_open:]
                        if new_line != line:
                            lines[idx] = new_line
                            print(f"  FIXED {rel}:{lineno} - added missing backtick")
                            continue
            
            # If that didn't work, try: line has odd backticks
            # Add a backtick at the position where it's missing
            # Strategy: find the last expression ${...} without a closing `
            # and add the closing `
            
            # Look for ${ that doesn't close
            # Count backticks - if odd, we need to add one at the end
            if line.count(b'`') % 2 == 1:
                # Add closing backtick
                stripped = line.rstrip(b'\r')
                lines[idx] = stripped + b'`'
                print(f"  FIXED {rel}:{lineno} - added trailing backtick")
    
    new_data = b'\n'.join(lines)
    if new_data != original:
        with open(fpath, 'wb') as f:
            f.write(new_data)
        return True
    return False

# Run
issues = find_all_issues()
print(f"Found {len(issues)} lines with odd backtick counts:")
for rel, lineno, issue_type, bt, snippet in issues:
    print(f"  {rel}:{lineno} bt={bt}: {snippet[:100]}")

print("\nApplying fixes...")
fixed = 0
seen = set()
for rel, lineno, issue_type, bt, snippet in issues:
    key = (rel, lineno)
    if key in seen:
        continue
    seen.add(key)
    fpath = base + "/app/" + rel
    if fix_file_byte_level(fpath, [(rel, lineno, issue_type, bt, snippet)]):
        fixed += 1

print(f"\nFixed {fixed} files")
