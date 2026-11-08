#!/usr/bin/env python3
"""Re-sync BazarGoo Mini App product data from the live store.

How it works (no public live feed exists on bazargoo.com, verified 2026-11-08):
  1. Fetch https://bazargoo.com/sitemap.xml -> the full list of product URLs.
  2. Fetch every product page and read its JSON-LD blocks:
       - Product block: name, image, offers.price (the live price)
       - BreadcrumbList block: the product's category (position 2)
     Compare-at ("old") price is read from the page markup (line-through span).
  3. Rewrite products.json next to this script. No app rebuild needed —
     the app reads products.json on every open, so a fresh file = fresh prices.

Usage:
    python3 sync-products.py            # writes products.json in this folder
    python3 sync-products.py --check    # dry run: print what would change, write nothing

Exit code 0 = OK. Any product whose price cannot be verified as a single
unambiguous number is SKIPPED (listed in _meta.skipped) rather than guessed.
"""
import argparse
import json
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.request import Request, urlopen

STORE = "https://bazargoo.com"
SITEMAP = STORE + "/sitemap.xml"
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0"}
HERE = Path(__file__).resolve().parent
OUT = HERE / "products.json"

# Same-category spellings on the store, merged into one label.
CATEGORY_MERGE = {"Home Appliance": "Home Appliances", "Book": "Books"}


def get(url, timeout=25):
    req = Request(url, headers=UA)
    with urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "ignore")


def discover_slugs():
    xml = get(SITEMAP)
    return sorted(set(re.findall(r"https://bazargoo\.com/products/([a-z0-9\-]+)", xml)))


def fetch_product(slug):
    url = f"{STORE}/products/{slug}"
    try:
        h = get(url)
    except Exception as e:
        return slug, None, f"fetch error: {e}"
    name = price = old_price = img = cat = cat_url = None
    for m in re.finditer(r'<script type="application/ld\+json">(.*?)</script>', h, re.S):
        try:
            d = json.loads(m.group(1))
        except Exception:
            continue
        if isinstance(d, dict) and d.get("@type") == "BreadcrumbList":
            items = d.get("itemListElement", [])
            if len(items) >= 2:
                cat, cat_url = items[1].get("name"), items[1].get("item")
        if isinstance(d, dict) and d.get("@type") == "Product":
            name, img = d.get("name"), d.get("image")
            offers = d.get("offers") or {}
            if isinstance(offers, dict):
                price = offers.get("price")
    om = re.search(r'line-through[^>]*>৳<!-- -->?([\d,]+)</span>', h)
    if om:
        try:
            old_price = int(om.group(1).replace(",", ""))
        except Exception:
            pass
    if price is not None:
        try:
            price = int(float(price))
        except Exception:
            price = None
    return slug, {
        "slug": slug, "name": name, "price": price, "old_price": old_price,
        "image": img, "category": cat, "category_url": cat_url, "url": url,
    }, None


def build():
    slugs = discover_slugs()
    with ThreadPoolExecutor(max_workers=8) as ex:
        results = list(ex.map(fetch_product, slugs))
    out, skipped = [], []
    for slug, info, err in results:
        if err or not info or not info["name"] or info["price"] is None or info["price"] <= 0:
            skipped.append({
                "slug": slug,
                "name": (info or {}).get("name"),
                "reason": err or "Price unverifiable (missing or 0 in JSON-LD). Excluded rather than guessed.",
            })
            continue
        cat = CATEGORY_MERGE.get(info["category"], info["category"])
        img = (info["image"] or "").split("?")[0]
        out.append({
            "id": slug,
            "name": info["name"],
            "price": info["price"],
            "old_price": info["old_price"],
            "category": cat,
            "category_url": info["category_url"],
            "image": f"{img}?w=480&q=70" if img else "",
            "image_large": f"{img}?w=1080&q=75" if img else "",
            "url": info["url"],
        })
    out.sort(key=lambda x: (x["category"] or "", x["price"]))
    return out, skipped, len(slugs)


def main():
    ap = argparse.ArgumentParser(description="Sync BazarGoo products.json from bazargoo.com")
    ap.add_argument("--check", action="store_true", help="dry run, write nothing")
    args = ap.parse_args()

    try:
        products, skipped, discovered = build()
    except Exception as e:
        print(f"FAILED: {e}", file=sys.stderr)
        return 1

    old = {}
    if OUT.exists():
        try:
            old = {p["id"]: p["price"] for p in json.loads(OUT.read_text())["products"]}
        except Exception:
            pass
    changed = [p for p in products if old.get(p["id"]) != p["price"]]
    removed = [pid for pid in old if pid not in {p["id"] for p in products}]

    print(f"Discovered in sitemap: {discovered} products")
    print(f"Usable (verified price): {len(products)} | skipped: {len(skipped)}")
    for s in skipped:
        print(f"  SKIP {s['slug']}: {s['reason']}")
    print(f"Prices changed vs current products.json: {len(changed)}")
    for p in changed[:20]:
        print(f"  {p['id']}: {old.get(p['id'])} -> {p['price']}")
    if removed:
        print(f"Removed from store (no longer in sitemap data): {removed}")

    if args.check:
        print("Dry run — products.json not written.")
        return 0

    from datetime import date
    data = {
        "_meta": {
            "store": "Bazar Goo",
            "store_url": STORE,
            "currency": "BDT",
            "currency_symbol": "৳",
            "fetched_at": str(date.today()),
            "source": "Live scrape of bazargoo.com. Product list discovered from https://bazargoo.com/sitemap.xml. For each product page, name/price/image taken from the JSON-LD Product block (offers.price) and category from the JSON-LD BreadcrumbList; compare-at price from the page markup.",
            "live_feed": "No public live product feed exists on bazargoo.com (tested 2026-11-08: /products.json 404, /api/products 404, /api/store/products 404, /sitemap-products.xml 404; sitemap.xml lists URLs only, no prices). Prices therefore come from this bundled products.json. Re-run sync-products.py to refresh — no app rebuild needed.",
            "note": "Store's own spellings kept as-is in 'category': 'Cleanning', 'Kithen'. Merged duplicates: 'Home Appliance' into 'Home Appliances', 'Book' into 'Books' (same category, two spellings on the store).",
            "skipped": skipped,
            "count": len(products),
        },
        "products": products,
    }
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Wrote {OUT} ({len(products)} products).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
