import re

path = r'c:\Users\tusha\OneDrive\Desktop\affilation video gen\prod ext\api_inspector\enrich_products.py'
content = open(path, encoding='utf-8').read()

# Replace the problematic JS regex test with a simple character check
# This avoids Python treating the regex metacharacters as escape sequences
content = re.sub(
    r'if \([^)]*\.test\(t\)\)',
    'if (t.length === 3 && t.charAt(1) === ".")',
    content
)

open(path, 'w', encoding='utf-8').write(content)
print('Done - regex fixed')
