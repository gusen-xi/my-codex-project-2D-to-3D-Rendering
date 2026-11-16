import zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
DEST=ROOT/'public/workflows'
with zipfile.ZipFile(DEST/'wuyin-comfyui.zip','w',zipfile.ZIP_DEFLATED) as z:
    for name in ['wuyin-interior.json','wuyin-api.json','README.md','verification.json','execution-history.json','recognition-history.json']:
        if (DEST/name).exists():z.write(DEST/name,name)
    for image in (DEST/'results').glob('*.png'):
        z.write(image,'results/'+image.name)
    z.write(ROOT/'public/assets/plan.jpg','wuyin-plan.jpg')
    z.write(ROOT/'comfyui/custom_nodes/wuyin/__init__.py','custom_nodes/wuyin/__init__.py')
print('packaged')
