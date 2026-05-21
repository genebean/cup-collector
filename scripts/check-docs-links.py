#!/usr/bin/env python3
"""Check that every internal href/src in docs/ HTML files resolves to an existing file."""

import os
import re
import sys
from pathlib import Path


def docs_root() -> Path:
    result = os.popen("git rev-parse --show-toplevel").read().strip()
    return Path(result) / "docs"


def extract_links(html: str) -> list[str]:
    return re.findall(r'(?:href|src)=["\']([^"\']+)["\']', html)


def is_external(link: str) -> bool:
    return link.startswith(("http://", "https://", "mailto:", "tel:", "data:", "#"))


def main() -> None:
    root = docs_root()
    errors: list[str] = []

    html_files = sorted(root.rglob("*.html"))
    for html_file in html_files:
        for link in extract_links(html_file.read_text(encoding="utf-8")):
            path_part = link.split("#")[0]
            if not path_part or is_external(link):
                continue
            resolved = (html_file.parent / path_part).resolve()
            if not resolved.exists():
                rel = html_file.relative_to(root.parent)
                errors.append(f"  {rel}: broken → {link!r}")

    if errors:
        print(f"Broken internal links ({len(errors)}):")
        print("\n".join(errors))
        sys.exit(1)

    print(f"Internal links OK — {len(html_files)} HTML files checked")


if __name__ == "__main__":
    main()
