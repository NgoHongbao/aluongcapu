"""Generate the completely standalone demo HTML from production assets."""
from pathlib import Path
from urllib.parse import quote
ROOT = Path(__file__).resolve().parent
html = (ROOT/'site'/'index.html').read_text(encoding='utf-8')
css = (ROOT/'site'/'assets'/'style.css').read_text(encoding='utf-8')
css += (ROOT/'site'/'assets'/'couple.css').read_text(encoding='utf-8')
html = html.replace('<link rel="stylesheet" href="/assets/couple.css?v=music-volume" />', '')
js = (ROOT/'site'/'assets'/'app.js').read_text(encoding='utf-8')
favicon = (ROOT/'site'/'assets'/'favicon.svg').read_text(encoding='utf-8')
html = html.replace('<link rel="icon" type="image/svg+xml" href="/assets/favicon.svg" />',
                    '<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,' + quote(favicon) + '" />')
html = html.replace('<link rel="stylesheet" href="/assets/style.css" />',
                    '<style>\n' + css + '\n</style>')
html = html.replace('<script defer src="/assets/couple.js"></script>', '')
# Inline scripts in <head> cannot use "defer". Move this script to the end of body.
html = html.replace('<script defer src="/assets/app.js?v=google-login"></script>', '')
html = html.replace('</body>', '<script>\n' + js + '\n</script>\n</body>')
output = ROOT/'A_Luong_CaPu_Xem_Truoc.html'
output.write_text(html, encoding='utf-8')
print('Created', output, '(',len(html.encode('utf-8')),'bytes )')
