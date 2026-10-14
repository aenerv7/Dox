"""magpie client and translation write-back checks; a local fake gateway, never the network."""
import json
import socket
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import tempfile
from unittest.mock import patch

import patch_firefox as ff

MODEL = 'test-model'


def translated_block(source):
    """Structure-preserving fake translation: only human text after '=' changes."""
    lines = []
    for line in source.splitlines():
        head, separator, tail = line.partition('=')
        lines.append(f'{head}= 中文' if separator and tail.strip() else line)
    return '\n'.join(lines)


class GatewayHandler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def _send(self, status, payload):
        raw = payload if isinstance(payload, bytes) else json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _override(self):
        override = self.server.replies.get(self.path)
        if override is None:
            return False
        status, payload = override
        self._send(status, payload)
        return True

    def do_GET(self):
        self.server.requests.append({'method': 'GET', 'path': self.path,
                                     'headers': {k.lower(): v for k, v in self.headers.items()}})
        if self._override():
            return
        if self.path.endswith('/models'):
            self._send(200, {'data': [{'id': model} for model in self.server.models]})
            return
        self._send(404, {'error': {'message': 'not found'}})

    def do_POST(self):
        length = int(self.headers.get('Content-Length') or 0)
        body = json.loads(self.rfile.read(length) or b'{}')
        self.server.requests.append({'method': 'POST', 'path': self.path, 'body': body,
                                     'headers': {k.lower(): v for k, v in self.headers.items()}})
        if self._override():
            return
        asked = {}
        if self.path.endswith('/chat/completions'):
            try:
                asked = json.loads(body['messages'][-1]['content']).get('messages', {})
            except (KeyError, IndexError, ValueError):
                asked = {}
            answer = json.dumps({key: translated_block(source) for key, source in asked.items()},
                                ensure_ascii=False)
            self._send(200, {'choices': [{'message': {'content': answer}, 'finish_reason': 'stop'}]})
            return
        self._send(404, {'error': {'message': 'not found'}})

    def log_message(self, *args):
        pass


class GatewayCase(unittest.TestCase):
    def setUp(self):
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), GatewayHandler)
        self.server.requests = []
        self.server.replies = {}
        self.server.models = [MODEL]
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)
        self.base = f'http://127.0.0.1:{self.server.server_address[1]}/v1'

    def client(self, **kwargs):
        return ff.MagpieClient(self.base, kwargs.pop('model', MODEL), **kwargs)


class ClientTests(GatewayCase):
    def test_translation_round_trip(self):
        client = self.client()
        client.ensure_ready()
        self.assertEqual(client.translate({'k': 'a-one = One'}, 'Simplified Chinese'),
                         {'k': 'a-one = 中文'})
        request = self.server.requests[-1]
        self.assertEqual(request['path'], '/v1/chat/completions')
        self.assertEqual(request['body']['model'], MODEL)
        self.assertIn('Simplified Chinese', request['body']['messages'][0]['content'])
        self.assertNotIn('authorization', request['headers'])
        self.assertEqual(self.server.requests[0]['path'], '/v1/models')

    def test_api_key_is_sent_only_when_configured(self):
        with patch.dict('os.environ', {ff.MAGPIE_KEY_ENV: 'secret'}):
            client = ff.MagpieClient.from_env(self.base, MODEL)
        self.assertEqual(client.headers['Authorization'], 'Bearer secret')
        client.translate({'k': 'a = One'}, 'Simplified Chinese')
        self.assertEqual(self.server.requests[-1]['headers']['authorization'], 'Bearer secret')

    def test_model_list_is_checked_before_translating(self):
        self.server.models = ['other-model']
        with self.assertRaises(ff.Blocked) as caught:
            self.client().ensure_ready()
        self.assertIn('other-model', str(caught.exception))
        self.assertIn(MODEL, str(caught.exception))

    def test_gateway_http_error_includes_status_and_body(self):
        self.server.replies['/v1/chat/completions'] = (500, {'error': {'message': 'boom'}})
        with self.assertRaises(ff.Blocked) as caught:
            self.client().translate({'k': 'a = One'}, 'Simplified Chinese')
        self.assertIn('500', str(caught.exception))
        self.assertIn('boom', str(caught.exception))

    def test_unreachable_gateway_is_reported(self):
        with socket.socket() as probe:
            probe.bind(('127.0.0.1', 0))
            port = probe.getsockname()[1]
        client = ff.MagpieClient(f'http://127.0.0.1:{port}/v1', MODEL, timeout=5)
        with self.assertRaises(ff.Blocked) as caught:
            client.ensure_ready()
        self.assertIn('无法连接 magpie', str(caught.exception))

    def test_broken_answers_are_reported(self):
        cases = {
            'not json': '不是 JSON',
            '{}': '消息键不匹配',
        }
        for reply, expected in cases.items():
            self.server.replies['/v1/chat/completions'] = (200, {'choices': [
                {'message': {'content': reply}, 'finish_reason': 'stop'}]})
            with self.assertRaises(ff.Blocked) as caught:
                self.client().translate({'k': 'a = One'}, 'Simplified Chinese')
            self.assertIn(expected, str(caught.exception))

    def test_truncated_answer_is_reported(self):
        self.server.replies['/v1/chat/completions'] = (200, {'choices': [
            {'message': {'content': '{}'}, 'finish_reason': 'length'}]})
        with self.assertRaises(ff.Blocked) as caught:
            self.client().translate({'k': 'a = One'}, 'Simplified Chinese')
        self.assertIn('截断', str(caught.exception))

    def test_answer_may_be_wrapped_in_a_json_fence(self):
        answer = '```json\n' + json.dumps({'k': 'a = 中文'}) + '\n```'
        self.server.replies['/v1/chat/completions'] = (200, {'choices': [
            {'message': {'content': answer}, 'finish_reason': 'stop'}]})
        self.assertEqual(self.client().translate({'k': 'a = One'}, 'Simplified Chinese'),
                         {'k': 'a = 中文'})

    def test_redirects_are_not_followed(self):
        self.server.replies['/v1/models'] = (302, {'error': {'message': 'moved'}})
        with self.assertRaises(ff.Blocked) as caught:
            self.client().ensure_ready()
        self.assertIn('302', str(caught.exception))


