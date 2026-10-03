#!/usr/bin/env python3
"""Focused ownership/idempotency tests for sam-wiki-publisher.py."""

import importlib.util
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "sam_wiki_publisher", ROOT / "sam-wiki-publisher.py"
)
publisher = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = publisher
SPEC.loader.exec_module(publisher)


def page_entry(slug, html, policy="replace-sam-block", **overrides):
    encoded = html.encode("utf-8") if html is not None else None
    state = publisher.analyze_ownership(html) if html is not None else publisher.OwnershipState(0, 0, 0, False, False)
    entry = {
        "path": f"wiki/{slug}.html",
        "slug": slug,
        "page_exists": html is not None,
        "content_hash": publisher.sha256_bytes(encoded) if encoded is not None else None,
        "article_content_hash": publisher.semantic_hash(html, article=True) if html is not None else None,
        "article_markup_hash": publisher.sha256_bytes(encoded) if encoded is not None else None,
        "git_blob_oid": publisher.git_blob_id(encoded) if encoded is not None else None,
        "manual_content_block_count": state.manual_blocks,
        "sam_content_block_count": state.sam_blocks,
        "canonical_content_block_count": state.canonical_blocks,
        "legacy_unmarked_content": state.legacy_unmarked,
        "automation_policy": policy,
    }
    entry.update(overrides)
    # Most focused transaction tests construct a one-page repository manifest.
    # Bind their plan records to the exact bytes those tests install so the
    # production manifest-identity precondition remains mandatory everywhere.
    manifest_bytes = json.dumps({"pages": [entry]}).encode("utf-8")
    identity = publisher.ContentStateManifestIdentity(
        content_bytes=manifest_bytes,
        content_hash=publisher.sha256_bytes(manifest_bytes),
        byte_length=len(manifest_bytes),
    )
    return publisher.ContentStateRecord(entry, identity)


def write_staged_refresh_outputs(output_dir, manifest, report="refreshed report\n"):
    output = Path(output_dir)
    manifest_bytes = (
        manifest if isinstance(manifest, bytes)
        else json.dumps(manifest).encode("utf-8")
    )
    (output / Path(publisher.CONTENT_STATE_MANIFEST).name).write_bytes(manifest_bytes)
    if report is not None:
        report_bytes = report if isinstance(report, bytes) else report.encode("utf-8")
        (output / Path(publisher.CONTENT_STATE_REPORT).name).write_bytes(report_bytes)


class PublisherOwnershipTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="sam-publisher-")
        self.wiki_dir = Path(self.temp.name) / "wiki"
        self.wiki_dir.mkdir()

    def tearDown(self):
        self.temp.cleanup()

    def write_page(self, slug, html):
        path = self.wiki_dir / f"{slug}.html"
        path.write_text(html, encoding="utf-8")
        return path

    def item(self, slug, entry, prose="<p>New SAM prose.</p>"):
        return {
            "slug": slug,
            "title": slug,
            "article_html": prose,
            "expected_content_hash": entry["content_hash"],
            "content_hash": publisher.sam_content_hash(prose),
        }

    def test_sam_payload_hash_normalizes_line_endings_but_not_html_structure(self):
        self.assertEqual(
            publisher.sam_content_hash("\r\n<p>Same</p>\r\n"),
            publisher.sam_content_hash("<p>Same</p>"),
        )
        self.assertNotEqual(
            publisher.sam_content_hash("<p>Same</p>"),
            publisher.sam_content_hash("<p> Same </p>"),
        )

    def test_replaces_the_only_sam_block_and_preserves_manual_content(self):
        slug = "owned-page"
        html = f"""<article>
{publisher.MANUAL_CONTENT_BEGIN}<p>Manual truth.</p>{publisher.MANUAL_CONTENT_END}
{publisher.SAM_CONTENT_BEGIN}<p>Old SAM prose.</p>{publisher.SAM_CONTENT_END}
</article>"""
        self.write_page(slug, html)
        entry = page_entry(slug, html)

        plan = publisher.plan_item_publish(self.item(slug, entry), entry, wiki_dir=str(self.wiki_dir))

        self.assertEqual(plan.action, "replace-sam-block")
        self.assertIn("Manual truth.", plan.html)
        self.assertNotIn("Old SAM prose.", plan.html)
        self.assertEqual(plan.html.count(publisher.SAM_CONTENT_BEGIN), 1)

    def test_replacement_preserves_all_protected_bytes_around_nested_articles(self):
        slug = "nested-card-page"
        first_manual = (
            f"{publisher.MANUAL_CONTENT_BEGIN}"
            '<section><article class="card"><p>Nested protected card.</p></article></section>'
            f"{publisher.MANUAL_CONTENT_END}"
        )
        second_manual = (
            f"{publisher.MANUAL_CONTENT_BEGIN}<p>Protected tail.</p>"
            f"{publisher.MANUAL_CONTENT_END}"
        )
        html = (
            f"<article>{first_manual}{publisher.SAM_CONTENT_BEGIN}<p>Old.</p>"
            f"{publisher.SAM_CONTENT_END}{second_manual}</article>"
        )
        self.write_page(slug, html)
        entry = page_entry(slug, html)

        plan = publisher.plan_item_publish(
            self.item(slug, entry), entry, wiki_dir=str(self.wiki_dir)
        )

        self.assertEqual(plan.action, "replace-sam-block")
        self.assertEqual(
            publisher._protected_content_blocks(plan.html),
            publisher._protected_content_blocks(html),
        )
        self.assertIn(first_manual, plan.html)
        self.assertIn(second_manual, plan.html)

    def test_rejects_nested_crossed_and_outside_root_ownership(self):
        M_B = publisher.MANUAL_CONTENT_BEGIN
        M_E = publisher.MANUAL_CONTENT_END
        S_B = publisher.SAM_CONTENT_BEGIN
        S_E = publisher.SAM_CONTENT_END
        C_B = publisher.CANONICAL_CONTENT_BEGIN
        C_E = publisher.CANONICAL_CONTENT_END
        invalid_pages = {
            "manual-wraps-sam": f"<article>{M_B}{S_B}<p>x</p>{S_E}{M_E}</article>",
            "sam-wraps-manual": f"<article>{S_B}{M_B}<p>x</p>{M_E}{S_E}</article>",
            "canonical-wraps-sam": f"<article>{C_B}{S_B}<p>x</p>{S_E}{C_E}</article>",
            "sam-wraps-canonical": f"<article>{S_B}{C_B}<p>x</p>{C_E}{S_E}</article>",
            "attribute-wraps-sam": (
                f'<article><section data-canonical-content="true">{S_B}<p>x</p>{S_E}'
                "</section></article>"
            ),
            "sam-wraps-attribute": (
                f'<article>{S_B}<section data-canonical-content="true"><p>x</p>'
                f"</section>{S_E}</article>"
            ),
            "crossed": f"<article>{M_B}{S_B}<p>x</p>{M_E}{S_E}</article>",
            "sam-wraps-article": f"{S_B}<article><p>x</p></article>{S_E}",
            "sam-contains-article-in-wiki-root": (
                f'<div class="wiki-content">{S_B}<article><p>x</p></article>'
                f"{S_E}</div>"
            ),
        }
        for label, html in invalid_pages.items():
            with self.subTest(label=label):
                with self.assertRaises(publisher.PublisherSafetyError):
                    publisher.analyze_ownership(html)

    def test_script_marker_text_cannot_steer_real_sam_replacement(self):
        slug = "script-marker-page"
        fake = (
            'const sample = "<!-- SAM_CONTENT:BEGIN --><p>fake</p>'
            '<!-- SAM_CONTENT:END -->";'
        )
        html = (
            f"<script>{fake}</script><article>{publisher.SAM_CONTENT_BEGIN}"
            f"<p>Real old.</p>{publisher.SAM_CONTENT_END}</article>"
        )
        self.write_page(slug, html)
        entry = page_entry(slug, html)

        plan = publisher.plan_item_publish(
            self.item(slug, entry), entry, wiki_dir=str(self.wiki_dir)
        )

        self.assertEqual(plan.action, "replace-sam-block")
        self.assertIn(fake, plan.html)
        self.assertNotIn("Real old.", plan.html)

    def test_same_sam_hash_is_a_noop_after_manifest_freshness_check(self):
        slug = "same-page"
        prose = "<p>Same SAM prose.</p>"
        html = f"<article>{publisher.SAM_CONTENT_BEGIN}{prose}{publisher.SAM_CONTENT_END}</article>"
        path = self.write_page(slug, html)
        entry = page_entry(slug, html)
        item = self.item(slug, entry, prose)

        plan = publisher.plan_item_publish(item, entry, wiki_dir=str(self.wiki_dir))
        self.assertEqual(plan.action, "noop")

        path.write_text(html.replace("<article>", "<article>\n"), encoding="utf-8")
        with self.assertRaisesRegex(publisher.PublisherSafetyError, "stale revision"):
            publisher.plan_item_publish(item, entry, wiki_dir=str(self.wiki_dir))

    def test_exact_successful_sam_payload_replay_ignores_its_old_base_hash(self):
        slug = "sam-retry-page"
        old_html = (
            f"<article>{publisher.SAM_CONTENT_BEGIN}<p>Old.</p>"
            f"{publisher.SAM_CONTENT_END}</article>"
        )
        new_prose = "<p>Committed prose.</p>"
        self.write_page(slug, old_html)
        old_entry = page_entry(slug, old_html)
        original_item = self.item(slug, old_entry, new_prose)
        first = publisher.plan_item_publish(
            original_item, old_entry, wiki_dir=str(self.wiki_dir)
        )
        self.write_page(slug, first.html)
        refreshed_entry = page_entry(slug, first.html)
        self.assertNotEqual(
            original_item["expected_content_hash"], refreshed_entry["content_hash"]
        )

        retry = publisher.plan_item_publish(
            original_item, refreshed_entry, wiki_dir=str(self.wiki_dir)
        )

        self.assertEqual(retry.action, "noop")

    def test_stale_expected_hash_is_rejected(self):
        slug = "stale-page"
        html = f"<article>{publisher.SAM_CONTENT_BEGIN}<p>Old.</p>{publisher.SAM_CONTENT_END}</article>"
        self.write_page(slug, html)
        entry = page_entry(slug, html)
        item = self.item(slug, entry)
        item["expected_content_hash"] = "sha256:" + "0" * 64

        with self.assertRaisesRegex(publisher.PublisherSafetyError, "expected_content_hash is stale"):
            publisher.plan_item_publish(item, entry, wiki_dir=str(self.wiki_dir))

    def test_replace_never_appends_a_first_sam_block_to_legacy_content(self):
        slug = "legacy-page"
        html = "<article><h1>Legacy</h1><p>Unmarked owner prose.</p></article>"
        self.write_page(slug, html)
        entry = page_entry(slug, html)

        with self.assertRaisesRegex(publisher.PublisherSafetyError, "legacy article"):
            publisher.plan_item_publish(self.item(slug, entry), entry, wiki_dir=str(self.wiki_dir))

    def test_sam_block_does_not_hide_substantive_unmarked_legacy_prose(self):
        slug = "mixed-legacy-page"
        html = (
            "<article><p>Stale unmarked generation must remain review-only.</p>"
            f"{publisher.SAM_CONTENT_BEGIN}<p>Owned SAM prose.</p>{publisher.SAM_CONTENT_END}"
            "</article>"
        )
        self.write_page(slug, html)
        state = publisher.analyze_ownership(html)
        self.assertEqual(state.sam_blocks, 1)
        self.assertTrue(state.legacy_unmarked)

        # Actual page analysis remains fail-closed even if a stale/malformed
        # manifest incorrectly says the mixed page has no legacy prose.
        entry = page_entry(slug, html, legacy_unmarked_content=False)
        with self.assertRaisesRegex(publisher.PublisherSafetyError, "legacy article"):
            publisher.plan_item_publish(self.item(slug, entry), entry, wiki_dir=str(self.wiki_dir))

    def test_descendant_stub_attribute_cannot_exempt_unmarked_article(self):
        injected = (
            '<html><body><article><div data-wiki-stub="true">'
            "Unmarked real prose.</div></article></body></html>"
        )
        state = publisher.analyze_ownership(injected)
        self.assertFalse(state.explicit_stub)
        self.assertTrue(state.legacy_unmarked)

        article_marked = injected.replace(
            "<article>", '<article data-wiki-stub="true">'
        )
        article_state = publisher.analyze_ownership(article_marked)
        self.assertFalse(article_state.explicit_stub)
        self.assertTrue(article_state.legacy_unmarked)

        body_marked = injected.replace("<body>", '<body data-wiki-stub="true">')
        body_state = publisher.analyze_ownership(body_marked)
        self.assertTrue(body_state.explicit_stub)
        self.assertFalse(body_state.legacy_unmarked)

    def test_comment_pseudo_tags_cannot_become_article_or_stub_roots(self):
        html = (
            '<!-- <article-slug data-wiki-stub="true">pseudo</article-slug> -->'
            '<!-- <article data-wiki-stub="true">comment-only</article> -->'
            "<article><p>Real unmarked article prose.</p></article>"
        )
        self.assertEqual(
            publisher.normalize_visible_text(publisher.extract_article_fragment(html)),
            "Real unmarked article prose.",
        )
        state = publisher.analyze_ownership(html)
        self.assertFalse(state.explicit_stub)
        self.assertTrue(state.legacy_unmarked)

    def test_raw_text_and_template_pseudo_roots_cannot_grant_stub_ownership(self):
        spoofs = [
            '<script>const x = \'<body data-wiki-stub="true">\';</script>',
            '<style>.x::before{content:"<article data-wiki-stub=\\"true\\">"}</style>',
            '<template><article data-wiki-stub="true">template</article></template>',
            '<textarea><article data-wiki-stub="true"></textarea>',
            '<xmp><article data-wiki-stub="true"></xmp>',
            '<noscript><article data-wiki-stub="true"></article></noscript>',
            '<!-- <article data-wiki-stub="true"> --!>',
        ]
        for spoof in spoofs:
            with self.subTest(spoof=spoof):
                html = f"{spoof}<body><article><p>Real article.</p></article></body>"
                state = publisher.analyze_ownership(html)
                self.assertFalse(state.explicit_stub)
                self.assertTrue(state.legacy_unmarked)

        actual = (
            '<body data-wiki-stub="true"><article data-wiki-stub="true">'
            "<p>Generated stub.</p></article></body>"
        )
        self.assertTrue(publisher.analyze_ownership(actual).explicit_stub)
        lookalike = (
            '<article data-wiki-stub="false" x-data-wiki-stub="true">'
            "<p>Protected article.</p></article>"
        )
        self.assertFalse(publisher.analyze_ownership(lookalike).explicit_stub)

    def test_multiple_sibling_content_roots_fail_closed_but_nested_articles_do_not(self):
        siblings = (
            "<article><p>Protected first.</p></article>"
            '<article data-wiki-stub="true"><p>Spoofed second.</p></article>'
        )
        self.assertFalse(publisher.is_explicit_stub_html(siblings))
        with self.assertRaisesRegex(publisher.PublisherSafetyError, "multiple sibling"):
            publisher.analyze_ownership(siblings)

        nested = "<article><p>Outer.</p><article><p>Card.</p></article></article>"
        self.assertEqual(
            publisher.normalize_visible_text(publisher.extract_article_fragment(nested)),
            "Outer. Card.",
        )

    def test_replace_requires_exactly_one_existing_sam_block(self):
        slug = "manual-only"
        html = f"<article>{publisher.MANUAL_CONTENT_BEGIN}<p>Manual.</p>{publisher.MANUAL_CONTENT_END}</article>"
        self.write_page(slug, html)
        entry = page_entry(slug, html)

        with self.assertRaisesRegex(publisher.PublisherSafetyError, "requires one existing SAM block"):
            publisher.plan_item_publish(self.item(slug, entry), entry, wiki_dir=str(self.wiki_dir))

        duplicate = (
            f"<article>{publisher.SAM_CONTENT_BEGIN}<p>One.</p>{publisher.SAM_CONTENT_END}"
            f"{publisher.SAM_CONTENT_BEGIN}<p>Two.</p>{publisher.SAM_CONTENT_END}</article>"
        )
        with self.assertRaisesRegex(publisher.PublisherSafetyError, "multiple SAM"):
            publisher.analyze_ownership(duplicate)

    def test_multiple_canonical_blocks_are_invalid(self):
        duplicate = (
            f"<article>{publisher.CANONICAL_CONTENT_BEGIN}<p>One.</p>{publisher.CANONICAL_CONTENT_END}"
            f"{publisher.CANONICAL_CONTENT_BEGIN}<p>Two.</p>{publisher.CANONICAL_CONTENT_END}</article>"
        )
        with self.assertRaisesRegex(publisher.PublisherSafetyError, "multiple canonical"):
            publisher.analyze_ownership(duplicate)

    def test_first_witness_prose_is_locked_even_with_bad_manifest_policy(self):
        slug = "first-witness-test"
        html = "<article><p>Witness canon.</p></article>"
        self.write_page(slug, html)
        entry = page_entry(
            slug,
            html,
            policy="replace-sam-block",
            legacy_unmarked_content=False,
        )

        with self.assertRaisesRegex(publisher.PublisherSafetyError, "First Witness canon"):
            publisher.plan_item_publish(self.item(slug, entry), entry, wiki_dir=str(self.wiki_dir))

    def test_metadata_only_rejects_article_prose(self):
        slug = "metadata-page"
        html = "<article><p>Owner prose.</p></article>"
        self.write_page(slug, html)
        entry = page_entry(slug, html, policy="metadata-only")

        with self.assertRaisesRegex(publisher.PublisherSafetyError, "metadata-only"):
            publisher.plan_item_publish(self.item(slug, entry), entry, wiki_dir=str(self.wiki_dir))

    def test_requested_prose_rejects_case_insensitive_control_token_injection(self):
        injections = [
            "<!-- manual_content:begin --><p>Injected.</p>",
            "<!-- SaM_CoNtEnT:EnD -->",
            "<!-- canonical_content:begin -->",
            '<section DATA-CANONICAL-CONTENT="true">Injected.</section>',
            '<div Data-Wiki-Stub="true">Injected.</div>',
            "<!-- related_wiki_paths:begin -->",
            "<!--RELATED_WIKI_PATHS : END-->",
            "<!-- RELATED_WIKI_PATHS:end -->",
            '<div ID="BIBLE-CONTENT"></div>',
            '<div id="bible-content"class="x"></div>',
            '<div id="bible&#45;content"></div>',
            '<div id=bible&#x2d;content></div>',
            '<div id="safe" id="bible&#45;content"></div>',
            '<iframe id="bible&#45;content"></iframe>',
            '<template id=bible-content></template>',
            '<textarea id="bible-content"></textarea>',
            '<meta http-equiv="refresh" content="0;url=/wiki/other.html">',
            '<meta http-equiv=refresh />',
            '<meta name="description" content="looks harmless">',
            '<meta charset=utf-8/>',
            '<link rel="alternate canonical" href="/wiki/other.html">',
            '<link href=/wiki/other.html rel=canonical />',
            '<link rel=stylesheet href=/wiki/theme.css>',
            '<link rel=alternate href=/wiki/feed.xml/>',
            '<base href="/wiki/other/">',
            '<base target=_top/>',
            '<noscript><meta name=robots content=noindex></noscript>',
            '<template><link rel=canonical href=/wiki/other.html></template>',
            '<img src=x onerror="alert(1)">',
            '<iframe srcdoc="&lt;script&gt;alert(1)&lt;/script&gt;"></iframe>',
            '<a href="java&#x73;cript:alert(1)">click</a>',
            '<form action="vb&#115;cript:alert(1)"></form>',
            '<object data="data:text/html,unsafe"></object>',
            '<button formaction="java&#10;script:alert(1)">go</button>',
            '<svg><a xlink:href="javascript:alert(1)">click</a></svg>',
            '<template><img src=x onload=alert(1)></template>',
            '</main><p>Escaped shell.</p>',
            '</div><p>Unmatched close.</p>',
            '<textarea>Consumes the remaining SAM block',
            '<select><option>Consumes the remaining SAM block',
            '<xmp>Consumes the remaining SAM block',
            '<plaintext>Consumes the remaining SAM block',
            '<svg><circle cx=1 cy=1 r=1></circle></svg>',
            '<math><mtext>Foreign math content</mtext></math>',
            '<animate attributeName=href values="https://example.com"></animate>',
        ]
        for prose in injections:
            with self.subTest(prose=prose):
                with self.assertRaises(publisher.PublisherSafetyError):
                    publisher.validate_middle_content(prose)

        publisher.validate_middle_content('<p>Text id="bible-content" is harmless.</p>')
        publisher.validate_middle_content('<div id="bible-content-extra"></div>')
        publisher.validate_middle_content(
            '<a title=\'href="javascript:alert(1)" onclick="decoy"\' '
            'href="https://example.com/safe">Safe quoted text.</a>'
        )
        publisher.validate_middle_content(
            '<div data-note="javascript:alert(1)">Harmless custom data.</div>'
        )
        publisher.validate_middle_content(
            '<div title="quoted </main>, <script>, and <!doctype html> decoys">'
            "Safe text.</div>"
        )

    def test_stub_allowed_creates_only_missing_declared_page(self):
        slug = "new-stub"
        entry = page_entry(slug, None, policy="stub-allowed")
        item = {
            "slug": slug,
            "title": "New Stub",
            "summary": "Metadata summary.",
        }

        plan = publisher.plan_item_publish(item, entry, wiki_dir=str(self.wiki_dir))
        self.assertEqual(plan.action, "stub")
        self.assertIn('data-wiki-stub="true"', plan.html)

        item["summary"] = "word " * (publisher.MAX_STUB_SUMMARY_WORDS + 1)
        with self.assertRaisesRegex(publisher.PublisherSafetyError, "full article prose"):
            publisher.plan_item_publish(item, entry, wiki_dir=str(self.wiki_dir))

    def test_stub_render_rejects_dangerous_source_url_schemes(self):
        slug = "unsafe-source-stub"
        entry = page_entry(slug, None, policy="stub-allowed")
        dangerous_urls = [
            "javascript:alert(1)",
            "java&#x73;cript:alert(1)",
            "vbscript:msgbox(1)",
            "data:text/html,<script>alert(1)</script>",
        ]
        for source_url in dangerous_urls:
            with self.subTest(source_url=source_url):
                with self.assertRaisesRegex(
                    publisher.PublisherSafetyError, "source_url"
                ):
                    publisher.plan_item_publish(
                        {
                            "slug": slug,
                            "title": "Unsafe Source Stub",
                            "summary": "Metadata summary.",
                            "source_url": source_url,
                        },
                        entry,
                        wiki_dir=str(self.wiki_dir),
                    )

        safe = publisher.plan_item_publish(
            {
                "slug": slug,
                "title": "Safe Source Stub",
                "summary": "Metadata summary.",
                "source_url": "https://example.com/source?a=1&b=2",
            },
            entry,
            wiki_dir=str(self.wiki_dir),
        )
        self.assertIn(
            'href="https://example.com/source?a=1&amp;b=2"', safe.html
        )

    def test_stub_allowed_rejects_redirect_or_canonical_alias(self):
        slug = "alias-stub"
        controls = [
            '<link rel="canonical" href="/wiki/real-page.html">',
            '<link href=/wiki/real-page.html rel=canonical/>',
            '<link href=/wiki/real-page.html rel=canon&#105;cal>',
            '<meta content="0;url=/wiki/real-page.html" http-equiv=refresh/>',
            '<meta http-equiv=ref&#114;esh content="0;url=/wiki/real-page.html">',
            '<script>window.location.href = "/wiki/real-page.html";</script>',
            '<script>window.location = "/wiki/real-page.html";</script>',
            '<script>location = "/wiki/real-page.html";</script>',
            '<script>location.assign("/wiki/real-page.html");</script>',
            '<script>location.replace("/wiki/real-page.html");</script>',
        ]
        for index, control in enumerate(controls):
            with self.subTest(control=control):
                html = (
                    f"<html><head>{control}</head><body data-wiki-stub=\"true\">"
                    '<article data-wiki-stub="true"><p>Alias.</p></article>'
                    "</body></html>"
                )
                page_slug = f"{slug}-{index}"
                self.write_page(page_slug, html)
                entry = page_entry(page_slug, html, policy="stub-allowed")
                item = {
                    "slug": page_slug,
                    "title": "Alias",
                    "expected_content_hash": entry["content_hash"],
                }

                with self.assertRaisesRegex(
                    publisher.PublisherSafetyError, "redirect/canonical alias"
                ):
                    publisher.plan_item_publish(
                        item, entry, wiki_dir=str(self.wiki_dir)
                    )

        self.assertFalse(publisher.redirects_to_other_wiki_page(
            '<template><script>location.replace("/wiki/real-page.html")</script>'
            '<meta http-equiv=refresh><link rel=canonical href=/wiki/real-page.html>'
            "</template>",
            slug,
        ))
        self.assertTrue(publisher.redirects_to_other_wiki_page(
            '<link rel=canonical href="https://example.invalid/wiki/alias-stub.html">',
            slug,
        ))
        self.assertTrue(publisher.redirects_to_other_wiki_page(
            '<noscript><meta http-equiv=refresh></noscript>',
            slug,
        ))
        self.assertTrue(publisher.redirects_to_other_wiki_page(
            '<noscript><link rel=stylesheet href=/style.css></noscript>',
            slug,
        ))
        self.assertFalse(publisher.redirects_to_other_wiki_page(
            '<link rel=canonical href="https://cryptomoonboys.com/wiki/alias-stub.html#top">',
            slug,
        ))

    def test_browser_inactive_select_roots_cannot_grant_stub_ownership(self):
        invalid_pages = [
            '<select><article data-wiki-stub="true"></article></select><p>Real.</p>',
            (
                '<article><p>Real.</p></article><select>'
                '<body data-wiki-stub="true"></body></select>'
            ),
        ]
        for html in invalid_pages:
            with self.subTest(html=html):
                with self.assertRaisesRegex(
                    publisher.PublisherSafetyError, "inside select"
                ):
                    publisher.analyze_ownership(html)

    def test_manifest_is_required_and_indexes_pages(self):
        missing = Path(self.temp.name) / "missing.json"
        with self.assertRaisesRegex(publisher.PublisherSafetyError, "manifest is required"):
            publisher.load_content_state_manifest(str(missing))

        manifest_path = Path(self.temp.name) / "manifest.json"
        entry = page_entry("known-page", None, policy="stub-allowed")
        manifest_path.write_text(json.dumps({"pages": [entry]}), encoding="utf-8")
        self.assertEqual(
            publisher.load_content_state_manifest(str(manifest_path))["known-page"]["path"],
            "wiki/known-page.html",
        )

    def test_loaded_manifest_policy_record_is_immutable_authorization_evidence(self):
        manifest_path = Path(self.temp.name) / "immutable-manifest.json"
        entry = page_entry("locked-page", None, policy="stub-allowed")
        manifest_path.write_text(
            json.dumps({"pages": [entry]}), encoding="utf-8"
        )
        loaded_entry = publisher.load_content_state_manifest(
            str(manifest_path)
        )["locked-page"]

        with self.assertRaisesRegex(TypeError, "immutable authorization evidence"):
            loaded_entry["automation_policy"] = "replace-sam-block"
        with self.assertRaisesRegex(TypeError, "immutable authorization evidence"):
            loaded_entry.update({"automation_policy": "canon-locked"})
        self.assertEqual(loaded_entry["automation_policy"], "stub-allowed")

    def test_manifest_enforces_page_existence_identity_invariants(self):
        manifest_path = Path(self.temp.name) / "manifest-invariants.json"
        absent = page_entry("future-page", None, policy="stub-allowed")
        mutations = [
            ("content_hash", "sha256:" + "1" * 64),
            ("article_content_hash", "sha256:" + "2" * 64),
            ("article_markup_hash", "sha256:" + "4" * 64),
            ("git_blob_oid", "3" * 40),
            ("automation_policy", "metadata-only"),
        ]
        for field, value in mutations:
            with self.subTest(absent_field=field):
                invalid = {**absent, field: value}
                manifest_path.write_text(
                    json.dumps({"pages": [invalid]}), encoding="utf-8"
                )
                with self.assertRaises(publisher.PublisherSafetyError):
                    publisher.load_content_state_manifest(str(manifest_path))

        existing_html = "<article><p>Existing.</p></article>"
        existing = page_entry("existing-page", existing_html, policy="metadata-only")
        for field in ("content_hash", "article_content_hash", "article_markup_hash", "git_blob_oid"):
            with self.subTest(existing_field=field):
                invalid = {**existing, field: None}
                manifest_path.write_text(
                    json.dumps({"pages": [invalid]}), encoding="utf-8"
                )
                with self.assertRaises(publisher.PublisherSafetyError):
                    publisher.load_content_state_manifest(str(manifest_path))

        invalid = dict(existing)
        invalid.pop("page_exists")
        manifest_path.write_text(json.dumps({"pages": [invalid]}), encoding="utf-8")
        with self.assertRaisesRegex(publisher.PublisherSafetyError, "page_exists"):
            publisher.load_content_state_manifest(str(manifest_path))

    def test_successful_transaction_refreshes_state_for_repeat_noop(self):
        slug = "transaction-page"
        old_html = (
            f"<article>{publisher.SAM_CONTENT_BEGIN}<p>Old.</p>"
            f"{publisher.SAM_CONTENT_END}</article>"
        )
        page_path = self.write_page(slug, old_html)
        old_entry = page_entry(slug, old_html)
        prose = "<p>New transaction prose.</p>"
        first_plan = publisher.plan_item_publish(
            self.item(slug, old_entry, prose), old_entry, wiki_dir=str(self.wiki_dir)
        )
        page_path.chmod(0o640)

        manifest_path = Path(self.temp.name) / "wiki-content-state.json"
        report_path = Path(self.temp.name) / "wiki-rewrite-audit.md"
        sitemap_path = Path(self.temp.name) / "sitemap.xml"
        manifest_path.write_text(json.dumps({"pages": [old_entry]}), encoding="utf-8")
        report_path.write_text("old report\n", encoding="utf-8")
        sitemap_path.write_text("<urlset></urlset>\n", encoding="utf-8")

        def refresh(output_dir):
            current_html = page_path.read_text(encoding="utf-8")
            refreshed_entry = page_entry(slug, current_html)
            write_staged_refresh_outputs(
                output_dir,
                {"pages": [refreshed_entry]},
            )

        result = publisher.execute_publish_transaction(
            [first_plan],
            repo_root=self.temp.name,
            wiki_dir=str(self.wiki_dir),
            sitemap_path=str(sitemap_path),
            manifest_path=str(manifest_path),
            report_path=str(report_path),
            refresh_content_state_fn=refresh,
        )
        self.assertEqual(result["written"], 1)
        self.assertEqual(page_path.stat().st_mode & 0o7777, 0o640)
        refreshed_entry = publisher.load_content_state_manifest(str(manifest_path))[slug]
        repeated_item = self.item(slug, refreshed_entry, prose)
        second_plan = publisher.plan_item_publish(
            repeated_item, refreshed_entry, wiki_dir=str(self.wiki_dir)
        )
        self.assertEqual(second_plan.action, "noop")

    def _assert_manifest_policy_revocation_aborts_before_write(self, policy):
        slug = f"manifest-revoked-{policy}"
        old_html = (
            f"<article>{publisher.SAM_CONTENT_BEGIN}<p>Old.</p>"
            f"{publisher.SAM_CONTENT_END}</article>"
        )
        page_path = self.write_page(slug, old_html)
        allowed_entry = page_entry(slug, old_html)
        root = Path(self.temp.name)
        manifest_path = root / f"{slug}-wiki-content-state.json"
        report_path = root / f"{slug}-wiki-rewrite-audit.md"
        sitemap_path = root / f"{slug}-sitemap.xml"
        allowed_manifest = json.dumps({"pages": [allowed_entry]}).encode("utf-8")
        manifest_path.write_bytes(allowed_manifest)
        report_path.write_text("original report\n", encoding="utf-8")
        sitemap_path.write_text("<urlset></urlset>\n", encoding="utf-8")

        loaded_entry = publisher.load_content_state_manifest(str(manifest_path))[slug]
        plan = publisher.plan_item_publish(
            self.item(slug, loaded_entry, "<p>Must not be written.</p>"),
            loaded_entry,
            wiki_dir=str(self.wiki_dir),
        )
        self.assertEqual(plan.action, "replace-sam-block")

        revoked_entry = {**dict(allowed_entry), "automation_policy": policy}
        revoked_manifest = json.dumps({"pages": [revoked_entry]}).encode("utf-8")
        refresh_executed = False
        manifest_snapshot_count = 0

        def refresh_must_not_run(_output_dir):
            nonlocal refresh_executed
            refresh_executed = True
            self.fail("stale manifest authorization must fail before refresh")

        real_snapshot = publisher._snapshot_anchored

        def revoke_after_transaction_snapshot(target):
            nonlocal manifest_snapshot_count
            snapshot = real_snapshot(target)
            if target.path == str(manifest_path):
                manifest_snapshot_count += 1
                if manifest_snapshot_count == 2:
                    # Land the revocation after transaction setup and its first
                    # authorization assertion, but before the page write loop.
                    manifest_path.write_bytes(revoked_manifest)
            return snapshot

        with mock.patch.object(
            publisher,
            "_snapshot_anchored",
            side_effect=revoke_after_transaction_snapshot,
        ), mock.patch.object(
            publisher,
            "_apply_anchored_write",
            wraps=publisher._apply_anchored_write,
        ) as apply_write:
            with self.assertRaisesRegex(
                publisher.PublisherSafetyError,
                "content-state manifest changed after planning",
            ):
                publisher.execute_publish_transaction(
                    [plan],
                    repo_root=self.temp.name,
                    wiki_dir=str(self.wiki_dir),
                    sitemap_path=str(sitemap_path),
                    manifest_path=str(manifest_path),
                    report_path=str(report_path),
                    refresh_content_state_fn=refresh_must_not_run,
                )
            apply_write.assert_not_called()

        self.assertFalse(refresh_executed)
        self.assertGreaterEqual(manifest_snapshot_count, 3)
        self.assertEqual(page_path.read_text(encoding="utf-8"), old_html)
        self.assertEqual(manifest_path.read_bytes(), revoked_manifest)
        self.assertEqual(report_path.read_text(encoding="utf-8"), "original report\n")
        self.assertEqual(sitemap_path.read_text(encoding="utf-8"), "<urlset></urlset>\n")
        self.assertFalse((root / publisher.PUBLISH_TRANSACTION_LOCK).exists())

    def test_manifest_policy_revocation_to_metadata_only_aborts_before_page_write(self):
        self._assert_manifest_policy_revocation_aborts_before_write("metadata-only")

    def test_manifest_policy_revocation_to_canon_locked_aborts_before_page_write(self):
        self._assert_manifest_policy_revocation_aborts_before_write("canon-locked")

    def test_manifest_revocation_in_transaction_snapshot_aborts_before_page_write(self):
        slug = "manifest-revoked-before-snapshot"
        old_html = (
            f"<article>{publisher.SAM_CONTENT_BEGIN}<p>Old.</p>"
            f"{publisher.SAM_CONTENT_END}</article>"
        )
        page_path = self.write_page(slug, old_html)
        allowed_entry = page_entry(slug, old_html)
        root = Path(self.temp.name)
        manifest_path = root / "wiki-content-state.json"
        report_path = root / "wiki-rewrite-audit.md"
        sitemap_path = root / "sitemap.xml"
        manifest_path.write_bytes(
            json.dumps({"pages": [allowed_entry]}).encode("utf-8")
        )
        report_path.write_text("original report\n", encoding="utf-8")
        sitemap_path.write_text("<urlset></urlset>\n", encoding="utf-8")

        loaded_entry = publisher.load_content_state_manifest(str(manifest_path))[slug]
        plan = publisher.plan_item_publish(
            self.item(slug, loaded_entry, "<p>Must not be written.</p>"),
            loaded_entry,
            wiki_dir=str(self.wiki_dir),
        )
        revoked_entry = {
            **dict(allowed_entry),
            "automation_policy": "metadata-only",
        }
        revoked_manifest = json.dumps({"pages": [revoked_entry]}).encode("utf-8")
        manifest_path.write_bytes(revoked_manifest)

        with mock.patch.object(
            publisher,
            "_apply_anchored_write",
            wraps=publisher._apply_anchored_write,
        ) as apply_write:
            with self.assertRaisesRegex(
                publisher.PublisherSafetyError,
                "content-state manifest changed after planning",
            ):
                publisher.execute_publish_transaction(
                    [plan],
                    repo_root=self.temp.name,
                    wiki_dir=str(self.wiki_dir),
                    sitemap_path=str(sitemap_path),
                    manifest_path=str(manifest_path),
                    report_path=str(report_path),
                    refresh_content_state_fn=lambda _output_dir: self.fail(
                        "captured manifest mismatch must fail before refresh"
                    ),
                )
            apply_write.assert_not_called()

        self.assertEqual(page_path.read_text(encoding="utf-8"), old_html)
        self.assertEqual(manifest_path.read_bytes(), revoked_manifest)
        self.assertEqual(report_path.read_text(encoding="utf-8"), "original report\n")
        self.assertFalse((root / publisher.PUBLISH_TRANSACTION_LOCK).exists())

    def test_article_write_plan_without_loaded_manifest_identity_fails_closed(self):
        slug = "unbound-manifest-plan"
        old_html = (
            f"<article>{publisher.SAM_CONTENT_BEGIN}<p>Old.</p>"
            f"{publisher.SAM_CONTENT_END}</article>"
        )
        page_path = self.write_page(slug, old_html)
        bound_entry = page_entry(slug, old_html)
        plain_entry = dict(bound_entry)
        plan = publisher.plan_item_publish(
            self.item(slug, plain_entry, "<p>Must not be written.</p>"),
            plain_entry,
            wiki_dir=str(self.wiki_dir),
        )
        root = Path(self.temp.name)
        manifest_path = root / "wiki-content-state.json"
        report_path = root / "wiki-rewrite-audit.md"
        sitemap_path = root / "sitemap.xml"
        manifest_path.write_text(
            json.dumps({"pages": [plain_entry]}), encoding="utf-8"
        )
        report_path.write_text("original report\n", encoding="utf-8")
        sitemap_path.write_text("<urlset></urlset>\n", encoding="utf-8")

        with self.assertRaisesRegex(
            publisher.PublisherSafetyError,
            r"plans authorized by load_content_state_manifest\(\)",
        ):
            publisher.execute_publish_transaction(
                [plan],
                repo_root=self.temp.name,
                wiki_dir=str(self.wiki_dir),
                sitemap_path=str(sitemap_path),
                manifest_path=str(manifest_path),
                report_path=str(report_path),
                refresh_content_state_fn=lambda _output_dir: self.fail(
                    "unbound plan must fail before refresh"
                ),
            )

        self.assertEqual(page_path.read_text(encoding="utf-8"), old_html)
        self.assertFalse((root / publisher.PUBLISH_TRANSACTION_LOCK).exists())

    def test_manifest_revocation_during_refresh_is_preserved_without_manifest_write(self):
        slug = "manifest-revoked-during-refresh"
        old_html = (
            f"<article>{publisher.SAM_CONTENT_BEGIN}<p>Old.</p>"
            f"{publisher.SAM_CONTENT_END}</article>"
        )
        page_path = self.write_page(slug, old_html)
        allowed_entry = page_entry(slug, old_html)
        root = Path(self.temp.name)
        manifest_path = root / "wiki-content-state.json"
        report_path = root / "wiki-rewrite-audit.md"
        sitemap_path = root / "sitemap.xml"
        manifest_path.write_bytes(
            json.dumps({"pages": [allowed_entry]}).encode("utf-8")
        )
        report_path.write_text("original report\n", encoding="utf-8")
        sitemap_path.write_text("<urlset></urlset>\n", encoding="utf-8")

        loaded_entry = publisher.load_content_state_manifest(str(manifest_path))[slug]
        plan = publisher.plan_item_publish(
            self.item(slug, loaded_entry, "<p>Planned write.</p>"),
            loaded_entry,
            wiki_dir=str(self.wiki_dir),
        )
        revoked_entry = {
            **dict(allowed_entry),
            "automation_policy": "canon-locked",
        }
        revoked_manifest = json.dumps({"pages": [revoked_entry]}).encode("utf-8")

        def refresh_then_revoke(output_dir):
            write_staged_refresh_outputs(
                output_dir,
                {"pages": [page_entry(slug, plan.html)]},
            )
            manifest_path.write_bytes(revoked_manifest)

        applied_targets = []
        real_apply = publisher._apply_anchored_write

        def record_apply(target, *args, **kwargs):
            applied_targets.append(target.path)
            return real_apply(target, *args, **kwargs)

        with mock.patch.object(
            publisher,
            "_apply_anchored_write",
            side_effect=record_apply,
        ):
            with self.assertRaisesRegex(
                publisher.PublisherSafetyError,
                "publish transaction rolled back: content-state manifest changed",
            ):
                publisher.execute_publish_transaction(
                    [plan],
                    repo_root=self.temp.name,
                    wiki_dir=str(self.wiki_dir),
                    sitemap_path=str(sitemap_path),
                    manifest_path=str(manifest_path),
                    report_path=str(report_path),
                    refresh_content_state_fn=refresh_then_revoke,
                )

        self.assertIn(str(page_path), applied_targets)
        self.assertNotIn(str(manifest_path), applied_targets)
        self.assertEqual(page_path.read_text(encoding="utf-8"), old_html)
        self.assertEqual(manifest_path.read_bytes(), revoked_manifest)
        self.assertEqual(report_path.read_text(encoding="utf-8"), "original report\n")
        self.assertEqual(sitemap_path.read_text(encoding="utf-8"), "<urlset></urlset>\n")
        self.assertFalse((root / publisher.PUBLISH_TRANSACTION_LOCK).exists())

    def test_quarantine_cleanup_failure_reports_committed_without_rollback(self):
        slug = "committed-recovery-residue-page"
        old_html = (
            f"<article>{publisher.SAM_CONTENT_BEGIN}<p>Old.</p>"
            f"{publisher.SAM_CONTENT_END}</article>"
        )
        page_path = self.write_page(slug, old_html)
        entry = page_entry(slug, old_html)
        plan = publisher.plan_item_publish(
            self.item(slug, entry, "<p>Committed despite cleanup failure.</p>"),
            entry,
            wiki_dir=str(self.wiki_dir),
        )
        root = Path(self.temp.name)
        manifest_path = root / "wiki-content-state.json"
        report_path = root / "wiki-rewrite-audit.md"
        sitemap_path = root / "sitemap.xml"
        manifest_path.write_text(json.dumps({"pages": [entry]}), encoding="utf-8")
        report_path.write_text("old report\n", encoding="utf-8")
        sitemap_path.write_text("<urlset></urlset>\n", encoding="utf-8")

        def refresh(output_dir):
            current = page_path.read_text(encoding="utf-8")
            write_staged_refresh_outputs(
                output_dir,
                {"pages": [page_entry(slug, current)]},
                "new report\n",
            )

        real_unlink = publisher.os.unlink
        injected = False

        def fail_first_recovery_cleanup(path, *args, **kwargs):
            nonlocal injected
            if not injected and str(path).startswith(".sam-original-"):
                injected = True
                raise OSError("injected recovery cleanup failure")
            return real_unlink(path, *args, **kwargs)

        with mock.patch.object(
            publisher, "_require_safe_transaction_primitives"
        ), mock.patch.object(
            publisher.os, "unlink", side_effect=fail_first_recovery_cleanup
        ):
            with self.assertRaisesRegex(
                publisher.PublisherSafetyError,
                "publish committed but could not remove recovery copies",
            ):
                publisher.execute_publish_transaction(
                    [plan],
                    repo_root=self.temp.name,
                    wiki_dir=str(self.wiki_dir),
                    sitemap_path=str(sitemap_path),
                    manifest_path=str(manifest_path),
                    report_path=str(report_path),
                    refresh_content_state_fn=refresh,
                )

        self.assertTrue(injected)
        self.assertEqual(page_path.read_text(encoding="utf-8"), plan.html)
        recovery = list(self.wiki_dir.glob(".sam-original-*"))
        self.assertEqual(len(recovery), 1)
        self.assertEqual(recovery[0].read_text(encoding="utf-8"), old_html)
        self.assertFalse((root / publisher.PUBLISH_TRANSACTION_LOCK).exists())

    def test_stub_creation_consumes_one_shot_registry_but_refresh_does_not(self):
        slug = "authorized-new-stub"
        absent_entry = page_entry(slug, None, policy="stub-allowed")
        first_item = {
            "slug": slug,
            "title": "Authorized New Stub",
            "summary": "Initial metadata summary.",
        }
        first_plan = publisher.plan_item_publish(
            first_item, absent_entry, wiki_dir=str(self.wiki_dir)
        )
        self.assertTrue(first_plan.creates_page)

        manifest_path = Path(self.temp.name) / "wiki-content-state.json"
        report_path = Path(self.temp.name) / "wiki-rewrite-audit.md"
        sitemap_path = Path(self.temp.name) / "sitemap.xml"
        absent_stubs_path = Path(self.temp.name) / "wiki-absent-stubs.json"
        page_path = self.wiki_dir / f"{slug}.html"
        manifest_path.write_text(json.dumps({"pages": [absent_entry]}), encoding="utf-8")
        report_path.write_text("absent report\n", encoding="utf-8")
        sitemap_path.write_text(
            '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>\n',
            encoding="utf-8",
        )
        absent_stubs_path.write_text(json.dumps({
            "schema_version": 1,
            "absent_stub_slugs": [slug],
        }), encoding="utf-8")

        refresh_calls = 0

        def refresh(output_dir):
            nonlocal refresh_calls
            registry = json.loads(absent_stubs_path.read_text(encoding="utf-8"))
            if refresh_calls == 0:
                self.assertEqual(registry["absent_stub_slugs"], [])
            refresh_calls += 1
            current_html = page_path.read_text(encoding="utf-8")
            write_staged_refresh_outputs(
                output_dir,
                {
                    "pages": [
                        page_entry(slug, current_html, policy="stub-allowed")
                    ],
                },
                "existing stub report\n",
            )

        publisher.execute_publish_transaction(
            [first_plan],
            repo_root=self.temp.name,
            wiki_dir=str(self.wiki_dir),
            sitemap_path=str(sitemap_path),
            manifest_path=str(manifest_path),
            report_path=str(report_path),
            absent_stubs_path=str(absent_stubs_path),
            refresh_content_state_fn=refresh,
        )
        self.assertEqual(
            json.loads(absent_stubs_path.read_text(encoding="utf-8"))["absent_stub_slugs"],
            [],
        )

        # The exact original creation payload has no expected_content_hash. Once
        # committed, it must replay as a no-op without needing the consumed grant.
        existing_entry = publisher.load_content_state_manifest(str(manifest_path))[slug]
        retry_plan = publisher.plan_item_publish(
            first_item, existing_entry, wiki_dir=str(self.wiki_dir)
        )
        self.assertEqual(retry_plan.action, "noop")
        retry_result = publisher.execute_publish_transaction(
            [retry_plan],
            repo_root=self.temp.name,
            wiki_dir=str(self.wiki_dir),
            sitemap_path=str(sitemap_path),
            manifest_path=str(manifest_path),
            report_path=str(report_path),
            absent_stubs_path=str(absent_stubs_path),
            refresh_content_state_fn=refresh,
        )
        self.assertEqual(retry_result["noops"], 1)
        self.assertEqual(refresh_calls, 1)

        # Updating an already existing explicit stub must not consume unrelated
        # future authorization records.
        future_slug = "future-stub"
        absent_stubs_path.write_text(json.dumps({
            "schema_version": 1,
            "absent_stub_slugs": [future_slug],
        }), encoding="utf-8")
        refresh_item = {
            "slug": slug,
            "title": "Authorized New Stub",
            "summary": "Updated metadata summary.",
            "expected_content_hash": existing_entry["content_hash"],
        }
        refresh_plan = publisher.plan_item_publish(
            refresh_item, existing_entry, wiki_dir=str(self.wiki_dir)
        )
        self.assertFalse(refresh_plan.creates_page)
        publisher.execute_publish_transaction(
            [refresh_plan],
            repo_root=self.temp.name,
            wiki_dir=str(self.wiki_dir),
            sitemap_path=str(sitemap_path),
            manifest_path=str(manifest_path),
            report_path=str(report_path),
            absent_stubs_path=str(absent_stubs_path),
            refresh_content_state_fn=refresh,
        )
        self.assertEqual(
            json.loads(absent_stubs_path.read_text(encoding="utf-8"))["absent_stub_slugs"],
            [future_slug],
        )

    def test_repository_lock_fails_closed_and_is_removed_by_its_owner(self):
        lock_path = Path(self.temp.name) / publisher.PUBLISH_TRANSACTION_LOCK
        with publisher.repository_publish_lock(self.temp.name) as held_lock:
            self.assertTrue(held_lock.active)
            self.assertTrue(lock_path.is_dir())
            with self.assertRaisesRegex(
                publisher.PublisherSafetyError, "PUBLISH_TRANSACTION_LOCKED"
            ):
                with publisher.repository_publish_lock(self.temp.name):
                    self.fail("a second publisher must not acquire the lock")
        self.assertFalse(lock_path.exists())

    def test_interrupted_lock_acquisition_removes_the_created_directory(self):
        lock_path = Path(self.temp.name) / publisher.PUBLISH_TRANSACTION_LOCK
        real_mkdir = publisher.os.mkdir

        def mkdir_then_interrupt(path, mode=0o777, *, dir_fd=None):
            real_mkdir(path, mode, dir_fd=dir_fd)
            raise KeyboardInterrupt

        with mock.patch.object(
            publisher, "_require_safe_transaction_primitives"
        ), mock.patch.object(publisher.os, "mkdir", side_effect=mkdir_then_interrupt):
            with self.assertRaises(KeyboardInterrupt):
                with publisher.repository_publish_lock(self.temp.name):
                    self.fail("interrupted acquisition must not yield a lock")
        self.assertFalse(lock_path.exists())

    def test_repository_lock_release_stays_bound_after_root_path_swap(self):
        outer = Path(self.temp.name)
        repo = outer / "lock-repo"
        moved_repo = outer / "lock-repo-moved"
        outside = outer / "lock-outside"
        repo.mkdir()
        outside.mkdir()
        outside_lock = outside / publisher.PUBLISH_TRANSACTION_LOCK
        outside_lock.mkdir()

        try:
            with publisher.repository_publish_lock(str(repo)):
                repo.rename(moved_repo)
                repo.symlink_to(outside, target_is_directory=True)
            self.assertTrue(outside_lock.is_dir())
            self.assertFalse(
                (moved_repo / publisher.PUBLISH_TRANSACTION_LOCK).exists()
            )
        finally:
            if repo.is_symlink():
                repo.unlink()
            if moved_repo.exists():
                moved_repo.rename(repo)

    def test_transaction_rejects_replacement_root_not_owned_by_held_lock(self):
        outer = Path(self.temp.name)
        repo = outer / "transaction-root"
        moved_repo = outer / "transaction-root-moved"
        wiki = repo / "wiki"
        wiki.mkdir(parents=True)
        page_path = wiki / "root-swap-page.html"
        original_bytes = b"ORIGINAL-LOCKED-ROOT"
        replacement_bytes = b"REPLACEMENT-ROOT-SENTINEL"
        page_path.write_bytes(original_bytes)
        plan = publisher.PublishPlan(
            "replace-sam-block",
            str(page_path),
            "PUBLISH-MUST-NOT-RUN",
            base_content_hash=publisher.sha256_bytes(replacement_bytes),
        )

        with publisher.repository_publish_lock(str(repo)) as held_lock:
            repo.rename(moved_repo)
            replacement_wiki = repo / "wiki"
            replacement_wiki.mkdir(parents=True)
            replacement_page = replacement_wiki / page_path.name
            replacement_page.write_bytes(replacement_bytes)
            (repo / "manifest.json").write_text("{}", encoding="utf-8")
            (repo / "report.md").write_text("report\n", encoding="utf-8")
            (repo / "sitemap.xml").write_text("<urlset/>\n", encoding="utf-8")

            with self.assertRaisesRegex(
                publisher.PublisherSafetyError,
                "repository root does not match the held publish lock",
            ):
                publisher.execute_publish_transaction(
                    [plan],
                    repo_root=str(repo),
                    wiki_dir=str(replacement_wiki),
                    sitemap_path=str(repo / "sitemap.xml"),
                    manifest_path=str(repo / "manifest.json"),
                    report_path=str(repo / "report.md"),
                    refresh_content_state_fn=lambda _output_dir: self.fail("refresh must not run"),
                    transaction_lock=held_lock,
                )

            self.assertEqual(replacement_page.read_bytes(), replacement_bytes)
            self.assertEqual(
                (moved_repo / "wiki" / page_path.name).read_bytes(), original_bytes
            )

        self.assertFalse((moved_repo / publisher.PUBLISH_TRANSACTION_LOCK).exists())
        self.assertFalse((repo / publisher.PUBLISH_TRANSACTION_LOCK).exists())

    def test_default_refresh_stages_outputs_away_from_swapped_brand_canon(self):
        root = Path(self.temp.name)
        brand = root / "brand-canon"
        moved_brand = root / "brand-canon-moved"
        outside = root / "outside-brand"
        brand.mkdir()
        outside.mkdir()
        outside_manifest = outside / "wiki-content-state.json"
        outside_report = outside / "wiki-rewrite-audit.md"
        outside_manifest.write_bytes(b"OUTSIDE-MANIFEST")
        outside_report.write_bytes(b"OUTSIDE-REPORT")
        generated_manifest = b'{"pages": []}\n'
        generated_report = b"generated report\n"

        def staged_generator(command, **kwargs):
            self.assertIn("--output-fd", command)
            output_fd = int(command[command.index("--output-fd") + 1])
            self.assertEqual(kwargs["pass_fds"], (output_fd,))
            output_dir = Path(f"/proc/self/fd/{output_fd}")
            brand.rename(moved_brand)
            brand.symlink_to(outside, target_is_directory=True)
            (output_dir / "wiki-content-state.json").write_bytes(generated_manifest)
            (output_dir / "wiki-rewrite-audit.md").write_bytes(generated_report)
            return publisher.subprocess.CompletedProcess(command, 0, "", "")

        try:
            with mock.patch.object(
                publisher.subprocess, "run", side_effect=staged_generator
            ):
                actual_manifest, actual_report = publisher.refresh_content_state_artifacts(
                    repo_root=str(root),
                    generator_path=str(root / "generator.mjs"),
                )
            self.assertEqual(actual_manifest, generated_manifest)
            self.assertEqual(actual_report, generated_report)
            self.assertEqual(outside_manifest.read_bytes(), b"OUTSIDE-MANIFEST")
            self.assertEqual(outside_report.read_bytes(), b"OUTSIDE-REPORT")
        finally:
            if brand.is_symlink():
                brand.unlink()
            if moved_brand.exists():
                moved_brand.rename(brand)

    def test_custom_staging_fd_survives_path_rename_and_replacement(self):
        outside = Path(self.temp.name) / "outside-staging"
        outside.mkdir()
        outside_manifest = outside / "wiki-content-state.json"
        outside_report = outside / "wiki-rewrite-audit.md"
        outside_manifest.write_bytes(b"OUTSIDE-MANIFEST")
        outside_report.write_bytes(b"OUTSIDE-REPORT")
        generated_manifest = b'{"pages": []}\n'
        generated_report = b"anchored staged report\n"
        private_parent = None
        moved_output = None

        def swap_staging_path(output_anchor):
            nonlocal private_parent, moved_output
            real_output = Path(os.readlink(output_anchor))
            private_parent = real_output.parent
            moved_output = real_output.with_name("output-moved")
            real_output.rename(moved_output)
            real_output.symlink_to(outside, target_is_directory=True)
            write_staged_refresh_outputs(
                output_anchor,
                generated_manifest,
                generated_report,
            )

        try:
            with self.assertRaisesRegex(
                publisher.PublisherSafetyError, "staged refresh cleanup conflict"
            ):
                publisher._run_staged_refresh_callback(swap_staging_path)

            self.assertEqual(outside_manifest.read_bytes(), b"OUTSIDE-MANIFEST")
            self.assertEqual(outside_report.read_bytes(), b"OUTSIDE-REPORT")
            self.assertIsNotNone(private_parent)
            self.assertTrue(private_parent.exists())
            self.assertFalse(moved_output.exists())
        finally:
            if private_parent is not None and private_parent.exists():
                replacement_output = private_parent / "output"
                if replacement_output.is_symlink():
                    replacement_output.unlink()
                private_parent.rmdir()

    def test_staging_parent_replacement_victim_is_never_deleted(self):
        moved_parent = None
        replacement_parent = None
        victim = None

        def replace_staging_parent(output_anchor):
            nonlocal moved_parent, replacement_parent, victim
            real_output = Path(os.readlink(output_anchor))
            replacement_parent = real_output.parent
            moved_parent = replacement_parent.with_name(
                replacement_parent.name + "-moved"
            )
            replacement_parent.rename(moved_parent)
            replacement_parent.mkdir()
            victim = replacement_parent / "victim.txt"
            victim.write_bytes(b"REPLACEMENT-VICTIM")
            write_staged_refresh_outputs(
                output_anchor,
                b'{"pages": []}\n',
                b"anchored report\n",
            )

        try:
            with self.assertRaisesRegex(
                publisher.PublisherSafetyError,
                "staging parent identity changed.*replacement preserved",
            ):
                publisher._run_staged_refresh_callback(replace_staging_parent)

            self.assertIsNotNone(victim)
            self.assertEqual(victim.read_bytes(), b"REPLACEMENT-VICTIM")
            self.assertTrue(moved_parent.is_dir())
            self.assertEqual(list(moved_parent.iterdir()), [])
        finally:
            if victim is not None and victim.exists():
                victim.unlink()
            if replacement_parent is not None and replacement_parent.exists():
                replacement_parent.rmdir()
            if moved_parent is not None and moved_parent.exists():
                moved_parent.rmdir()

    def test_transaction_rejects_targets_outside_the_locked_repository(self):
        repo_root = Path(self.temp.name) / "repo-a"
        shared_wiki = Path(self.temp.name) / "shared" / "wiki"
        (repo_root / "wiki").mkdir(parents=True)
        shared_wiki.mkdir(parents=True)
        page_path = shared_wiki / "shared-page.html"
        page_path.write_text("old", encoding="utf-8")
        plan = publisher.PublishPlan(
            "replace-sam-block",
            str(page_path),
            "new",
            base_content_hash=publisher.sha256_bytes(b"old"),
        )

        with self.assertRaisesRegex(
            publisher.PublisherSafetyError, "wiki directory must be"
        ):
            publisher.execute_publish_transaction(
                [plan],
                repo_root=str(repo_root),
                wiki_dir=str(shared_wiki),
                sitemap_path=str(repo_root / "sitemap.xml"),
                manifest_path=str(repo_root / "manifest.json"),
                report_path=str(repo_root / "report.md"),
                refresh_content_state_fn=lambda _output_dir: self.fail("refresh must not run"),
            )

        self.assertEqual(page_path.read_text(encoding="utf-8"), "old")
        self.assertFalse((repo_root / publisher.PUBLISH_TRANSACTION_LOCK).exists())

    def test_transaction_rejects_symlinked_wiki_and_artifact_paths(self):
        root = Path(self.temp.name)
        repo_with_linked_wiki = root / "repo-linked-wiki"
        outside_wiki = root / "outside-wiki"
        repo_with_linked_wiki.mkdir()
        outside_wiki.mkdir()
        (repo_with_linked_wiki / "wiki").symlink_to(
            outside_wiki, target_is_directory=True
        )
        escaped_page = outside_wiki / "escaped.html"
        escaped_page.write_text("old", encoding="utf-8")
        escaped_plan = publisher.PublishPlan(
            "replace-sam-block",
            str(repo_with_linked_wiki / "wiki" / "escaped.html"),
            "new",
            base_content_hash=publisher.sha256_bytes(b"old"),
        )

        with self.assertRaisesRegex(publisher.PublisherSafetyError, "symbolic link"):
            publisher.execute_publish_transaction(
                [escaped_plan],
                repo_root=str(repo_with_linked_wiki),
                wiki_dir=str(repo_with_linked_wiki / "wiki"),
                sitemap_path=str(repo_with_linked_wiki / "sitemap.xml"),
                manifest_path=str(repo_with_linked_wiki / "manifest.json"),
                report_path=str(repo_with_linked_wiki / "report.md"),
                refresh_content_state_fn=lambda _output_dir: self.fail("refresh must not run"),
            )
        self.assertEqual(escaped_page.read_text(encoding="utf-8"), "old")

        repo_with_linked_artifact = root / "repo-linked-artifact"
        wiki_dir = repo_with_linked_artifact / "wiki"
        wiki_dir.mkdir(parents=True)
        page_path = wiki_dir / "safe.html"
        page_path.write_text("old", encoding="utf-8")
        outside_manifest = root / "outside-manifest.json"
        outside_manifest.write_text("outside", encoding="utf-8")
        linked_manifest = repo_with_linked_artifact / "manifest.json"
        linked_manifest.symlink_to(outside_manifest)
        plan = publisher.PublishPlan(
            "replace-sam-block",
            str(page_path),
            "new",
            base_content_hash=publisher.sha256_bytes(b"old"),
        )

        with self.assertRaisesRegex(publisher.PublisherSafetyError, "symbolic link"):
            publisher.execute_publish_transaction(
                [plan],
                repo_root=str(repo_with_linked_artifact),
                wiki_dir=str(wiki_dir),
                sitemap_path=str(repo_with_linked_artifact / "sitemap.xml"),
                manifest_path=str(linked_manifest),
                report_path=str(repo_with_linked_artifact / "report.md"),
                refresh_content_state_fn=lambda _output_dir: self.fail("refresh must not run"),
            )
        self.assertEqual(page_path.read_text(encoding="utf-8"), "old")
        self.assertEqual(outside_manifest.read_text(encoding="utf-8"), "outside")
        self.assertFalse(
            (repo_with_linked_artifact / publisher.PUBLISH_TRANSACTION_LOCK).exists()
        )

    def test_noop_plan_is_revalidated_under_the_transaction_lock(self):
        slug = "noop-race-page"
        prose = "<p>Committed.</p>"
        html = (
            f"<article>{publisher.SAM_CONTENT_BEGIN}{prose}"
            f"{publisher.SAM_CONTENT_END}</article>"
        )
        page_path = self.write_page(slug, html)
        entry = page_entry(slug, html)
        plan = publisher.plan_item_publish(
            self.item(slug, entry, prose), entry, wiki_dir=str(self.wiki_dir)
        )
        self.assertEqual(plan.action, "noop")
        reset_html = html.replace("Committed.", "Reset won.")
        page_path.write_text(reset_html, encoding="utf-8")

        root = Path(self.temp.name)
        with self.assertRaisesRegex(publisher.PublisherSafetyError, "stale revision"):
            publisher.execute_publish_transaction(
                [plan],
                repo_root=self.temp.name,
                wiki_dir=str(self.wiki_dir),
                sitemap_path=str(root / "sitemap.xml"),
                manifest_path=str(root / "manifest.json"),
                report_path=str(root / "report.md"),
                refresh_content_state_fn=lambda _output_dir: self.fail("refresh must not run"),
            )

        self.assertEqual(page_path.read_text(encoding="utf-8"), reset_html)
        self.assertFalse((root / publisher.PUBLISH_TRANSACTION_LOCK).exists())

    def test_transaction_rejects_duplicate_guarded_page_targets(self):
        slug = "duplicate-target-page"
        prose = "<p>Committed.</p>"
        html = (
            f"<article>{publisher.SAM_CONTENT_BEGIN}{prose}"
            f"{publisher.SAM_CONTENT_END}</article>"
        )
        self.write_page(slug, html)
        entry = page_entry(slug, html)
        plan = publisher.plan_item_publish(
            self.item(slug, entry, prose), entry, wiki_dir=str(self.wiki_dir)
        )
        root = Path(self.temp.name)

        with self.assertRaisesRegex(
            publisher.PublisherSafetyError, "duplicate guarded publish target"
        ):
            publisher.execute_publish_transaction(
                [plan, plan],
                repo_root=self.temp.name,
                wiki_dir=str(self.wiki_dir),
                sitemap_path=str(root / "sitemap.xml"),
                manifest_path=str(root / "manifest.json"),
                report_path=str(root / "report.md"),
                refresh_content_state_fn=lambda _output_dir: self.fail("refresh must not run"),
            )

        self.assertFalse((root / publisher.PUBLISH_TRANSACTION_LOCK).exists())

    def test_snapshot_base_validation_preserves_a_reset_that_wins_before_snapshot(self):
        slug = "reset-race-page"
        old_html = (
            f"<article>{publisher.SAM_CONTENT_BEGIN}<p>Old.</p>"
            f"{publisher.SAM_CONTENT_END}</article>"
        )
        reset_html = (
            f"<article>{publisher.SAM_CONTENT_BEGIN}<p>Reset won.</p>"
            f"{publisher.SAM_CONTENT_END}</article>"
        )
        page_path = self.write_page(slug, old_html)
        entry = page_entry(slug, old_html)
        plan = publisher.plan_item_publish(
            self.item(slug, entry, "<p>Planned write.</p>"),
            entry,
            wiki_dir=str(self.wiki_dir),
        )
        manifest_path = Path(self.temp.name) / "wiki-content-state.json"
        report_path = Path(self.temp.name) / "wiki-rewrite-audit.md"
        sitemap_path = Path(self.temp.name) / "sitemap.xml"
        manifest_path.write_text(json.dumps({"pages": [entry]}), encoding="utf-8")
        report_path.write_text("report\n", encoding="utf-8")
        sitemap_path.write_text("<urlset></urlset>\n", encoding="utf-8")
        original_snapshot = publisher._snapshot_anchored
        reset_applied = False

        def snapshot_after_reset(target):
            nonlocal reset_applied
            if target.path == os.path.abspath(page_path) and not reset_applied:
                page_path.write_text(reset_html, encoding="utf-8")
                reset_applied = True
            return original_snapshot(target)

        with mock.patch.object(
            publisher, "_snapshot_anchored", side_effect=snapshot_after_reset
        ):
            with self.assertRaisesRegex(publisher.PublisherSafetyError, "stale revision"):
                publisher.execute_publish_transaction(
                    [plan],
                    repo_root=self.temp.name,
                    wiki_dir=str(self.wiki_dir),
                    sitemap_path=str(sitemap_path),
                    manifest_path=str(manifest_path),
                    report_path=str(report_path),
                    refresh_content_state_fn=lambda _output_dir: self.fail("refresh must not run"),
                )

        self.assertTrue(reset_applied)
        self.assertEqual(page_path.read_text(encoding="utf-8"), reset_html)
        self.assertFalse((Path(self.temp.name) / publisher.PUBLISH_TRANSACTION_LOCK).exists())

    def test_atomic_write_removes_temporary_file_on_keyboard_interrupt(self):
        target = Path(self.temp.name) / "interrupted.html"
        with mock.patch.object(
            publisher, "_link_no_replace", side_effect=KeyboardInterrupt
        ):
            with self.assertRaises(KeyboardInterrupt):
                publisher.atomic_write_bytes(str(target), b"new bytes", 0o644)
        self.assertFalse(target.exists())
        self.assertEqual(list(Path(self.temp.name).glob(".sam-publish-*")), [])
        self.assertEqual(list(Path(self.temp.name).glob(".sam-original-*")), [])

    def test_atomic_write_cleans_up_if_open_is_interrupted_after_create(self):
        target = Path(self.temp.name) / "open-interrupted.html"
        real_write = publisher.os.write
        interrupted = False

        def write_then_interrupt(fd, content):
            nonlocal interrupted
            written = real_write(fd, content)
            if not interrupted:
                interrupted = True
                raise KeyboardInterrupt
            return written

        with mock.patch.object(publisher.os, "write", side_effect=write_then_interrupt):
            with self.assertRaises(KeyboardInterrupt):
                publisher.atomic_write_bytes(str(target), b"new bytes", 0o644)
        self.assertTrue(interrupted)
        self.assertFalse(target.exists())
        self.assertEqual(list(Path(self.temp.name).glob(".sam-publish-*")), [])

    def test_wiki_parent_swap_during_refresh_cannot_redirect_rollback(self):
        slug = "parent-swap-page"
        old_html = (
            f"<article>{publisher.SAM_CONTENT_BEGIN}<p>Old.</p>"
            f"{publisher.SAM_CONTENT_END}</article>"
        )
        planned_prose = "<p>Planned transaction bytes.</p>"
        page_path = self.write_page(slug, old_html)
        entry = page_entry(slug, old_html)
        plan = publisher.plan_item_publish(
            self.item(slug, entry, planned_prose),
            entry,
            wiki_dir=str(self.wiki_dir),
        )
        root = Path(self.temp.name)
        manifest_path = root / "wiki-content-state.json"
        report_path = root / "wiki-rewrite-audit.md"
        sitemap_path = root / "sitemap.xml"
        manifest_path.write_text(json.dumps({"pages": [entry]}), encoding="utf-8")
        report_path.write_text("original report\n", encoding="utf-8")
        sitemap_path.write_text("<urlset></urlset>\n", encoding="utf-8")

        outside = root / "outside-wiki"
        outside.mkdir()
        outside_page = outside / page_path.name
        outside_bytes = b"OUTSIDE-SENTINEL\x00\xff"
        outside_page.write_bytes(outside_bytes)
        moved_wiki = root / "wiki-moved-by-attacker"

        def swap_parent_then_fail(_output_dir):
            self.assertEqual(page_path.read_text(encoding="utf-8"), plan.html)
            self.wiki_dir.rename(moved_wiki)
            self.wiki_dir.symlink_to(outside, target_is_directory=True)
            raise RuntimeError("injected parent swap")

        try:
            with self.assertRaisesRegex(
                publisher.PublisherSafetyError, "publish transaction rolled back"
            ):
                publisher.execute_publish_transaction(
                    [plan],
                    repo_root=self.temp.name,
                    wiki_dir=str(self.wiki_dir),
                    sitemap_path=str(sitemap_path),
                    manifest_path=str(manifest_path),
                    report_path=str(report_path),
                    refresh_content_state_fn=swap_parent_then_fail,
                )

            self.assertEqual(outside_page.read_bytes(), outside_bytes)
            self.assertEqual((moved_wiki / page_path.name).read_text(encoding="utf-8"), old_html)
            self.assertEqual(list(outside.glob(".sam-*")), [])
            self.assertEqual(list(moved_wiki.glob(".sam-*")), [])
            self.assertFalse((root / publisher.PUBLISH_TRANSACTION_LOCK).exists())
        finally:
            if self.wiki_dir.is_symlink():
                self.wiki_dir.unlink()
            if moved_wiki.exists():
                moved_wiki.rename(self.wiki_dir)

    def test_staged_refresh_artifact_parent_swap_cannot_write_outside(self):
        slug = "artifact-parent-swap-page"
        old_html = (
            f"<article>{publisher.SAM_CONTENT_BEGIN}<p>Old.</p>"
            f"{publisher.SAM_CONTENT_END}</article>"
        )
        page_path = self.write_page(slug, old_html)
        entry = page_entry(slug, old_html)
        plan = publisher.plan_item_publish(
            self.item(slug, entry, "<p>Planned.</p>"),
            entry,
            wiki_dir=str(self.wiki_dir),
        )
        root = Path(self.temp.name)
        artifacts = root / "artifacts"
        moved_artifacts = root / "artifacts-moved"
        outside = root / "outside-artifacts"
        artifacts.mkdir()
        outside.mkdir()
        manifest_path = artifacts / "wiki-content-state.json"
        report_path = artifacts / "wiki-rewrite-audit.md"
        sitemap_path = root / "sitemap.xml"
        manifest_path.write_text(json.dumps({"pages": [entry]}), encoding="utf-8")
        report_path.write_text("original report\n", encoding="utf-8")
        sitemap_path.write_text("<urlset></urlset>\n", encoding="utf-8")
        outside_manifest = outside / manifest_path.name
        outside_report = outside / report_path.name
        outside_manifest.write_bytes(b"OUTSIDE-MANIFEST")
        outside_report.write_bytes(b"OUTSIDE-REPORT")

        def staged_refresh(output_dir):
            artifacts.rename(moved_artifacts)
            artifacts.symlink_to(outside, target_is_directory=True)
            write_staged_refresh_outputs(
                output_dir,
                {"pages": [page_entry(slug, plan.html)]},
            )

        try:
            with self.assertRaisesRegex(
                publisher.PublisherSafetyError, "publish transaction rolled back"
            ):
                publisher.execute_publish_transaction(
                    [plan],
                    repo_root=self.temp.name,
                    wiki_dir=str(self.wiki_dir),
                    sitemap_path=str(sitemap_path),
                    manifest_path=str(manifest_path),
                    report_path=str(report_path),
                    refresh_content_state_fn=staged_refresh,
                )

            self.assertEqual(outside_manifest.read_bytes(), b"OUTSIDE-MANIFEST")
            self.assertEqual(outside_report.read_bytes(), b"OUTSIDE-REPORT")
            self.assertEqual(page_path.read_text(encoding="utf-8"), old_html)
            self.assertEqual(
                (moved_artifacts / manifest_path.name).read_text(encoding="utf-8"),
                json.dumps({"pages": [entry]}),
            )
        finally:
            if artifacts.is_symlink():
                artifacts.unlink()
            if moved_artifacts.exists():
                moved_artifacts.rename(artifacts)

    def test_legacy_live_path_refresh_callback_is_rejected_before_execution(self):
        slug = "legacy-refresh-contract-page"
        old_html = (
            f"<article>{publisher.SAM_CONTENT_BEGIN}<p>Old.</p>"
            f"{publisher.SAM_CONTENT_END}</article>"
        )
        page_path = self.write_page(slug, old_html)
        entry = page_entry(slug, old_html)
        plan = publisher.plan_item_publish(
            self.item(slug, entry, "<p>Planned.</p>"),
            entry,
            wiki_dir=str(self.wiki_dir),
        )
        root = Path(self.temp.name)
        manifest_path = root / "manifest.json"
        report_path = root / "report.md"
        sitemap_path = root / "sitemap.xml"
        manifest_path.write_text(json.dumps({"pages": [entry]}), encoding="utf-8")
        report_path.write_text("original report\n", encoding="utf-8")
        sitemap_path.write_text("<urlset></urlset>\n", encoding="utf-8")
        callback_executed = False

        def legacy_live_path_refresh():
            nonlocal callback_executed
            callback_executed = True
            manifest_path.write_text("unsafe live write", encoding="utf-8")

        with self.assertRaisesRegex(
            publisher.PublisherSafetyError, "takes 0 positional arguments"
        ):
            publisher.execute_publish_transaction(
                [plan],
                repo_root=self.temp.name,
                wiki_dir=str(self.wiki_dir),
                sitemap_path=str(sitemap_path),
                manifest_path=str(manifest_path),
                report_path=str(report_path),
                refresh_content_state_fn=legacy_live_path_refresh,
            )

        self.assertFalse(callback_executed)
        self.assertEqual(page_path.read_text(encoding="utf-8"), old_html)
        self.assertEqual(
            manifest_path.read_text(encoding="utf-8"),
            json.dumps({"pages": [entry]}),
        )

    def test_concurrent_page_edit_during_refresh_is_preserved_as_rollback_conflict(self):
        slug = "concurrent-refresh-page"
        old_html = (
            f"<article>{publisher.SAM_CONTENT_BEGIN}<p>Old.</p>"
            f"{publisher.SAM_CONTENT_END}</article>"
        )
        concurrent_html = (
            f"<article>{publisher.SAM_CONTENT_BEGIN}<p>Concurrent winner.</p>"
            f"{publisher.SAM_CONTENT_END}</article>"
        )
        page_path = self.write_page(slug, old_html)
        entry = page_entry(slug, old_html)
        plan = publisher.plan_item_publish(
            self.item(slug, entry, "<p>Planned write.</p>"),
            entry,
            wiki_dir=str(self.wiki_dir),
        )
        root = Path(self.temp.name)
        manifest_path = root / "wiki-content-state.json"
        report_path = root / "wiki-rewrite-audit.md"
        sitemap_path = root / "sitemap.xml"
        original_manifest = json.dumps({"pages": [entry]})
        manifest_path.write_text(original_manifest, encoding="utf-8")
        report_path.write_text("original report\n", encoding="utf-8")
        sitemap_path.write_text("<urlset></urlset>\n", encoding="utf-8")

        def refresh_then_concurrent_edit(output_dir):
            planned_entry = page_entry(slug, page_path.read_text(encoding="utf-8"))
            write_staged_refresh_outputs(
                output_dir,
                {"pages": [planned_entry]},
            )
            page_path.write_text(concurrent_html, encoding="utf-8")

        with self.assertRaisesRegex(
            publisher.PublisherSafetyError, "PUBLISH_TRANSACTION_ROLLBACK_CONFLICT"
        ):
            publisher.execute_publish_transaction(
                [plan],
                repo_root=self.temp.name,
                wiki_dir=str(self.wiki_dir),
                sitemap_path=str(sitemap_path),
                manifest_path=str(manifest_path),
                report_path=str(report_path),
                refresh_content_state_fn=refresh_then_concurrent_edit,
            )

        self.assertEqual(page_path.read_text(encoding="utf-8"), concurrent_html)
        recovery = list(self.wiki_dir.glob(".sam-original-*"))
        self.assertEqual(len(recovery), 1)
        self.assertEqual(recovery[0].read_text(encoding="utf-8"), old_html)
        self.assertEqual(manifest_path.read_text(encoding="utf-8"), original_manifest)
        self.assertEqual(report_path.read_text(encoding="utf-8"), "original report\n")
        self.assertFalse((root / publisher.PUBLISH_TRANSACTION_LOCK).exists())

    def test_concurrent_page_deletion_is_preserved_as_rollback_conflict(self):
        slug = "concurrent-delete-page"
        old_html = (
            f"<article>{publisher.SAM_CONTENT_BEGIN}<p>Old.</p>"
            f"{publisher.SAM_CONTENT_END}</article>"
        )
        page_path = self.write_page(slug, old_html)
        entry = page_entry(slug, old_html)
        plan = publisher.plan_item_publish(
            self.item(slug, entry, "<p>Planned write.</p>"),
            entry,
            wiki_dir=str(self.wiki_dir),
        )
        root = Path(self.temp.name)
        manifest_path = root / "wiki-content-state.json"
        report_path = root / "wiki-rewrite-audit.md"
        sitemap_path = root / "sitemap.xml"
        manifest_path.write_text(json.dumps({"pages": [entry]}), encoding="utf-8")
        report_path.write_text("original report\n", encoding="utf-8")
        sitemap_path.write_text("<urlset></urlset>\n", encoding="utf-8")

        def refresh_then_delete(output_dir):
            write_staged_refresh_outputs(
                output_dir,
                {"pages": [page_entry(slug, plan.html)]},
            )
            page_path.unlink()

        with self.assertRaisesRegex(
            publisher.PublisherSafetyError,
            "PUBLISH_TRANSACTION_ROLLBACK_CONFLICT.*concurrent deletion preserved",
        ):
            publisher.execute_publish_transaction(
                [plan],
                repo_root=self.temp.name,
                wiki_dir=str(self.wiki_dir),
                sitemap_path=str(sitemap_path),
                manifest_path=str(manifest_path),
                report_path=str(report_path),
                refresh_content_state_fn=refresh_then_delete,
            )

        self.assertFalse(page_path.exists())
        recovery = list(self.wiki_dir.glob(".sam-original-*"))
        self.assertEqual(len(recovery), 1)
        self.assertEqual(recovery[0].read_text(encoding="utf-8"), old_html)
        self.assertFalse((root / publisher.PUBLISH_TRANSACTION_LOCK).exists())

    def test_refresh_cannot_accept_manifest_for_non_planned_page_bytes(self):
        slug = "matching-concurrent-manifest-page"
        old_html = (
            f"<article>{publisher.SAM_CONTENT_BEGIN}<p>Old.</p>"
            f"{publisher.SAM_CONTENT_END}</article>"
        )
        concurrent_html = (
            f"<article>{publisher.SAM_CONTENT_BEGIN}<p>Not the plan.</p>"
            f"{publisher.SAM_CONTENT_END}</article>"
        )
        page_path = self.write_page(slug, old_html)
        entry = page_entry(slug, old_html)
        plan = publisher.plan_item_publish(
            self.item(slug, entry, "<p>Planned content.</p>"),
            entry,
            wiki_dir=str(self.wiki_dir),
        )
        root = Path(self.temp.name)
        manifest_path = root / "wiki-content-state.json"
        report_path = root / "wiki-rewrite-audit.md"
        sitemap_path = root / "sitemap.xml"
        manifest_path.write_text(json.dumps({"pages": [entry]}), encoding="utf-8")
        report_path.write_text("original report\n", encoding="utf-8")
        sitemap_path.write_text("<urlset></urlset>\n", encoding="utf-8")

        def refresh_for_wrong_page(output_dir):
            page_path.write_text(concurrent_html, encoding="utf-8")
            write_staged_refresh_outputs(
                output_dir,
                {"pages": [page_entry(slug, concurrent_html)]},
            )

        with self.assertRaisesRegex(
            publisher.PublisherSafetyError, "PUBLISH_TRANSACTION_ROLLBACK_CONFLICT"
        ):
            publisher.execute_publish_transaction(
                [plan],
                repo_root=self.temp.name,
                wiki_dir=str(self.wiki_dir),
                sitemap_path=str(sitemap_path),
                manifest_path=str(manifest_path),
                report_path=str(report_path),
                refresh_content_state_fn=refresh_for_wrong_page,
            )

        self.assertEqual(page_path.read_text(encoding="utf-8"), concurrent_html)
        self.assertFalse((root / publisher.PUBLISH_TRANSACTION_LOCK).exists())

    def test_refresh_must_produce_an_initial_nonempty_report(self):
        slug = "missing-refresh-report-page"
        old_html = (
            f"<article>{publisher.SAM_CONTENT_BEGIN}<p>Old.</p>"
            f"{publisher.SAM_CONTENT_END}</article>"
        )
        page_path = self.write_page(slug, old_html)
        entry = page_entry(slug, old_html)
        plan = publisher.plan_item_publish(
            self.item(slug, entry, "<p>New.</p>"),
            entry,
            wiki_dir=str(self.wiki_dir),
        )
        root = Path(self.temp.name)
        manifest_path = root / "wiki-content-state.json"
        report_path = root / "wiki-rewrite-audit.md"
        sitemap_path = root / "sitemap.xml"
        manifest_path.write_text(json.dumps({"pages": [entry]}), encoding="utf-8")
        sitemap_path.write_text("<urlset></urlset>\n", encoding="utf-8")

        def refresh_without_report(output_dir):
            current = page_path.read_text(encoding="utf-8")
            write_staged_refresh_outputs(
                output_dir,
                {"pages": [page_entry(slug, current)]},
                report=None,
            )

        with self.assertRaisesRegex(
            publisher.PublisherSafetyError, "did not produce required report"
        ):
            publisher.execute_publish_transaction(
                [plan],
                repo_root=self.temp.name,
                wiki_dir=str(self.wiki_dir),
                sitemap_path=str(sitemap_path),
                manifest_path=str(manifest_path),
                report_path=str(report_path),
                refresh_content_state_fn=refresh_without_report,
            )

        self.assertEqual(page_path.read_text(encoding="utf-8"), old_html)
        self.assertFalse(report_path.exists())

    def test_generator_failure_rolls_back_page_sitemap_manifest_and_report(self):
        slug = "rolled-back-stub"
        entry = page_entry(slug, None, policy="stub-allowed")
        plan = publisher.plan_item_publish(
            {"slug": slug, "title": "Rolled Back Stub", "summary": "Safe metadata."},
            entry,
            wiki_dir=str(self.wiki_dir),
        )
        page_path = self.wiki_dir / f"{slug}.html"
        manifest_path = Path(self.temp.name) / "wiki-content-state.json"
        report_path = Path(self.temp.name) / "wiki-rewrite-audit.md"
        sitemap_path = Path(self.temp.name) / "sitemap.xml"
        absent_stubs_path = Path(self.temp.name) / "wiki-absent-stubs.json"
        original_manifest = json.dumps({"pages": [entry]})
        original_report = "original report\n"
        original_sitemap = '<?xml version="1.0"?><urlset></urlset>\n'
        original_absent_stubs = json.dumps({
            "schema_version": 1,
            "absent_stub_slugs": [slug],
        })
        manifest_path.write_text(original_manifest, encoding="utf-8")
        report_path.write_text(original_report, encoding="utf-8")
        sitemap_path.write_text(original_sitemap, encoding="utf-8")
        absent_stubs_path.write_text(original_absent_stubs, encoding="utf-8")

        def failing_refresh(_output_dir):
            raise RuntimeError("injected generator failure")

        with self.assertRaisesRegex(
            publisher.PublisherSafetyError, "publish transaction rolled back"
        ):
            publisher.execute_publish_transaction(
                [plan],
                repo_root=self.temp.name,
                wiki_dir=str(self.wiki_dir),
                sitemap_path=str(sitemap_path),
                manifest_path=str(manifest_path),
                report_path=str(report_path),
                absent_stubs_path=str(absent_stubs_path),
                refresh_content_state_fn=failing_refresh,
            )

        self.assertFalse(page_path.exists())
        self.assertEqual(sitemap_path.read_text(encoding="utf-8"), original_sitemap)
        self.assertEqual(manifest_path.read_text(encoding="utf-8"), original_manifest)
        self.assertEqual(report_path.read_text(encoding="utf-8"), original_report)
        self.assertEqual(
            absent_stubs_path.read_text(encoding="utf-8"), original_absent_stubs
        )

        def interrupting_refresh(_output_dir):
            raise KeyboardInterrupt

        with self.assertRaises(KeyboardInterrupt):
            publisher.execute_publish_transaction(
                [plan],
                repo_root=self.temp.name,
                wiki_dir=str(self.wiki_dir),
                sitemap_path=str(sitemap_path),
                manifest_path=str(manifest_path),
                report_path=str(report_path),
                absent_stubs_path=str(absent_stubs_path),
                refresh_content_state_fn=interrupting_refresh,
            )

        self.assertFalse(page_path.exists())
        self.assertEqual(sitemap_path.read_text(encoding="utf-8"), original_sitemap)
        self.assertEqual(manifest_path.read_text(encoding="utf-8"), original_manifest)
        self.assertEqual(report_path.read_text(encoding="utf-8"), original_report)
        self.assertEqual(
            absent_stubs_path.read_text(encoding="utf-8"), original_absent_stubs
        )
        self.assertFalse((Path(self.temp.name) / publisher.PUBLISH_TRANSACTION_LOCK).exists())


if __name__ == "__main__":
    unittest.main()
