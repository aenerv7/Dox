"""Validate resources against the original build (requires fluent.syntax)."""
import json
from pathlib import Path
import re
import zipfile

from fluent.syntax import FluentParser, ast
from patch_zen import ARCHIVES, BUILD, ROOT, SETTINGS, SHORTCUTS, fragments

parser = FluentParser()


def entries(text):
    tree = parser.parse(text)
    errors = [node for node in tree.body if isinstance(node, ast.Junk)]
    assert not errors, f'Invalid Fluent syntax: {errors}'
    nodes = [node for node in tree.body if isinstance(node, (ast.Message, ast.Term))]
    names = [node.id.name for node in nodes]
    assert len(names) == len(set(names)), 'Duplicate Fluent IDs'
    return {node.id.name: node for node in nodes}


def references(node):
    result = set()
    def walk(value):
        if isinstance(value, dict):
            kind = value.get('type')
            if kind in ('VariableReference', 'TermReference', 'MessageReference'):
                result.add((kind, value['id']['name']))
            for child in value.values():
                walk(child)
        elif isinstance(value, list):
            for child in value:
                walk(child)
    walk(node.to_json())
    return result


def check(original_dir):
    additions = fragments()
    missing_after = []
    count = 0
    files_checked = 0
    resource_changes = []
    for archive in ARCHIVES:
        with zipfile.ZipFile(original_dir / archive) as original, zipfile.ZipFile(BUILD / archive) as patched:
            assert patched.testzip() is None
            for name in original.namelist():
                if name not in additions[archive] and name not in (SETTINGS, SHORTCUTS):
                    assert original.read(name) == patched.read(name), f'Unrelated resource changed: {name}'
            for name, addition in additions[archive].items():
                translated = entries(addition)
                combined = entries(patched.read(name).decode('utf-8'))
                assert translated.keys() <= combined.keys()
                if '/zh-CN/' not in name:
                    continue
                english_name = name.replace('/zh-CN/', '/en-US/')
                english = entries(patched.read(english_name).decode('utf-8'))
                for key, node in translated.items():
                    source = english[key]
                    assert references(node) == references(source), f'References differ: {key}'
                    assert bool(node.value) == bool(source.value), f'Value differs: {key}'
                    assert {a.id.name for a in node.attributes} == {a.id.name for a in source.attributes}, key
                    # Named markup is required for DOM localization overlays.
                    source_text = patched.read(english_name).decode('utf-8')[source.span.start:source.span.end]
                    target_text = addition[node.span.start:node.span.end]
                    assert sorted(re.findall(r'data-l10n-name="([^"]+)"', source_text)) == sorted(re.findall(r'data-l10n-name="([^"]+)"', target_text)), key
                count += len(translated)
                resource_changes.append({'archive': archive, 'resource': name, 'added_messages': len(translated)})
            for name in patched.namelist():
                if not name.startswith('localization/en-US/') or not name.endswith('.ftl'):
                    continue
                english = entries(patched.read(name).decode('utf-8'))
                chinese_name = name.replace('/en-US/', '/zh-CN/')
                chinese = entries(patched.read(chinese_name).decode('utf-8')) if chinese_name in patched.namelist() else {}
                files_checked += 1
                for key, node in english.items():
                    if key not in chinese:
                        missing_after.append(f'{archive}/{chinese_name}:{key}')
                    else:
                        assert {a.id.name for a in node.attributes} <= {a.id.name for a in chinese[key].attributes}, key
                        if node.value is not None:
                            assert chinese[key].value is not None, key
    assert not missing_after, missing_after
    report = {'fluent_files_compared': files_checked, 'chinese_messages_added': count,
              'missing_message_ids': missing_after, 'syntax_valid': True,
              'variables_and_references_preserved': True,
              'unrelated_resources_unchanged': True, 'changes': resource_changes}
    (ROOT / 'validation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({key: value for key, value in report.items() if key != 'changes'}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    import argparse
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--original-dir', type=Path, default=Path(r'C:\Program Files\Zen Browser'))
    check(cli.parse_args().original_dir)
