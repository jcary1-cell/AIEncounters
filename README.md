# AI Encounters: interactive edition

The source is in `src/`. Edit the files there, then rebuild:

```bash
python3 build.py
```

That writes two files:

- `index.html` is a complete standalone page. Open it in any browser, or host it anywhere static (GitHub Pages, Netlify, a campus server).
- `artifact.html` is the same page, formatted for publishing as a claude.ai artifact.

## Layout

- `src/content/*.html` holds the book text, in book order (front matter, Acts I–V, back matter, Living Collection). The text matches the PDF word for word.
- `src/style.css` holds the design tokens and every component style.
- `src/app.js` runs the reading features and all twelve signature tools.
- `src/living.js` runs the Living Collection (form, story wall, loom).

## Where data lives

- Signature tools, reflections, and "I tried this" checkmarks save in each reader's own browser. "My toolkit" copies them out or saves them as a file.
- **Living Collection stories** go to a shared store when the page is published as a claude.ai artifact with the `db` capability. Anywhere else, they stay in the visitor's browser only, and the page shows a local preview where you play both student and moderator.

## Review queue

Nothing a student sends goes public until a moderator approves it. Moderators are the artifact's owner plus anyone given Editor access.

| Path | Holds | Who reads | Who writes |
|---|---|---|---|
| `stories/<id>` | approved stories | everyone | moderators |
| `submissions/<uid>` | one student's submissions and their status | that student + moderators | that student + moderators |
| `res/<uid>` | that reader's "me too"s | everyone | that reader |
| `flags/<uid>` | that reader's flags | moderators | that reader |

Publish with these capabilities:

```json
{
  "db": { "rules": [
    { "path": "stories", "read": "view", "write": "admin" },
    { "path": "submissions", "read": "admin", "write": "admin" },
    { "path": "submissions/{self}", "read": "interact", "write": "interact" },
    { "path": "res", "read": "view", "write": "owner" },
    { "path": "res/{self}", "write": "interact" },
    { "path": "flags", "read": "admin", "write": "admin" },
    { "path": "flags/{self}", "read": "interact", "write": "interact" }
  ] },
  "user": {}, "tts": {}, "dictation": {}, "downloads": true
}
```

## Live artifact and GitHub

- Live collection (claude.ai artifact): https://claude.ai/artifact/4Jk5MwZ5TFNxPvi36DdVW9. Republish `artifact.html` after each rebuild.
- GitHub Pages: publish `index.html`. Off claude.ai, the site can't reach the artifact's database. The Living Collection there shows the book's twelve threads and sends students to the live artifact to submit. The link is `LIVE_URL` in `src/living.js`.
- On `localhost`, the collection runs as a local preview with the moderator view. Add `?bridge` to the URL to preview the GitHub behavior.
