// Family Bakery: store links and the merge tray's starting board and orders,
// shared by the tray markup and the script that plays it.

export const APP_STORE = 'https://apps.apple.com/us/app/family-bakery-merge-bake/id6821272683';
export const PLAY_STORE = 'https://play.google.com/store/apps/details?id=com.btsouth.familybakery';
export const ART = '/assets/family-bakery';

/** The bakery chain, tier 1 to 8, as named in the game. */
export const CHAIN = ['Egg', 'Flour', 'Dough', 'Bread', 'Croissant', 'Braided brioche', 'Pastry basket', 'Bakery hamper'];

export const COLS = 4;
export const CELLS = 12;
/** The bread box always sits in the first cell. */
export const OVEN = 0;

export type Order = { who: string; say: string; tier: number; stock: number[]; coins: number };

// Each order restocks the board so one egg from the bread box starts a chain of
// merges that ends in what the regular asked for.
export const ORDERS: Order[] = [
  { who: 'grandma', say: 'A warm croissant, dear?', tier: 5, stock: [1, 2, 3, 4], coins: 40 },
  { who: 'gentleman', say: 'Just a fresh loaf, please.', tier: 4, stock: [1, 2, 3], coins: 25 },
  { who: 'student', say: 'Something fancy for my study group?', tier: 6, stock: [1, 2, 3, 4, 5], coins: 80 },
];

/** Where restocked items land, spread around the tray. */
export const STOCK_CELLS = [6, 3, 9, 10, 5, 11, 2, 8, 7, 4, 1];

export function startBoard() {
  const board = Array<number>(CELLS).fill(0);
  board[OVEN] = -1;
  ORDERS[0].stock.forEach((tier, i) => (board[STOCK_CELLS[i]] = tier));
  return board;
}
