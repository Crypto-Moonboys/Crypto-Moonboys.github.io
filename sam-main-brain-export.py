import json
import os
import re
from datetime import datetime, timezone

import boto3
from botocore.config import Config


MEMORY_FILE = "sam-memory.json"
EXPORT_FILE = "main-brain-export.json"

R2_BUCKET = os.environ.get("R2_BUCKET", "sam-memory")
R2_KEY = "sam-memory.json"
R2_ENDPOINT = (os.environ.get("R2_ENDPOINT_URL") or "").strip().rstrip("/") or None
R2_ACCESS_KEY = os.environ.get("R2_ACCESS_KEY_ID")
R2_SECRET_KEY = os.environ.get("R2_SECRET_ACCESS_KEY")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def normalize_url(url: str) -> str:
    url = (url or "").strip()
    if not url:
        return ""
    url = url.replace("http://", "https://")
    return url.rstrip("/")


def slugify(text: str) -> str:
    text = (text or "").lower().strip()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return re.sub(r"-+", "-", text).strip("-")


def _r2_client():
    return boto3.client(
        "s3",
        endpoint_url=R2_ENDPOINT,
        aws_access_key_id=R2_ACCESS_KEY,
        aws_secret_access_key=R2_SECRET_KEY,
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )


def load_memory() -> dict:
    if R2_ENDPOINT and R2_ACCESS_KEY and R2_SECRET_KEY:
        try:
            client = _r2_client()
            response = client.get_object(Bucket=R2_BUCKET, Key=R2_KEY)
            data = json.loads(response["Body"].read().decode("utf-8"))
            print(f"[export] loaded memory from R2 ({R2_BUCKET}/{R2_KEY})")
            return data
        except Exception as exc:
            print(f"[export] R2 load failed ({exc}) — trying local file")

    if os.path.exists(MEMORY_FILE):
        with open(MEMORY_FILE, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        print(f"[export] loaded memory from local {MEMORY_FILE}")
        return data

    raise RuntimeError("No sam-memory.json source found in R2 or local file")


def first_source_url(entity_data: dict) -> str:
    urls = entity_data.get("source_urls") or []
    if isinstance(urls, list) and urls:
        return normalize_url(str(urls[0]))
    if isinstance(urls, str):
        return normalize_url(urls)
    return ""


def summarize_entity(entity_name: str, entity_data: dict, category: str) -> str:
    parts = []

    role = str(entity_data.get("role_description") or "").strip()
    if role:
        parts.append(role)

    lore = str(entity_data.get("lore_details") or "").strip()
    if lore:
        parts.append(lore)

    real = str(entity_data.get("real_world_basis") or "").strip()
    if real and real.lower() not in {"none", "n/a"}:
        parts.append(real)

    facts = entity_data.get("all_facts") or []
    extracted_facts = []
    if isinstance(facts, list):
        for fact in facts[:4]:
            if isinstance(fact, dict):
                txt = str(fact.get("fact") or "").strip()
            else:
                txt = str(fact).strip()
            if txt:
                extracted_facts.append(txt)

    if extracted_facts:
        parts.append(" ".join(extracted_facts))

    summary = " ".join(parts).strip()
    summary = re.sub(r"\s+", " ", summary)

    if not summary:
        summary = f"{entity_name} is a {category.replace('_', ' ')} entity in the Crypto Moonboys / GraffPUNKS universe."

    return summary[:900]


def build_item(entity_name: str, entity_data: dict, category: str, source_bucket: str) -> dict:
    source_url = first_source_url(entity_data)
    summary = summarize_entity(entity_name, entity_data, category)
    mention_count = int(entity_data.get("mention_count", 0) or 0)

    entity_slug = slugify(entity_name)
    source_name = source_bucket.replace("_", " ").title()

    item_id = f"{source_bucket}:{category}:{entity_slug}"

    wiki_page = entity_name
    if category == "factions":
        wiki_page = "GK Factions"
    elif category == "tokens":
        wiki_page = entity_name
    elif category == "brands":
        wiki_page = entity_name
    elif category == "events":
        wiki_page = entity_name
    elif category == "lore_locations":
        wiki_page = entity_name

    return {
        "id": item_id,
        "entity_name": entity_name,
        "entity_slug": entity_slug,
        "title": entity_name,
        "summary": summary,
        "source_url": source_url,
        "source_name": source_name,
        "wiki_page": wiki_page,
        "category": category,
        "source_bucket": source_bucket,
        "mention_count": mention_count,
        "published_at": now_iso(),
    }


def collect_items(memory: dict) -> list[dict]:
    out = []

    facts = memory.get("facts", {})
    for category, entities in facts.items():
        if not isinstance(entities, dict):
            continue
        for entity_name, entity_data in entities.items():
            if not isinstance(entity_data, dict):
                continue
            mention_count = int(entity_data.get("mention_count", 0) or 0)
            if mention_count < 1:
                continue
            out.append(build_item(entity_name, entity_data, category, "official_facts"))

    external = memory.get("external_facts", {})
    confirmed = external.get("CONFIRMED", {})
    if isinstance(confirmed, dict):
        for entity_name, entity_data in confirmed.items():
            if not isinstance(entity_data, dict):
                continue
            out.append(build_item(entity_name, entity_data, "external_confirmed", "external_facts"))

    web_discovered = memory.get("web_discovered", {})
    web_confirmed = web_discovered.get("WEB_CONFIRMED", {})
    if isinstance(web_confirmed, dict):
        for entity_name, entity_data in web_confirmed.items():
            if not isinstance(entity_data, dict):
                continue
            out.append(build_item(entity_name, entity_data, "web_confirmed", "web_discovered"))

    deduped = {}
    for item in out:
        deduped[item["id"]] = item

    items = list(deduped.values())
    items.sort(key=lambda x: (x.get("mention_count", 0), x.get("title", "")), reverse=True)
    return items


def write_export(payload: dict) -> None:
    with open(EXPORT_FILE, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=2, ensure_ascii=False)
    print(f"[export] wrote {EXPORT_FILE} with {len(payload.get('items', []))} items")


def main() -> None:
    memory = load_memory()
    items = collect_items(memory)

    payload = {
        "generated_at": now_iso(),
        "cycle_count": memory.get("cycle_count", 0),
        "last_update": memory.get("last_update"),
        "items": items,
    }

    write_export(payload)
    print("[export] done")


if __name__ == "__main__":
    main()
