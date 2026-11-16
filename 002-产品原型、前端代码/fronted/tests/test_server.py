"""Offline checks: no model calls or changes to real source files."""
import base64
import io
import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from unittest.mock import patch
from PIL import Image, ImageChops
from server import app as server

class PrototypeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(dir=server.WORK)
        cls.root = Path(cls.temp.name)
        cls.output = cls.root / 'outputs'
        for folder in ['uploads', 'generated', 'jobs']:
            (cls.output / folder).mkdir(parents=True)
        cls.patches = [patch.object(server, 'OUTPUT', cls.output), patch.object(server, 'WORK', cls.root)]
        for p in cls.patches:
            p.start()
        cls.http = server.ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        threading.Thread(target=cls.http.serve_forever, daemon=True).start()
        cls.base = f'http://127.0.0.1:{cls.http.server_port}'

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown()
        cls.http.server_close()
        for p in cls.patches:
            p.stop()
        cls.temp.cleanup()

    def post(self, route, data, origin=None):
        headers = {'Content-Type': 'application/json'}
        if origin:
            headers['Origin'] = origin
        request = urllib.request.Request(self.base + route, data=json.dumps(data).encode(), headers=headers)
        try:
            with urllib.request.urlopen(request) as response:
                return response.status, json.load(response)
        except urllib.error.HTTPError as error:
            return error.code, json.load(error)

    def image_bytes(self):
        buf = io.BytesIO()
        Image.new('RGB', (120, 80), 'white').save(buf, format='PNG')
        return buf.getvalue()

    def test_frontend_entry_and_source_routes(self):
        for path in ['/', '/index.html', '/src/main.js', '/src/styles/main.css', '/assets/plan.jpg', '/workflows/wuyin-interior.json']:
            with urllib.request.urlopen(self.base + path) as response:
                self.assertEqual(response.status, 200, path)
                response.read()
        for path in ['/src/%2e%2e/server/app.py', '/server/app.py', '/package.json']:
            with self.assertRaises(urllib.error.HTTPError) as error:
                urllib.request.urlopen(self.base + path)
            self.assertEqual(error.exception.code, 404, path)

    def test_image_upload_and_traversal(self):
        status, value = self.post('/api/upload', {'data': base64.b64encode(self.image_bytes()).decode()})
        self.assertEqual(status, 200)
        self.assertEqual(server.local_image(value['pages'][0]).parent, self.output / 'uploads')
        for url in ['/outputs/../server.py', 'https://example.com/image.png']:
            with self.assertRaises(ValueError):
                server.local_image(url)

    def test_pdf_pages(self):
        buf = io.BytesIO()
        Image.new('RGB', (120, 80), 'white').save(buf, format='PDF', save_all=True, append_images=[Image.new('RGB', (80, 120), 'gray')])
        status, value = self.post('/api/upload', {'data': base64.b64encode(buf.getvalue()).decode()})
        self.assertEqual(status, 200)
        self.assertEqual(len(value['pages']), 2)
        self.assertNotEqual(value['pages'][0], value['pages'][1])

    def test_invalid_upload_and_cross_site(self):
        self.assertEqual(self.post('/api/upload', {'data': 'not-base64'})[0], 400)
        self.assertEqual(self.post('/api/workspace', {'test': True}, 'https://example.com')[0], 403)
        self.assertEqual(self.post('/api/upload', {'data': base64.b64encode(b'not an image').decode()})[0], 400)

    def test_confirmation_and_rectangles(self):
        self.assertEqual(self.post('/api/generate', {'source': '/assets/plan.jpg', 'consent': False})[0], 400)
        for r in [{'x': .9, 'y': .1, 'w': .3, 'h': .2}, {'x': 0, 'y': 0, 'w': 0, 'h': .5}, {}]:
            with self.assertRaises(ValueError):
                server.rectangle(r)

    def test_mask_and_unchanged_exterior(self):
        source = self.output / 'uploads' / 'base.png'
        Image.new('RGB', (100, 100), 'white').save(source)
        job = {'id': 'test-mask', 'created': 0}
        selection = {'x': .2, 'y': .3, 'w': .4, 'h': .3}
        def fake_run(command, **kwargs):
            with Image.open(command[command.index('--mask') + 1]) as mask:
                self.assertEqual(mask.size, (100, 100))
                self.assertEqual(mask.getpixel((30, 40))[3], 0)
                self.assertEqual(mask.getpixel((0, 0))[3], 255)
            Image.new('RGB', (120, 80), 'red').save(command[command.index('--output') + 1])
            return type('Result', (), {'returncode': 0})()
        with patch.object(server.subprocess, 'run', side_effect=fake_run):
            server.generate(job, {'source': '/outputs/uploads/base.png', 'action': 'edit', 'selection': selection, 'instruction': '换红色沙发'})
        self.assertEqual(job['status'], 'completed')
        with Image.open(self.output / 'generated/test-mask.png') as result:
            self.assertEqual(result.getpixel((30, 40)), (255, 0, 0))
            for box in [(0, 0, 100, 30), (0, 60, 100, 100), (0, 30, 20, 60), (60, 30, 100, 60)]:
                expected = Image.new('RGB', (box[2]-box[0], box[3]-box[1]), 'white')
                self.assertIsNone(ImageChops.difference(result.crop(box), expected).getbbox())

    def test_duplicate_request_is_not_dispatched_twice(self):
        key = 'offline-duplicate'
        data = {'source': '/assets/plan.jpg', 'consent': True, 'requestId': key}
        with patch.object(server.POOL, 'submit') as submit:
            first_status, first = self.post('/api/analyze', data)
            second_status, second = self.post('/api/analyze', data)
            self.assertEqual(first_status, 202)
            self.assertEqual(second_status, 200)
            self.assertEqual(first['id'], second['id'])
            self.assertEqual(submit.call_count, 1)
        server.JOBS.pop(first['id'])

    def test_provider_gateway_timeout_is_unknown(self):
        job = {'id': 'test-timeout', 'created': 0}
        response = type('Result', (), {'returncode': 1, 'stderr': 'ERROR: HTTP 504 upstream timeout'})()
        with patch.object(server.subprocess, 'run', return_value=response):
            server.generate(job, {'source': '/assets/reference-01.jpg', 'action': 'restyle', 'style': '现代'})
        self.assertEqual(job['status'], 'unknown')
        self.assertEqual(job['diagnostic']['httpStatus'], 504)

    def test_workspace_roundtrip(self):
        self.assertEqual(self.post('/api/workspace', {'style': '原木', 'versions': []})[0], 200)
        with urllib.request.urlopen(self.base + '/api/workspace') as response:
            self.assertEqual(json.load(response)['style'], '原木')

if __name__ == '__main__':
    unittest.main(verbosity=2)
