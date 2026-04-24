from PIL import Image
import os
import glob

# Grid bounds (confirmed in Task 2)
GRID_LEFT_RATIO = 0.130
GRID_TOP_RATIO = 0.080
GRID_RIGHT_RATIO = 0.990
GRID_BOTTOM_RATIO = 0.650
MARGIN = 10

POSITIONS = ['gk', 'df', 'sb', 'vo', 'mf', 'om', 'wg', 'fw']
RANKS = ['cost1', 'cost1plus', 'cost2', 'cost2plus', 'ss']


def extract_grid(input_path, side_name, output_dir):
    """side_name: 'ally' or 'enemy'"""
    img = Image.open(input_path)
    W, H = img.size

    grid_left = int(W * GRID_LEFT_RATIO)
    grid_top = int(H * GRID_TOP_RATIO)
    grid_right = int(W * GRID_RIGHT_RATIO)
    grid_bottom = int(H * GRID_BOTTOM_RATIO)

    grid_w = grid_right - grid_left
    grid_h = grid_bottom - grid_top

    cell_w = grid_w // len(POSITIONS)
    cell_h = grid_h // len(RANKS)

    os.makedirs(output_dir, exist_ok=True)
    count = 0

    for row_idx, rank in enumerate(RANKS):
        for col_idx, pos in enumerate(POSITIONS):
            x0 = grid_left + col_idx * cell_w + MARGIN
            y0 = grid_top + row_idx * cell_h + MARGIN
            x1 = grid_left + (col_idx + 1) * cell_w - MARGIN
            y1 = grid_top + (row_idx + 1) * cell_h - MARGIN

            crop = img.crop((x0, y0, x1, y1))
            filename = f'{side_name}_{pos}_{rank}.png'
            crop.save(os.path.join(output_dir, filename))
            count += 1

    return count


output_dir = 'public/assets/pieces'
n1 = extract_grid('assets-source/ally_grid.png', 'ally', output_dir)
n2 = extract_grid('assets-source/enemy_grid.png', 'enemy', output_dir)

print(f'Ally tokens extracted: {n1}')
print(f'Enemy tokens extracted: {n2}')
print(f'Total: {n1 + n2}')

files = sorted(glob.glob(f'{output_dir}/*.png'))
print(f'\nFiles in {output_dir}:')
for f in files[:5]:
    print(f'  {f}')
print(f'  ... ({len(files)} files total)')
