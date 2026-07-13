from pathlib import Path
from PIL import Image

WIDTH = 512
HEIGHT = 512
COLOR = (255, 255, 255)
FILENAME = 'white_image.png'

output_path = Path(__file__).resolve().parent / FILENAME
image = Image.new('RGB', (WIDTH, HEIGHT), color=COLOR)
image.save(output_path)
print(f"White {WIDTH}x{HEIGHT} image generated: '{output_path}'")
