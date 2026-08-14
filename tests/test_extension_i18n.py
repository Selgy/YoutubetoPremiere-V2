"""Guards for the browser extensions' i18n.

English is the default language and French is used when the browser UI
language is French. These tests catch the failure mode that would silently
ship a broken string: a T('key') call or data-i18n attribute whose key has no
entry in the message tables, or a key translated in one language only.

The dictionaries live in i18n.js as a JS object literal; it is regular enough
to parse the top-level keys with a regex, which keeps the tests dependency-free
(no node required).
"""
import os
import re

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BROWSERS = ('Chrome', 'Firefox')


def ext_path(browser, *parts):
    return os.path.join(ROOT, 'Extension Youtube', browser, *parts)


def read(path):
    with open(path, encoding='utf-8') as f:
        return f.read()


def parse_message_tables(js_source):
    """Return {'en': {...keys...}, 'fr': {...}} from i18n.js."""
    tables = {}
    for lang in ('en', 'fr'):
        # Each table starts at "<lang>: {" and ends at the matching brace.
        start = js_source.index('\n        %s: {' % lang)
        depth = 0
        i = js_source.index('{', start)
        body_start = i
        while True:
            ch = js_source[i]
            if ch == '{':
                depth += 1
            elif ch == '}':
                depth -= 1
                if depth == 0:
                    break
            i += 1
        body = js_source[body_start:i]
        # Keys are `name:` at the start of a line (values may contain colons).
        tables[lang] = set(re.findall(r'^\s{12}([A-Za-z0-9_]+):', body, re.M))
    return tables


def collect_used_keys(browser):
    keys = set()
    for name in ('content.js', 'popup.js'):
        src = read(ext_path(browser, name))
        keys |= set(re.findall(r"\bT\(\s*'([A-Za-z0-9_]+)'", src))
    html = read(ext_path(browser, 'popup.html'))
    keys |= set(re.findall(r'data-i18n(?:-title)?="([A-Za-z0-9_]+)"', html))
    return keys


@pytest.mark.parametrize('browser', BROWSERS)
class TestExtensionI18n:
    def test_i18n_file_exists(self, browser):
        assert os.path.isfile(ext_path(browser, 'i18n.js'))

    def test_language_tables_have_identical_keys(self, browser):
        tables = parse_message_tables(read(ext_path(browser, 'i18n.js')))
        assert tables['en'], "no English messages parsed"
        missing_fr = tables['en'] - tables['fr']
        missing_en = tables['fr'] - tables['en']
        assert not missing_fr, "keys missing a French translation: %s" % sorted(missing_fr)
        assert not missing_en, "keys missing an English translation: %s" % sorted(missing_en)

    def test_every_used_key_is_defined(self, browser):
        defined = parse_message_tables(read(ext_path(browser, 'i18n.js')))['en']
        used = collect_used_keys(browser)
        assert used, "no translation keys found in the extension sources"
        undefined = used - defined
        assert not undefined, "T()/data-i18n keys with no message: %s" % sorted(undefined)

    def test_i18n_runs_before_content_script(self, browser):
        """window.YTPI18n must exist before content.js executes."""
        import json
        manifest = json.loads(read(ext_path(browser, 'manifest.json')))
        js = manifest['content_scripts'][0]['js']
        assert 'i18n.js' in js, "i18n.js is not injected as a content script"
        assert js.index('i18n.js') < js.index('content.js')

    def test_popup_loads_i18n_before_popup_js(self, browser):
        html = read(ext_path(browser, 'popup.html'))
        assert 'i18n.js' in html, "popup.html does not load i18n.js"
        assert html.index('i18n.js') < html.index('popup.js')

    def test_no_hardcoded_french_left_in_ui_strings(self, browser):
        """User-facing literals must go through T(), not be inlined."""
        pattern = re.compile(
            r"(?:showNotification\(|textContent = |\.title = |confirm\()"
            r"'[^']*[éèêàçùôûîœÉÈÀÇ][^']*'"
        )
        offenders = []
        for name in ('content.js', 'popup.js'):
            for line_no, line in enumerate(read(ext_path(browser, name)).splitlines(), 1):
                if pattern.search(line):
                    offenders.append('%s:%d' % (name, line_no))
        assert not offenders, "hardcoded French UI strings at: %s" % offenders


def test_chrome_and_firefox_i18n_are_identical():
    """The two copies must not drift apart."""
    assert read(ext_path('Chrome', 'i18n.js')) == read(ext_path('Firefox', 'i18n.js'))


@pytest.mark.parametrize('browser', BROWSERS)
def test_english_is_the_fallback(browser):
    """Non-French UI languages must resolve to English."""
    src = read(ext_path(browser, 'i18n.js'))
    # Detection returns 'fr' only for a language tag starting with 'fr'.
    assert "indexOf('fr') === 0 ? 'fr' : 'en'" in src
    assert 'getUILanguage' in src, "browser UI language is not consulted"
    assert 'navigator.language' in src, "no navigator.language fallback"
