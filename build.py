#!/usr/bin/env python3
"""Assemble src/ into index.html (standalone page) and artifact.html (body-only, for claude.ai publishing)."""
import pathlib
root = pathlib.Path(__file__).parent
src = root / "src"
content = "\n".join(p.read_text() for p in sorted((src / "content").glob("*.html")))
css = (src / "style.css").read_text()
js = (src / "app.js").read_text() + "\n" + (src / "living.js").read_text()
FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
         '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Caveat:wght@500;700&family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900'
         '&family=IBM+Plex+Mono:wght@400;500&family=Source+Serif+4:ital,opsz,wght@0,8..60,400..700;1,8..60,400..700&display=swap">')
head = f'<title>AI Encounters</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n<meta name="description" content="An interactive edition of AI Encounters by Justin R. Cary: five acts, twelve encounters, twelve tools, and a living collection of student AI encounters.">\n{FONTS}\n<style>\n{css}\n</style>\n'
body = f"{content}\n<script>\n{js}\n</script>\n"
(root / "artifact.html").write_text(head + body)
(root / "index.html").write_text(
    '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
    '<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>\n'
    + head + '</head>\n<body>\n' + body + '</body>\n</html>\n')
print("built", len((root / "index.html").read_text()) // 1024, "KB")
