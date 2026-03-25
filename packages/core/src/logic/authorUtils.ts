/**
 * Deterministic author color — same name always maps to the same color,
 * consistent across sessions and devices.
 */
const AUTHOR_COLORS = [
  '#E57373', // red
  '#81C784', // green
  '#64B5F6', // blue
  '#FFB74D', // orange
  '#BA68C8', // purple
  '#4DB6AC', // teal
  '#F06292', // pink
  '#90A4AE', // blue-grey
];

export function authorColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
  }
  return AUTHOR_COLORS[Math.abs(hash) % AUTHOR_COLORS.length];
}
