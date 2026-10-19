// XP calculation library, exponential growth
export function levelFor(xp = 0) {
  const level = Math.floor(Math.sqrt(xp / 100)) + 1;
  const floor = 100 * (level - 1) ** 2;
  const next = 100 * level ** 2;
  return { 
    level, 
    floor, 
    next, 
    progress: (xp - floor) / (next - floor) }
};

// predefined titles
export const TITLES = [
    'Transit Rookie', 
    'Kopi Scout', 
    'Lane Walker', 
    'Skyline Seeker', 
    'Hawker Hero', 
    'City Cartographer', 
    'Layover Legend'
];

// title getter (descending hierarchy)
export const titleFor = (level) => {
    return TITLES[Math.min(TITLES.length - 1, level - 1)]
};