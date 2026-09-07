#!/usr/bin/env python3
"""Render the README diagrams (docs/diagrams/*.svg) in WikiBrain's celadon palette, light and dark.

Run: python3 scripts/render-diagrams.py
No dependencies. Edit the ROWS / FLOW data below, re-run, commit the SVGs.
"""
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "docs" / "diagrams"
FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"

PALETTES = {
    "light": dict(bg="#F4F7F5", paper="#FFFFFF", ink="#22313A", soft="#5B6B72", faint="#8E9BA1", line="#DCE5E0",
                  celadon="#3E7D6B", mist="#E7F0EC", amber="#B07D2B", amberMist="#F7EFE0", agent="#F6E2D2", agentLine="#C97A4A"),
    "dark": dict(bg="#1B252B", paper="#243239", ink="#E7F0EC", soft="#A9BBB4", faint="#7F918A", line="#3A4B53",
                 celadon="#6FB39B", mist="#27423A", amber="#D9A24E", amberMist="#3E3421", agent="#4A332A", agentLine="#D98A5A"),
}


def esc(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


class Canvas:
    def __init__(self, w: int, h: int, p: dict):
        self.w, self.h, self.p, self.parts = w, h, p, []

    def rect(self, x, y, w, h, fill, stroke, r=10, sw=1.2, dash=None):
        d = f' stroke-dasharray="{dash}"' if dash else ""
        self.parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"{d}/>')

    def text(self, x, y, s, size=13, fill=None, weight=400, anchor="middle", mono=False, spacing=None):
        fill = fill or self.p["ink"]
        fam = MONO if mono else FONT
        ls = f' letter-spacing="{spacing}"' if spacing else ""
        self.parts.append(f'<text x="{x}" y="{y}" font-family="{fam}" font-size="{size}" font-weight="{weight}" fill="{fill}" text-anchor="{anchor}"{ls}>{esc(s)}</text>')

    def box(self, x, y, w, h, head, sub=None, fill=None, stroke=None, head_mono=False, head_size=13.5):
        self.rect(x, y, w, h, fill or self.p["paper"], stroke or self.p["line"])
        cx = x + w / 2
        if sub:
            self.text(cx, y + h / 2 - 3, head, size=head_size, weight=600, mono=head_mono)
            self.text(cx, y + h / 2 + 14, sub, size=11, fill=self.p["soft"])
        else:
            self.text(cx, y + h / 2 + 5, head, size=head_size, weight=600, mono=head_mono)

    def arrow(self, x1, y1, x2, y2, color=None, dash=None, label=None, label_dx=0, label_dy=-6, curve=None):
        color = color or self.p["faint"]
        d = f' stroke-dasharray="{dash}"' if dash else ""
        path = f"M{x1},{y1} L{x2},{y2}" if curve is None else f"M{x1},{y1} Q{curve[0]},{curve[1]} {x2},{y2}"
        self.parts.append(f'<path d="{path}" fill="none" stroke="{color}" stroke-width="1.4"{d} marker-end="url(#arr-{self.p["_name"]})"/>')
        if label:
            mx, my = (x1 + x2) / 2 + label_dx, (y1 + y2) / 2 + label_dy
            self.text(mx, my, label, size=10.5, fill=self.p["soft"])

    def line(self, x1, y1, x2, y2, color=None):
        color = color or self.p["faint"]
        self.parts.append(f'<path d="M{x1},{y1} L{x2},{y2}" fill="none" stroke="{color}" stroke-width="1.4"/>')

    def render(self) -> str:
        p = self.p
        defs = (f'<defs><marker id="arr-{p["_name"]}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
                f'<path d="M0,0 L10,5 L0,10 z" fill="{p["faint"]}"/></marker></defs>')
        return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.w}" height="{self.h}" viewBox="0 0 {self.w} {self.h}" font-family="{FONT}">'
                f'{defs}<rect width="{self.w}" height="{self.h}" rx="14" fill="{p["bg"]}"/>' + "".join(self.parts) + "</svg>")


