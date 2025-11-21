#!/usr/bin/env python3
"""
OpenTDF corpus builder
- Crawls https://opentdf.io docs
- Enumerates/ingests github.com/opentdf repos (code + releases)
- Emits a clean JSONL corpus with stable metadata & chunks

Usage:
  python scripts/opentdf_corpus_builder.py --out dataset.opentdf.jsonl --config config.yml

Environment:
  GITHUB_TOKEN  (optional; improves rate limits)
"""

from __future__ import annotations

import argparse, dataclasses, datetime as dt, hashlib, io, json, os, re, sys, time
from typing import Any, Dict, Iterable, List, Optional, Tuple, Union
import concurrent.futures as cf

import yaml
import requests
from bs4 import BeautifulSoup
from uritools import urijoin, urisplit
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from tqdm import tqdm
import gzip
import xml.etree.ElementTree as ET
from urllib.parse import urljoin, urlparse

# --------------------
# Config / helpers
# --------------------

DEFAULT_HEADERS = {
    "User-Agent": "OpenTDF-Corpus-Builder/1.0 (+https://opentdf.io)"
}

GITHUB_API = "https://api.github.com"

SITEMAP_CANDIDATES = [
    "/sitemap.xml",
    "/sitemap_index.xml",
    "/sitemap-index.xml",
    "/sitemap.xml.gz",
    "/sitemap_index.xml.gz",
    "/sitemap-index.xml.gz",
]

DOC_SECTION_HINTS = (
    "/introduction",
    "/getting-started",
    "/architecture",
    "/category/components-and-services",
    "/components",  # defensive: some builds use this
    "/sdks",
    "/OpenAPI-clients",
    "/spec",
    "/appendix",
    "/release-notes",
)

def now_iso() -> str:
    return dt.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"

