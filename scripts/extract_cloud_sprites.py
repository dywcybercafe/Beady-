from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SOURCE = PROJECT_ROOT / '云朵素材.png'
OUTPUT = PROJECT_ROOT / 'assets' / 'images' / 'library'
NAMES = ('cloud-pink.png', 'cloud-blue.png', 'cloud-green.png', 'cloud-yellow.png')


def fill_enclosed_areas(mask: np.ndarray) -> np.ndarray:
    height, width = mask.shape
    outside = np.zeros_like(mask, dtype=bool)
    queue = deque()
    for x in range(width):
        if not mask[0, x]: queue.append((0, x))
        if not mask[height - 1, x]: queue.append((height - 1, x))
    for y in range(height):
        if not mask[y, 0]: queue.append((y, 0))
        if not mask[y, width - 1]: queue.append((y, width - 1))
    while queue:
        y, x = queue.popleft()
        if y < 0 or y >= height or x < 0 or x >= width or outside[y, x] or mask[y, x]:
            continue
        outside[y, x] = True
        queue.extend(((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)))
    return mask | ~outside


def remove_small_components(mask: np.ndarray, minimum_area: int) -> np.ndarray:
    height, width = mask.shape
    visited = np.zeros_like(mask, dtype=bool)
    kept = np.zeros_like(mask, dtype=bool)
    for start_y, start_x in zip(*np.where(mask & ~visited)):
        if visited[start_y, start_x]:
            continue
        queue = deque(((int(start_y), int(start_x)),))
        component = []
        visited[start_y, start_x] = True
        while queue:
            y, x = queue.popleft()
            component.append((y, x))
            for next_y, next_x in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                if 0 <= next_y < height and 0 <= next_x < width and mask[next_y, next_x] and not visited[next_y, next_x]:
                    visited[next_y, next_x] = True
                    queue.append((next_y, next_x))
        if len(component) >= minimum_area:
            ys, xs = zip(*component)
            kept[ys, xs] = True
    return kept


def extract_sprite(rgb: np.ndarray) -> Image.Image:
    colorfulness = rgb.max(axis=2).astype(np.int16) - rgb.min(axis=2).astype(np.int16)
    luminance = rgb.mean(axis=2)
    # The supplied sheet has a baked checkerboard. A stricter chroma seed keeps
    # the blue cloud's soft cast from accidentally connecting nearby grey tiles
    # to the foreground silhouette; enclosed white eyes are restored below.
    core = (colorfulness > 40) | (luminance < 105)
    closed = Image.fromarray((core * 255).astype(np.uint8), 'L').filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
    silhouette = fill_enclosed_areas(np.asarray(closed) > 0)
    silhouette = remove_small_components(silhouette, max(80, rgb.shape[0] * rgb.shape[1] // 1600))

    # Preserve the exact source pixels. Alpha only removes the achromatic checkerboard;
    # a soft colorfulness ramp retains the original anti-aliased cloud edges.
    soft_alpha = np.clip((colorfulness.astype(np.float32) - 1.5) / 8.0 * 255, 0, 255)
    dark_alpha = np.clip((130 - luminance) / 25 * 255, 0, 255)
    alpha = np.maximum(soft_alpha, dark_alpha)
    alpha[silhouette & (alpha < 245)] = 255
    alpha[~silhouette] = 0

    ys, xs = np.where(alpha > 0)
    margin = 8
    left = max(0, int(xs.min()) - margin); right = min(rgb.shape[1], int(xs.max()) + margin + 1)
    top = max(0, int(ys.min()) - margin); bottom = min(rgb.shape[0], int(ys.max()) + margin + 1)
    rgba = np.dstack((rgb, alpha.astype(np.uint8)))[top:bottom, left:right]
    return Image.fromarray(rgba, 'RGBA')


def main() -> None:
    image = np.asarray(Image.open(SOURCE).convert('RGB'))
    height, width = image.shape[:2]
    OUTPUT.mkdir(parents=True, exist_ok=True)
    quadrants = (
        image[:height // 2, :width // 2],
        image[:height // 2, width // 2:],
        image[height // 2:, :width // 2],
        image[height // 2:, width // 2:],
    )
    for name, quadrant in zip(NAMES, quadrants):
        extract_sprite(quadrant).save(OUTPUT / name, optimize=True)


if __name__ == '__main__':
    main()