class EnvironmentTests(unittest.TestCase):
    def test_defaults_and_overrides(self):
        with patch.dict('os.environ', {}, clear=True):
            client = ff.MagpieClient.from_env()
            self.assertEqual((client.base_url, client.model), (ff.MAGPIE_BASE_URL, ff.MAGPIE_MODEL))
            client = ff.MagpieClient.from_env('http://127.0.0.1:1/v1', 'other')
            self.assertEqual((client.base_url, client.model), ('http://127.0.0.1:1/v1', 'other'))
        with patch.dict('os.environ', {'MAGPIE_BASE_URL': 'http://localhost:9999/v1',
                                       'MAGPIE_MODEL': 'env-model',
                                       ff.MAGPIE_KEY_ENV: 'env-key'}):
            client = ff.MagpieClient.from_env()
            self.assertEqual(client.base_url, 'http://localhost:9999/v1')
            self.assertEqual(client.model, 'env-model')
            self.assertEqual(client.headers, {'Authorization': 'Bearer env-key'})

    def test_unsafe_addresses_are_refused(self):
        for address, expected in (('ftp://127.0.0.1/v1', '地址无效'),
                                  ('http://user:pass@127.0.0.1/v1', '地址无效'),
                                  ('http://127.0.0.1/v1?x=1', '地址无效'),
                                  ('http://example.test/v1', 'HTTPS')):
            with self.assertRaises(ff.Blocked) as caught:
                ff.MagpieClient.from_env(address)
            self.assertIn(expected, str(caught.exception))


class WriteBackTests(GatewayCase):
    def setUp(self):
        super().setUp()
        self.temp = tempfile.TemporaryDirectory(prefix='ff-translate-test-')
        self.addCleanup(self.temp.cleanup)
        self.module = Path(self.temp.name).resolve() / 'module'
        self.module.mkdir()
        (self.module / 'translations.zh-CN.ftl').write_text('# 标题\n', encoding='utf-8')
        self.root = patch.object(ff, 'ROOT', self.module)
        self.root.start()
        self.addCleanup(self.root.stop)

    def test_translate_gaps_writes_a_reviewable_file(self):
        gaps = [('omni.ja', 'localization/zh-CN/toolkit/a.ftl', 'a-two', 'a-two = Two'),
                ('browser/omni.ja', 'localization/zh-CN/browser/b.ftl', 'b-one', 'b-one =\n    .label = One')]
        self.assertEqual(ff.translate_gaps(gaps, 'zh-CN', base_url=self.base, model=MODEL), 2)
        text = ff.translations_path('zh-CN').read_text(encoding='utf-8')
        self.assertIn('# @file omni.ja localization/zh-CN/toolkit/a.ftl\na-two = 中文\n', text)
        self.assertIn('# @file browser/omni.ja localization/zh-CN/browser/b.ftl\n'
                      'b-one =\n    .label = 中文\n', text)
        # Feeding the same gaps again adds nothing.
        self.assertEqual(ff.translate_gaps(gaps, 'zh-CN', base_url=self.base, model=MODEL), 0)

    def test_structural_mismatch_is_not_written(self):
        gaps = [('omni.ja', 'localization/zh-CN/toolkit/a.ftl', 'a-two', 'a-two = { $count } items')]
        broken = {'omni.ja/localization/zh-CN/toolkit/a.ftl:a-two': 'a-two = 中文'}
        with patch.object(ff.MagpieClient, 'translate', lambda self, messages, language: broken):
            with self.assertRaises(ff.Blocked):
                ff.translate_gaps(gaps, 'zh-CN', base_url=self.base, model=MODEL)
        self.assertNotIn('a-two', ff.translations_path('zh-CN').read_text(encoding='utf-8'))


if __name__ == '__main__':
    unittest.main()