def sha256_text(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()

def approx_tokens(text: str) -> int:
    # Rough heuristic: 4 chars per token (safe fallback if tiktoken unavailable)
    return max(1, int(len(text) / 4))

def clean_text(s: str) -> str:
    # Normalize whitespace, strip nav/footer fluff that sneaks in
    s = re.sub(r'\r\n?', '\n', s)
    s = re.sub(r'[ \t]+', ' ', s)
    s = re.sub(r'\n{3,}', '\n\n', s)
    return s.strip()

def is_allowed_url(url: str, base: str) -> bool:
    return url.startswith(base)

def read_yaml(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)

def _fetch_text(url: str, **kw) -> str:
    r = http_get(url, **kw)
    # Try text first; fall back to bytes decode
    try:
        return r.text
    except Exception:
        return r.content.decode("utf-8", errors="replace")

def _try_parse_sitemap_xml(xml_text: str) -> list[str]:
    """Parse a sitemap or sitemap index; return list of <loc> URLs."""
    urls: list[str] = []
    try:
        root = ET.fromstring(xml_text)
        # handle both sitemapindex and urlset
        for loc in root.iter():
            if loc.tag.endswith("loc") and loc.text:
                urls.append(loc.text.strip())
    except ET.ParseError:
        pass
    return urls

def _fetch_and_parse_sitemap(url: str) -> list[str]:
    # Gzip?
    if url.endswith(".gz"):
        resp = http_get(url)
        try:
            xml_text = gzip.decompress(resp.content).decode("utf-8", errors="replace")
        except Exception:
            xml_text = resp.content.decode("utf-8", errors="replace")
    else:
        xml_text = _fetch_text(url)
    return _try_parse_sitemap_xml(xml_text)

def _extract_sitemap_urls_from_robots(base: str) -> list[str]:
    robots_url = urijoin(base, "/robots.txt")
    try:
        txt = _fetch_text(robots_url)
    except Exception:
        return []
    maps = []
    for line in txt.splitlines():
        if line.lower().startswith("sitemap:"):
            sm = line.split(":", 1)[1].strip()
            maps.append(sm)
    return maps

def _is_docs_url(u: str, base: str) -> bool:
    if not u.startswith(base):
        return False
    # Restrict to known docs sections so we don't index non-doc assets
    return any(h in u for h in DOC_SECTION_HINTS)

# --------------------
# Chunking
# --------------------

def split_into_chunks(text: str, target_chars: int, hard_max: int, min_chars: int) -> List[str]:
    """Greedy splitter with paragraph preference."""
    if len(text) <= hard_max:
        return [text]

    paras = re.split(r'\n{2,}', text.strip())
    chunks: List[str] = []
    buf: List[str] = []
    cur = 0
    for p in paras:
        if cur + len(p) + 2 <= target_chars:
            buf.append(p)
            cur += len(p) + 2
        else:
            if buf:
                chunk = "\n\n".join(buf).strip()
                if len(chunk) >= min_chars or not chunks:
                    chunks.append(chunk)
                else:
                    # merge small remainder with next paragraph(s)
                    pass
            buf = [p]
            cur = len(p)
            if cur > hard_max:
                # brutal split
                for i in range(0, len(p), hard_max):
                    chunks.append(p[i:i+hard_max])
                buf, cur = [], 0
    if buf:
        chunks.append("\n\n".join(buf).strip())
    return chunks

# --------------------
# HTTP with retries
# --------------------

class HttpError(RuntimeError): pass

@retry(stop=stop_after_attempt(5), wait=wait_exponential(multiplier=1, min=1, max=10),
       retry=retry_if_exception_type(HttpError))
def http_get(url: str, headers: dict = None, params: dict = None, allow_redirects=True) -> requests.Response:
    hdrs = dict(DEFAULT_HEADERS)
    if headers:
        hdrs.update(headers)
    r = requests.get(url, headers=hdrs, params=params, allow_redirects=allow_redirects, timeout=30)
    if r.status_code >= 400:
        raise HttpError(f"GET {url} -> {r.status_code}")
    return r

# --------------------
# Docs crawler
# --------------------

def discover_doc_urls(base: str, seeds: list[str]) -> list[str]:
    """
    Robust discovery:
      1) robots.txt -> Sitemap: entries
      2) common sitemap filenames
      3) fallback BFS from seeds
    """
    base = base.rstrip("/")
    found: set[str] = set()

    # 1) robots.txt declared sitemaps
    sm_urls = _extract_sitemap_urls_from_robots(base)

    # 2) well-known candidates
    sm_urls.extend([urijoin(base, c) for c in SITEMAP_CANDIDATES])

    # Crawl sitemaps; expand sitemap indexes too
    to_visit = list(dict.fromkeys(sm_urls))  # dedupe while preserving order
    seen_maps: set[str] = set()
    while to_visit:
        sm = to_visit.pop(0)
        if sm in seen_maps:
            continue
        seen_maps.add(sm)
        try:
            locs = _fetch_and_parse_sitemap(sm)
        except Exception:
            continue
        for loc in locs:
            if loc.endswith(".xml") or loc.endswith(".xml.gz"):
                # Likely a nested sitemap
                if loc not in seen_maps:
                    to_visit.append(loc)
            elif _is_docs_url(loc, base):
                found.add(loc)

    if found:
        return sorted(found)

    # 3) Fallback: guided BFS from seeds, restricted to docs sections
    from collections import deque
    dq = deque([urijoin(base, s) for s in seeds])
    visited: set[str] = set()

    while dq:
        u = dq.popleft()
        if u in visited:
            continue
        visited.add(u)
        try:
            resp = http_get(u)
        except Exception:
            continue
        soup = BeautifulSoup(resp.text, "lxml")

        # collect this page if it looks like a doc
        if _is_docs_url(u, base):
            found.add(u)

        for a in soup.find_all("a", href=True):
            href = a["href"].strip()
            if href.startswith("#"): 
                continue
            if href.startswith("http"):
                full = href
            else:
                full = urijoin(u, href)
            if _is_docs_url(full, base) and full not in visited:
                dq.append(full)

    return sorted(found)

def extract_doc_page(url: str) -> Dict[str, Any]:
    """Docusaurus-style content extractor with sensible fallbacks."""
    r = http_get(url)
    soup = BeautifulSoup(r.text, "lxml")

    # Title: prefer h1 inside the article; fallback to <title>
    title_tag = soup.select_one("article h1") or soup.find("h1") or soup.find("title")
    title = title_tag.get_text(strip=True) if title_tag else None

    # Prefer main article markdown block used by Docusaurus
    candidates = [
        "article .theme-doc-markdown",
        "main article",
        "main .markdown",
        "article",
        "main"
    ]
    main = None
    for sel in candidates:
        main = soup.select_one(sel)
        if main:
            break
    if main is None:
        main = soup

    # Remove unneeded sections
    for sel in ["nav", "footer", "script", "style", "aside", ".theme-doc-toc-desktop", ".theme-doc-toc-mobile"]:
        for t in main.select(sel):
            t.decompose()

    lines = []
    for t in main.find_all(["h1","h2","h3","h4","p","li","pre","code","table"]):
        text = t.get_text("\n", strip=True)
        if text:
            lines.append(text)
    content = clean_text("\n\n".join(lines))

    return {
        "url": url,
        "title": title,
        "content": content,
        "license": "CC-BY-SA-4.0",
        "attribution": "OpenTDF Documentation (opentdf/docs) — CC-BY-SA-4.0",
    }

# --------------------
# GitHub ingestion
# --------------------

def github_headers() -> dict:
    hdrs = dict(DEFAULT_HEADERS)
    tok = os.environ.get("GITHUB_TOKEN")
    if tok:
        hdrs["Authorization"] = f"Bearer {tok}"
    return hdrs

def list_org_repos(org: str) -> List[dict]:
    all_repos = []
    page = 1
    while True:
        r = http_get(f"{GITHUB_API}/orgs/{org}/repos", headers=github_headers(), params={"per_page": 100, "page": page})
        items = r.json()
        if not items: break
        all_repos.extend(items)
        page += 1
    return all_repos

def get_repo_license(org: str, name: str) -> Optional[str]:
    try:
        r = http_get(f"{GITHUB_API}/repos/{org}/{name}/license", headers=github_headers())
        data = r.json()
        lic = (data.get("license") or {}).get("spdx_id")
        return lic
    except Exception:
        return None

def get_default_branch_sha(org: str, name: str) -> Tuple[str, str]:
    r = http_get(f"{GITHUB_API}/repos/{org}/{name}", headers=github_headers())
    repo = r.json()
    branch = repo.get("default_branch", "main")
    r2 = http_get(f"{GITHUB_API}/repos/{org}/{name}/git/refs/heads/{branch}", headers=github_headers())
    ref = r2.json()
    sha = ref.get("object", {}).get("sha") or ref.get("sha")
    return branch, sha

def list_repo_tree(org: str, name: str, sha: str) -> List[dict]:
    r = http_get(f"{GITHUB_API}/repos/{org}/{name}/git/trees/{sha}", headers=github_headers(), params={"recursive": "1"})
    data = r.json()
    return data.get("tree", [])

def get_raw_file(org: str, name: str, branch: str, path: str) -> Optional[str]:
    raw_url = f"https://raw.githubusercontent.com/{org}/{name}/{branch}/{path}"
    r = http_get(raw_url, headers=github_headers())
    # Assume text; decode as UTF-8 best-effort
    try:
        return r.content.decode("utf-8", errors="replace")
    except Exception:
        return None

# --------------------
# JSONL writer
# --------------------

def write_jsonl(out_path: str, records: Iterable[dict]):
    with open(out_path, "w", encoding="utf-8") as f:
        for rec in records:
            f.write(json.dumps(rec, ensure_ascii=False, separators=(",", ":")) + "\n")

# --------------------
# Main build
# --------------------

def build_corpus(cfg: dict, out_path: str):
    fetched_at = now_iso()
    records: List[dict] = []

    # --- Crawl docs
    docs_base = cfg["crawl"]["docs_base"].rstrip("/")
    seeds = cfg["crawl"]["doc_seeds"]
    print(f"[docs] Discovering pages from {docs_base} ...", file=sys.stderr)
    doc_urls = discover_doc_urls(docs_base, seeds)
    print(f"[docs] Found ~{len(doc_urls)} candidates", file=sys.stderr)

    for u in tqdm(doc_urls, desc="docs"):
        try:
            page = extract_doc_page(u)
            text = page["content"]
            if not text or len(text) < 200:
                continue
            chunks = split_into_chunks(text,
                                       cfg["chunking"]["target_chars"],
                                       cfg["chunking"]["hard_max_chars"],
                                       cfg["chunking"]["min_chars"])
            for idx, ch in enumerate(chunks):
                rec = {
                    "id": f"docs::{u}::chunk-{idx+1}",
                    "source_type": "docs",
                    "title": page.get("title"),
                    "section": None,
                    "url": u,
                    "repo": None,
                    "path": None,
                    "commit": None,
                    "license": page.get("license"),
                    "version": None,
                    "fetched_at": fetched_at,
                    "attribution": page.get("attribution"),
                    "content": ch,
                    "content_type": "text",
                    "chunk_index": idx,
                    "chunk_count": len(chunks),
                    "approx_tokens": approx_tokens(ch) if cfg["output"]["add_token_estimates"] else None,
                    "hash": sha256_text(ch) if cfg["output"]["add_hash"] else None,
                }
                records.append(rec)
        except Exception as e:
            print(f"[warn] docs extract failed: {u} -> {e}", file=sys.stderr)

    # --- GitHub repos
    print("[github] Listing org repos ...", file=sys.stderr)
    repos = list_org_repos(cfg["github"]["org"])
    names = [r["name"] for r in repos]
    include = cfg["github"]["include_repos"] or names
    exclude = set(cfg["github"]["exclude_repos"] or [])
    names = [n for n in include if n not in exclude]

    include_exts = set(cfg["github"]["include_exts"] or [])
    max_bytes = int(cfg["github"]["max_file_bytes"] or 800000)

    for name in tqdm(names, desc="repos"):
        try:
            lic = get_repo_license(cfg["github"]["org"], name) or None
            branch, sha = get_default_branch_sha(cfg["github"]["org"], name)
            tree = list_repo_tree(cfg["github"]["org"], name, sha)
            for node in tree:
                if node.get("type") != "blob": continue
                path = node.get("path") or ""
                size = node.get("size") or 0
                ext = os.path.splitext(path)[1].lower()
                if include_exts and ext not in include_exts:
                    continue
                if size and size > max_bytes:
                    continue
                # path filters
                skip = False
                for pat in cfg["github"]["exclude_path_globs"] or []:
                    # naive glob check
                    rx = re.escape(pat).replace(r"\*\*", ".*").replace(r"\*", "[^/]*")
                    if re.fullmatch(rx, path):
                        skip = True; break
                if skip:
                    continue
                # fetch text
                try:
                    text = get_raw_file(cfg["github"]["org"], name, branch, path)
                except Exception:
                    text = None
                if not text: 
                    continue
                text = clean_text(text)
                cchunks = split_into_chunks(text,
                                            cfg["chunking"]["code_target_chars"],
                                            cfg["chunking"]["hard_max_chars"],
                                            cfg["chunking"]["min_chars"])
                for idx, ch in enumerate(cchunks):
                    rec = {
                        "id": f"repo::{name}::{path}::{sha[:8]}::chunk-{idx+1}",
                        "source_type": "repo",
                        "title": os.path.basename(path),
                        "section": None,
                        "url": None,
                        "repo": f"{cfg['github']['org']}/{name}",
                        "path": path,
                        "commit": sha,
                        "license": lic,
                        "version": None,
                        "fetched_at": fetched_at,
                        "attribution": f"Source: github.com/{cfg['github']['org']}/{name} ({lic or 'unknown license'})",
                        "content": ch,
                        "content_type": "code" if ext not in (".md", ".mdx") else "markdown",
                        "chunk_index": idx,
                        "chunk_count": len(cchunks),
                        "approx_tokens": approx_tokens(ch) if cfg["output"]["add_token_estimates"] else None,
                        "hash": sha256_text(ch) if cfg["output"]["add_hash"] else None,
                    }
                    records.append(rec)
        except Exception as e:
            print(f"[warn] repo ingest failed: {name} -> {e}", file=sys.stderr)

    # --- Releases
    for repo_name in (cfg["github"]["releases"]["include_from"] or []):
        try:
            page = 1
            while True:
                r = http_get(f"{GITHUB_API}/repos/{cfg['github']['org']}/{repo_name}/releases",
                             headers=github_headers(),
                             params={"per_page": 50, "page": page})
                rels = r.json()
                if not rels: break
                for rel in rels:
                    name = rel.get("name") or rel.get("tag_name")
                    body = rel.get("body") or ""
                    url = rel.get("html_url")
                    published_at = rel.get("published_at")
                    if not name: 
                        continue
                    text = f"# {name}\n\nPublished: {published_at}\n\n{body}"
                    chunks = split_into_chunks(text,
                                               cfg["chunking"]["target_chars"],
                                               cfg["chunking"]["hard_max_chars"],
                                               cfg["chunking"]["min_chars"])
                    for idx, ch in enumerate(chunks):
                        rec = {
                            "id": f"release::{repo_name}::{name}::chunk-{idx+1}",
                            "source_type": "release",
                            "title": name,
                            "section": repo_name,
                            "url": url,
                            "repo": f"{cfg['github']['org']}/{repo_name}",
                            "path": None,
                            "commit": None,
                            "license": get_repo_license(cfg["github"]["org"], repo_name),
                            "version": name,
                            "fetched_at": fetched_at,
                            "attribution": f"Release notes: github.com/{cfg['github']['org']}/{repo_name}",
                            "content": ch,
                            "content_type": "text",
                            "chunk_index": idx,
                            "chunk_count": len(chunks),
                            "approx_tokens": approx_tokens(ch) if cfg["output"]["add_token_estimates"] else None,
                            "hash": sha256_text(ch) if cfg["output"]["add_hash"] else None,
                        }
                        records.append(rec)
                page += 1
        except Exception as e:
            print(f"[warn] releases ingest failed: {repo_name} -> {e}", file=sys.stderr)

    # --- Write
    write_jsonl(out_path, records)

    # --- Attribution roll-up
    at_lines = []
    seen_attr = set()
    for r in records:
        a = r.get("attribution")
        if a and a not in seen_attr:
            at_lines.append(a)
            seen_attr.add(a)
    with open("ATTRIBUTION.txt", "w", encoding="utf-8") as f:
        f.write("\n".join(sorted(at_lines)) + "\n")

    print(f"[done] wrote {len(records)} records -> {out_path}")

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--out", required=True, help="Output JSONL path")
    p.add_argument("--config", default="config.yml", help="YAML config path")
    args = p.parse_args()

    cfg = read_yaml(args.config)
    build_corpus(cfg, args.out)

if __name__ == "__main__":
    main()