# ── System architecture ────────────────────────────────────────────────────────
ROWS = [
    ("Clients", [("Browser", "web UI"), ("Cursor · Claude Code", "MCP + token"), ("Claude.ai · ChatGPT", "MCP + OAuth 2.1"), ("Scripts · hooks", "REST + token")], "paper"),
    ("Edge", [("Security headers · rate limits (per IP / token / user) · identity: session / token / OAuth", None)], "amber"),
    ("Application", [("MCP server", "/mcp · six tools"), ("Web API", "/api"), ("OAuth 2.1 server", "dynamic client registration")], "paper"),
    ("Domain", [("Notes", "paths · links · versions · pending"), ("Agent runner", "Ingest / Query / Lint"), ("Import · bibliography · Zotero", "URL · PDF · Word · .bib"), ("Outbound guard", "SSRF filter · pinned DNS")], "mist"),
    ("Storage & external", [("PostgreSQL", "notes · versions · links · assets · encrypted keys"), ("Model providers", "Anthropic · OpenAI · OpenRouter, your key"), ("Crossref · arXiv · PubMed · Zotero", "and the URLs you paste")], "paper"),
]


def architecture(name: str) -> str:
    p = dict(PALETTES[name], _name=name)
    W, H = 960, 560
    c = Canvas(W, H, p)
    c.text(28, 36, "WIKIBRAIN · SYSTEM ARCHITECTURE", size=11, fill=p["faint"], anchor="start", spacing=2)
    c.text(28, 62, "One Node service and one PostgreSQL; every AI client reaches the same wiki through MCP", size=14, fill=p["soft"], anchor="start")
    L, R, G = 150, W - 28, 12
    y = 90
    heights = [58, 40, 58, 58, 58]
    centers = []
    for (label, items, style), h in zip(ROWS, heights):
        c.text(28, y + h / 2 + 4, label, size=11.5, fill=p["faint"], anchor="start", spacing=1)
        n = len(items)
        w = (R - L - G * (n - 1)) / n
        for i, (head, sub) in enumerate(items):
            x = L + i * (w + G)
            fill = p["paper"] if style == "paper" else p["mist"] if style == "mist" else p["amberMist"]
            stroke = p["line"] if style == "paper" else p["celadon"] if style == "mist" else p["amber"]
            if label == "Domain" and head == "Agent runner":
                fill, stroke = p["agent"], p["agentLine"]
            if label == "Edge":
                c.rect(x, y, w, h, fill, stroke)
                c.text(x + w / 2, y + h / 2 + 5, head, size=12.5, fill=p["ink"])
            else:
                c.box(x, y, w, h, head, sub, fill=fill, stroke=stroke)
        centers.append((y, y + h))
        y += h + 30
    mid = (L + R) / 2
    for (a0, a1), (b0, b1) in zip(centers, centers[1:]):
        c.arrow(mid, a1 + 2, mid, b0 - 3)
    c.text(W - 28, H - 18, "Same code, open source (AGPL-3.0) · docker compose to self-host", size=10.5, fill=p["faint"], anchor="end")
    return c.render()


