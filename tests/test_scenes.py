import ast
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]

class SceneTest(unittest.TestCase):
    def test_scene_targets_and_capabilities(self):
        config = json.loads((ROOT / 'config/floorplan.json').read_text())
        scripts = json.loads((ROOT / 'config/scenes.json').read_text())
        ids = {m['entity'] for m in config['markers']}
        self.assertEqual(5, sum(e.startswith('climate.') for e in ids))
        self.assertEqual(2, sum(e.startswith('cover.') for e in ids))
        self.assertEqual(7, len(scripts))
        for scene in config['scenes']:
            self.assertIn(scene['targets'][0].removeprefix('script.'), scripts)
        for key, script in scripts.items():
            sequence = script['sequence']
            for i in range(0, len(sequence), 2):
                template = sequence[i]['variables']['scene_targets']
                targets = ast.literal_eval(template.split('expand(')[1].split(') |')[0])
                self.assertTrue(set(targets) <= ids, key)
                self.assertEqual(len(targets), len(set(targets)))
                self.assertIn("rejectattr('state', 'in', ['unavailable', 'unknown'])", template)
                step = sequence[i + 1]
                self.assertEqual('{{ scene_targets | count > 0 }}', step['if'][0]['value_template'])
                action = step['then'][0]
                self.assertEqual('{{ scene_targets }}', action['target']['entity_id'])
                self.assertTrue(all(e.startswith(action['action'].split('.')[0] + '.') for e in targets))
                if 'color_temp_kelvin' in action.get('data', {}):
                    self.assertTrue(all(e.startswith(('light.gdds_', 'light.comely_')) for e in targets))
                    self.assertLessEqual(action['data']['color_temp_kelvin'], 4000)
        actions=lambda name:[s['then'][0]['action'] for s in scripts[name]['sequence'] if 'then' in s]
        self.assertIn('climate.turn_off', actions('poly_home_leave'))
        self.assertIn('cover.close_cover', actions('poly_home_sleep'))
