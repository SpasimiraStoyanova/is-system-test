import re

with open('admin.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Extract the main style block
style_pattern = re.compile(r'<style>(.*?)</style>', re.DOTALL)
styles = style_pattern.findall(content)
main_style = styles[0].strip() if styles else ''

# Extract the pdf.js config script
pdf_script_pattern = re.compile(r"<script>pdfjsLib\.GlobalWorkerOptions\.workerSrc\s*=\s*'https://cdnjs\.cloudflare\.com/ajax/libs/pdf\.js/2\.16\.105/pdf\.worker\.min\.js';</script>")
pdf_script_match = pdf_script_pattern.search(content)

# Extract the main script block at the end
main_script_pattern = re.compile(r'<script>\s*const ADMIN_PIN(.*?)<\/script>', re.DOTALL)
main_script_match = main_script_pattern.search(content)
main_script_content = ''
if main_script_match:
    main_script_content = 'const ADMIN_PIN' + main_script_match.group(1).strip()

# Create admin.css
with open('admin.css', 'w', encoding='utf-8') as f:
    f.write(main_style)

# Create admin.js
with open('admin.js', 'w', encoding='utf-8') as f:
    f.write("pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';\n\n")
    f.write(main_script_content)

# Replace in admin.html
new_html = style_pattern.sub('\n    <link rel="stylesheet" href="admin.css">\n', content, count=1)
if pdf_script_match:
    new_html = new_html.replace(pdf_script_match.group(0), '')
if main_script_match:
    new_html = new_html.replace(main_script_match.group(0), '<script src="admin.js" defer></script>')

# Remove any empty lines that might have been left
new_html = re.sub(r'\n\s*\n', '\n', new_html)

with open('admin.html', 'w', encoding='utf-8') as f:
    f.write(new_html)