# ── Knowledge flow ─────────────────────────────────────────────────────────────
def flow(name: str) -> str:
    p = dict(PALETTES[name], _name=name)
    W, H = 960, 420
    c = Canvas(W, H, p)
    c.text(28, 36, "WIKIBRAIN · KNOWLEDGE FLOW", size=11, fill=p["faint"], anchor="start", spacing=2)
    c.text(28, 62, "Karpathy's three operations, all done with the same six tools — by your AI client over MCP or by the server-side agent with your key", size=14, fill=p["soft"], anchor="start")
    # schema bar
    c.rect(28, 90, W - 56, 44, p["amberMist"], p["amber"])
    c.text(44, 111, "schema/", size=13.5, weight=600, anchor="start", mono=True)
    c.text(44, 126, "rules the agent reads before writing (get_instructions) · instructions.md, template rules", size=11, fill=p["soft"], anchor="start")
    # columns
    raw_x, raw_w = 28, 222
    ops_x, ops_w = 336, 228
    wiki_x, wiki_w = 690, 242
    top, bottom = 170, 380
    c.rect(raw_x, top, raw_w, bottom - top, p["paper"], p["line"])
    c.text(raw_x + 16, top + 26, "raw/", size=14, weight=600, anchor="start", mono=True)
    c.text(raw_x + 16, top + 46, "immutable sources", size=11.5, fill=p["soft"], anchor="start")
    c.text(raw_x + 16, top + 62, "origin, fetched_at, DOI, authors …", size=11, fill=p["soft"], anchor="start")
    for i, t in enumerate(["sources/paper-2024.md", "sources/article.md", "sources/book-notes.md"]):
        c.rect(raw_x + 16, top + 84 + i * 30, raw_w - 32, 22, p["bg"], p["line"], r=5)
        c.text(raw_x + 26, top + 99 + i * 30, t, size=10.5, fill=p["ink"], anchor="start", mono=True)
    c.text(raw_x + 16, bottom - 14, "pending until a wiki page links back", size=10.5, fill=p["amber"], anchor="start")
    c.rect(wiki_x, top, wiki_w, bottom - top, p["mist"], p["celadon"])
    c.text(wiki_x + 16, top + 26, "wiki/", size=14, weight=600, anchor="start", mono=True)
    c.text(wiki_x + 16, top + 46, "compiled, interlinked pages", size=11.5, fill=p["soft"], anchor="start")
    tiles = ["sources/", "concepts/", "entities/", "arguments/", "queries/", "lint/"]
    for i, t in enumerate(tiles):
        col, row = i % 2, i // 2
        x = wiki_x + 16 + col * 108
        yy = top + 62 + row * 30
        c.rect(x, yy, 98, 22, p["paper"], p["line"], r=5)
        c.text(x + 8, yy + 15, t, size=10.5, anchor="start", mono=True)
    c.text(wiki_x + 16, bottom - 32, "index.md — one line per page", size=10.5, fill=p["soft"], anchor="start", mono=True)
    c.text(wiki_x + 16, bottom - 16, "log.md — append-only journal", size=10.5, fill=p["soft"], anchor="start", mono=True)
    # ops
    ops = [("Ingest", "summarize · link · update index & log", p["celadon"]), ("Query", "read index, then pages → cited answer", p["celadon"]), ("Lint", "orphans · broken links · contradictions", p["amber"])]
    oy = [top, top + 74, top + 148]
    for (head, sub, col), yy in zip(ops, oy):
        c.rect(ops_x, yy, ops_w, 56, p["paper"], col, sw=1.4)
        c.text(ops_x + ops_w / 2, yy + 23, head, size=14, weight=600)
        c.text(ops_x + ops_w / 2, yy + 41, sub, size=10.5, fill=p["soft"])
    # schema dotted arrows: straight down into Ingest; a dotted trunk on the left feeds Query and Lint
    c.arrow(ops_x + ops_w / 2, 134, ops_x + ops_w / 2, oy[0] - 3, dash="3 3")
    tx = ops_x - 22
    c.parts.append(f'<path d="M{tx},134 L{tx},{oy[2] + 28}" fill="none" stroke="{p["faint"]}" stroke-width="1.4" stroke-dasharray="3 3"/>')
    for yy in oy[1:]:
        c.arrow(tx, yy + 28, ops_x - 2, yy + 28, dash="3 3")
    # raw → ingest
    c.arrow(raw_x + raw_w, oy[0] + 28, ops_x - 2, oy[0] + 28)
    # ingest → wiki
    c.arrow(ops_x + ops_w, oy[0] + 28, wiki_x - 2, oy[0] + 28, label="create / update", label_dy=-8)
    # wiki → query, query → wiki
    c.arrow(wiki_x, oy[1] + 18, ops_x + ops_w + 2, oy[1] + 18, label="read", label_dy=-8)
    c.arrow(ops_x + ops_w, oy[1] + 40, wiki_x - 2, oy[1] + 40, label="save to queries/", label_dy=14)
    # wiki → lint, lint → wiki
    c.arrow(wiki_x, oy[2] + 18, ops_x + ops_w + 2, oy[2] + 18, label="scan", label_dy=-8)
    c.arrow(ops_x + ops_w, oy[2] + 40, wiki_x - 2, oy[2] + 40, label="report to lint/", label_dy=14)
    c.text(W - 28, H - 14, "Every write is versioned and attributed (you, Cursor, agent:<model>)", size=10.5, fill=p["faint"], anchor="end")
    return c.render()


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for name in PALETTES:
        (OUT / f"architecture-{name}.svg").write_text(architecture(name), encoding="utf-8")
        (OUT / f"knowledge-flow-{name}.svg").write_text(flow(name), encoding="utf-8")
    print("wrote", sorted(p.name for p in OUT.iterdir()))
