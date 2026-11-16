"""Graph integrity checks; no external model requests."""
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]

class WorkflowTests(unittest.TestCase):
    def setUp(self):
        self.ui = json.loads((ROOT/'public/workflows/wuyin-interior.json').read_text())
        self.api = json.loads((ROOT/'public/workflows/wuyin-api.json').read_text())
        self.nodes = {n['id']:n for n in self.ui['nodes']}

    def test_all_links_have_matching_endpoints_and_types(self):
        self.assertEqual(len(self.nodes),9)
        self.assertEqual(len(self.ui['links']),10)
        seen=set()
        for lid,a,sa,b,sb,typ in self.ui['links']:
            self.assertNotIn(lid,seen);seen.add(lid)
            origin=self.nodes[a]['outputs'][sa]
            target=self.nodes[b]['inputs'][sb]
            self.assertIn(lid,origin['links'])
            self.assertEqual(target['link'],lid)
            self.assertEqual(origin['type'],typ)
            self.assertEqual(target['type'],typ)
            self.assertEqual(self.api[str(b)]['inputs'][target['name']],[str(a),sa])
        self.assertEqual(seen,{s['link'] for n in self.nodes.values() for s in n['inputs']})
        self.assertEqual(seen,{l for n in self.nodes.values() for s in n['outputs'] for l in s['links']})

    def test_no_hidden_or_unprovided_nodes(self):
        source=(ROOT/'comfyui/custom_nodes/wuyin/__init__.py').read_text()
        for node in self.nodes.values():
            self.assertEqual(node['type'],self.api[str(node['id'])]['class_type'])
            self.assertTrue(node['type'] in ['LoadImage','SaveImage'] or 'class '+node['type']+':' in source)
            self.assertTrue({'id','type','pos','size','flags','order','mode','properties'}<=node.keys())
        self.assertEqual(self.ui['version'],.4)
        # Every upstream node has a path to a saved image (no decorative orphan nodes).
        reachable={6,9}
        while True:
            previous=reachable.copy()
            reachable.update(a for _,a,_,b,_,_ in self.ui['links'] if b in reachable)
            if previous==reachable:break
        self.assertEqual(reachable,set(self.nodes))

    def test_export_requires_consent_and_human_confirmation(self):
        for node in self.api.values():
            inputs=node['inputs']
            if 'consent' in inputs:self.assertIs(inputs['consent'],False)
            if 'confirmed' in inputs:self.assertIs(inputs['confirmed'],False)

    def test_direction_choices_match_product(self):
        source=(ROOT/'comfyui/custom_nodes/wuyin/__init__.py').read_text()
        for name in ['东','南','西','北','东南','东北','西南','西北']:
            self.assertIn("'"+name+"'",source)

if __name__=='__main__':unittest.main()
