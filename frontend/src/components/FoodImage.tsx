import { ReactNode } from "react";

/**
 * Picture for a food item, chosen from its name (and category as a fallback).
 * "milk" -> milk carton, "apple" -> apple, "eggs" -> eggs ... All illustrations are inline SVG, so they work offline
 * and need no image files. Unknown foods get a neutral grocery pack showing the first letter.
 */
const T = "#1f2937"; // outline colour
const o = { stroke: T, strokeWidth: 2, strokeLinejoin: "round", strokeLinecap: "round" } as const;

type Art = (p: { label: string }) => ReactNode;
const ART: Record<string, Art> = {
  milk: () => <><path d="M18 24h28v32a2 2 0 0 1-2 2H20a2 2 0 0 1-2-2z" fill="#f8fafc" {...o} /><path d="M18 24 32 8l14 16z" fill="#bfdbfe" {...o} /><rect x="18" y="32" width="28" height="14" fill="#3b82f6" /><text x="32" y="43" textAnchor="middle" fontSize="9" fontWeight="800" fill="#fff">MILK</text><path d="M22 24h20" {...o} /></>,
  yogurt: () => <><path d="M16 22h32l-4 34H20z" fill="#fff" {...o} /><rect x="14" y="14" width="36" height="9" rx="3" fill="#f9a8d4" {...o} /><path d="M18 34h28v10H19z" fill="#ec4899" opacity=".85" /><circle cx="32" cy="39" r="3" fill="#fff" /></>,
  cheese: () => <><path d="M6 40 58 22v22a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3z" fill="#fbbf24" {...o} /><path d="M6 40 58 22 40 14z" fill="#fde68a" {...o} /><circle cx="22" cy="42" r="3" fill="#f59e0b" /><circle cx="38" cy="40" r="2.5" fill="#f59e0b" /><circle cx="48" cy="36" r="2" fill="#f59e0b" /></>,
  butter: () => <><path d="M10 30h44v18a2 2 0 0 1-2 2H12a2 2 0 0 1-2-2z" fill="#fde047" {...o} /><path d="M10 30 20 20h34l-0 10z" fill="#fef9c3" {...o} /><rect x="10" y="36" width="44" height="8" fill="#fff" opacity=".8" /><text x="32" y="43" textAnchor="middle" fontSize="7" fontWeight="800" fill="#b45309">BUTTER</text></>,
  egg: () => <><ellipse cx="22" cy="38" rx="12" ry="15" fill="#fef3c7" {...o} /><ellipse cx="42" cy="40" rx="12" ry="15" fill="#fff" {...o} /><path d="M17 33c1-4 4-6 7-6" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round" /></>,
  bread: () => <><path d="M12 28c-5-9 3-16 20-16s25 7 20 16v22a3 3 0 0 1-3 3H15a3 3 0 0 1-3-3z" fill="#d97706" {...o} /><path d="M22 22l6 8M33 20l6 8M44 22l5 7" stroke="#fde68a" strokeWidth="3" strokeLinecap="round" /></>,
  apple: () => <><path d="M32 20c-6-5-20-4-20 12 0 12 8 24 15 24 3 0 3-1 5-1s2 1 5 1c7 0 15-12 15-24 0-16-14-17-20-12z" fill="#ef4444" {...o} /><path d="M32 20c0-6 2-9 5-11" fill="none" {...o} /><path d="M36 14c5-5 12-3 12-3s-1 8-8 9c-3 0-4-2-4-6z" fill="#22c55e" {...o} /><path d="M20 30c0-4 2-6 5-7" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity=".7" /></>,
  banana: () => <><path d="M12 22c2 20 14 32 38 28 4-1 5-5 2-6-14 0-22-8-24-24-.5-3-5-4-6-1-1 2-10 3-10 3z" fill="#fde047" {...o} /><path d="M14 20l4-4" {...o} /><path d="M50 50l4 1" stroke={T} strokeWidth="3" strokeLinecap="round" /></>,
  orange: () => <><circle cx="32" cy="35" r="21" fill="#fb923c" {...o} /><path d="M32 14c1-4 5-6 9-5-1 4-4 7-9 5z" fill="#22c55e" {...o} /><path d="M20 30c1-5 4-8 8-9" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity=".6" /></>,
  lemon: () => <><path d="M8 34c0-10 10-18 24-18s24 8 24 18-10 18-24 18S8 44 8 34z" fill="#fde047" {...o} /><path d="M6 34h4M54 34h4" {...o} /><path d="M20 30c2-4 5-6 9-6" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity=".7" /></>,
  grapes: () => <><g fill="#8b5cf6" {...o}>{[[24, 28], [36, 28], [30, 38], [20, 38], [40, 38], [26, 48], [36, 48], [31, 57]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="6.5" />)}</g><path d="M30 22c0-6 2-9 6-10" fill="none" {...o} /><path d="M34 14c5-4 11-2 11-2s-2 7-8 7z" fill="#22c55e" {...o} /></>,
  strawberry: () => <><path d="M14 24c0-6 36-6 36 0 0 14-10 34-18 34S14 38 14 24z" fill="#ef4444" {...o} /><path d="M20 20c4-2 6 2 12-1 6 3 8-1 12 1l-4 4H24z" fill="#22c55e" {...o} /><g fill="#fde68a">{[[24, 32], [34, 30], [42, 34], [28, 42], [38, 44], [32, 52]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="1.6" />)}</g></>,
  mango: () => <><path d="M14 30c4-14 24-20 34-10 8 8 4 26-8 32-12 5-30 0-26-22z" fill="#f59e0b" {...o} /><path d="M40 52c8-6 12-20 6-30" fill="#ef4444" opacity=".5" /><path d="M44 14c4-4 9-3 9-3s0 7-7 8z" fill="#22c55e" {...o} /></>,
  watermelon: () => <><path d="M6 26h52a26 26 0 0 1-52 0z" fill="#22c55e" {...o} /><path d="M11 26h42a21 21 0 0 1-42 0z" fill="#ef4444" /><g fill="#1f2937">{[[22, 34], [32, 40], [42, 34], [32, 31]].map(([x, y], i) => <ellipse key={i} cx={x} cy={y} rx="1.6" ry="2.6" />)}</g></>,
  tomato: () => <><circle cx="32" cy="36" r="20" fill="#ef4444" {...o} /><path d="M32 17l-7 5 5 1-3 5 5-3 3 5 2-6 6 2-3-5 5-3-7-1z" fill="#22c55e" {...o} /><path d="M20 32c1-4 4-7 8-8" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity=".6" /></>,
  carrot: () => <><path d="M44 18 14 52c-2 3 1 6 4 4L50 26z" fill="#fb923c" {...o} transform="rotate(0)" /><path d="M24 40l5-3M30 33l5-3M36 26l4-3" stroke={T} strokeWidth="2" strokeLinecap="round" /><path d="M44 18c0-6 4-9 8-9-1 5-2 8-8 9zM48 22c5-2 9 0 11 3-5 3-8 2-11-3z" fill="#22c55e" {...o} /></>,
  potato: () => <><path d="M10 34c0-12 12-18 24-18s22 8 20 22-12 16-24 15S10 46 10 34z" fill="#c08457" {...o} /><g fill="#8a5a36"><circle cx="24" cy="30" r="1.8" /><circle cx="38" cy="26" r="1.8" /><circle cx="42" cy="40" r="1.8" /><circle cx="28" cy="43" r="1.8" /></g></>,
  onion: () => <><path d="M32 12c2 6 3 8 3 10 12 3 18 12 15 22-2 8-10 12-18 12S16 52 14 44c-3-10 3-19 15-22 0-2 1-4 3-10z" fill="#c084fc" {...o} /><path d="M32 22c-6 6-8 18-3 32M32 22c6 6 8 18 3 32" fill="none" stroke="#fff" strokeWidth="2" opacity=".6" /></>,
  veg: () => <><path d="M32 56C12 54 8 34 18 22c6-6 10-4 14-12 4 8 8 6 14 12 10 12 6 32-14 34z" fill="#22c55e" {...o} /><path d="M32 56V22M32 44l-9-8M32 38l9-8" stroke="#bbf7d0" strokeWidth="3" strokeLinecap="round" fill="none" /></>,
  chicken: () => <><path d="M14 20c4-8 18-8 26 0 7 7 6 16-2 20l-7 4 5 6c2 2 5 1 5 4s-5 4-7 2l-5-4c-3 2-7 0-8-3-8-2-15-12-7-29z" fill="#b45309" {...o} transform="translate(2 0)" /><path d="M20 24c3-4 9-4 12-1" stroke="#fde68a" strokeWidth="2.5" fill="none" strokeLinecap="round" /></>,
  fish: () => <><path d="M6 32c10-14 26-14 36 0-10 14-26 14-36 0z" fill="#38bdf8" {...o} /><path d="M42 32l16-12v24z" fill="#0ea5e9" {...o} /><circle cx="17" cy="29" r="2.4" fill={T} /><path d="M26 22c3 5 3 15 0 20" fill="none" stroke="#fff" strokeWidth="2" opacity=".7" /></>,
  sausage: () => <><rect x="8" y="24" width="48" height="16" rx="8" transform="rotate(-20 32 32)" fill="#f87171" {...o} /><path d="M20 32l2-5M32 28l2-5M44 24l2-5" stroke="#fff" strokeWidth="2" opacity=".6" strokeLinecap="round" /></>,
  juice: () => <><path d="M16 20h32v36a2 2 0 0 1-2 2H18a2 2 0 0 1-2-2z" fill="#fff7ed" {...o} /><rect x="16" y="30" width="32" height="16" fill="#fb923c" /><circle cx="32" cy="38" r="5" fill="#fde68a" {...o} /><path d="M16 20 22 12h20l6 8z" fill="#fed7aa" {...o} /><path d="M36 12V4h8" fill="none" {...o} /></>,
  drink: () => <><path d="M26 8h12v8l4 6v32a3 3 0 0 1-3 3H25a3 3 0 0 1-3-3V22l4-6z" fill="#ef4444" {...o} /><rect x="22" y="30" width="20" height="14" fill="#fff" /><text x="32" y="40" textAnchor="middle" fontSize="8" fontWeight="800" fill="#ef4444">COLA</text><rect x="26" y="6" width="12" height="4" rx="1" fill="#1f2937" /></>,
  water: () => <><path d="M26 8h12v7l5 7v32a3 3 0 0 1-3 3H24a3 3 0 0 1-3-3V22l5-7z" fill="#e0f2fe" {...o} /><rect x="21" y="32" width="22" height="10" fill="#38bdf8" /><path d="M32 33c-3 3-3 6 0 6s3-3 0-6z" fill="#fff" /><rect x="27" y="5" width="10" height="5" rx="1.5" fill="#0ea5e9" {...o} /></>,
  rice: ({ label }) => <><path d="M16 16h32l3 40H13z" fill="#fef3c7" {...o} /><path d="M16 16h32l-2 6H18z" fill="#fcd34d" {...o} /><rect x="17" y="30" width="30" height="14" fill="#f59e0b" /><text x="32" y="40.5" textAnchor="middle" fontSize={label.length > 5 ? 7 : 9} fontWeight="800" fill="#fff">{label}</text></>,
  cake: () => <><path d="M8 40h48v14a3 3 0 0 1-3 3H11a3 3 0 0 1-3-3z" fill="#f9a8d4" {...o} /><path d="M8 40c0-10 6-14 12-14h24c6 0 12 4 12 14z" fill="#fde68a" {...o} /><path d="M8 40c4 5 8 5 12 0 4 5 8 5 12 0 4 5 8 5 12 0 4 5 8 5 12 0" fill="none" stroke="#fff" strokeWidth="3" /><circle cx="32" cy="22" r="4.5" fill="#ef4444" {...o} /></>,
  icecream: () => <><path d="M20 30h24L32 58z" fill="#d97706" {...o} /><path d="M24 36l8 14M32 34l6 10" stroke="#fde68a" strokeWidth="1.8" opacity=".8" /><circle cx="25" cy="26" r="9" fill="#f9a8d4" {...o} /><circle cx="39" cy="26" r="9" fill="#fde68a" {...o} /><circle cx="32" cy="16" r="9" fill="#a7f3d0" {...o} /></>,
  pizza: () => <><path d="M8 18c14-8 34-8 48 0L32 58z" fill="#fbbf24" {...o} /><path d="M8 18c14-8 34-8 48 0l-2 4C40 15 24 15 10 22z" fill="#d97706" {...o} /><circle cx="26" cy="28" r="4.5" fill="#ef4444" {...o} /><circle cx="38" cy="30" r="4.5" fill="#ef4444" {...o} /><circle cx="32" cy="42" r="4.5" fill="#ef4444" {...o} /></>,
  meal: () => <><path d="M8 32h48c0 14-10 22-24 22S8 46 8 32z" fill="#f97316" {...o} /><path d="M12 32c4-6 10-8 20-8s16 2 20 8z" fill="#fde68a" {...o} /><path d="M22 20c-3-3 3-5 0-9M32 20c-3-3 3-5 0-9M42 20c-3-3 3-5 0-9" stroke="#9ca3af" strokeWidth="2" fill="none" strokeLinecap="round" /></>,
  pack: ({ label }) => <><path d="M14 14h36v42a3 3 0 0 1-3 3H17a3 3 0 0 1-3-3z" fill="#e7e5e4" {...o} /><path d="M14 14h36v8H14z" fill="#a8a29e" {...o} /><rect x="14" y="28" width="36" height="18" fill="#16a34a" /><text x="32" y="42" textAnchor="middle" fontSize="14" fontWeight="800" fill="#fff">{label}</text></>,
};

// first match wins, so specific words come before general ones ("apple juice" is a juice, "ice cream" is not a cream)
const RULES: [string, string[]][] = [
  ["icecream", ["ice cream", "icecream", "kulfi", "gelato", "popsicle"]],
  ["juice", ["juice", "smoothie", "squash", "lassi", "milkshake", "shake", "nimbu pani"]],
  ["drink", ["soda", "cola", "pepsi", "coke", "sprite", "fanta", "beer", "wine", "energy drink", "drink", "tea", "coffee"]],
  ["watermelon", ["watermelon", "melon", "tarbooz", "muskmelon"]],
  ["water", ["water", "bottle", "sparkling"]],
  ["milk", ["milk", "doodh", "cream", "paal"]],
  ["yogurt", ["yogurt", "yoghurt", "curd", "dahi", "raita", "buttermilk", "chaas"]],
  ["cheese", ["cheese", "paneer", "tofu", "cottage"]],
  ["butter", ["butter", "ghee", "margarine", "makhan"]],
  ["egg", ["egg", "anda", "omelette", "omelet"]],
  ["bread", ["bread", "toast", "bun", "pav", "roti", "chapati", "chapathi", "paratha", "naan", "sandwich", "bagel", "croissant", "dosa", "idli", "wrap", "tortilla", "bakery"]],
  ["apple", ["apple", "seb", "pear"]],
  ["banana", ["banana", "kela", "plantain"]],
  ["lemon", ["lemon", "lime", "nimbu"]],
  ["orange", ["orange", "mosambi", "tangerine", "mandarin", "peach", "apricot", "papaya"]],
  ["grapes", ["grape", "angoor", "blueberr", "plum", "jamun", "cherry", "cherries"]],
  ["strawberry", ["strawberr", "raspberr", "pomegranate", "anar"]],
  ["mango", ["mango", "aam", "pineapple", "kiwi", "guava", "fruit"]],
  ["tomato", ["tomato", "tamatar", "chilli", "chili", "pepper", "capsicum"]],
  ["carrot", ["carrot", "gajar", "radish", "beetroot", "mooli"]],
  ["potato", ["potato", "aloo", "sweet potato", "yam", "ginger", "garlic"]],
  ["onion", ["onion", "pyaaz", "shallot"]],
  ["veg", ["lettuce", "salad", "spinach", "palak", "cabbage", "broccoli", "cauliflower", "gobi", "coriander", "mint", "cucumber", "peas", "beans", "okra", "bhindi", "brinjal", "eggplant", "vegetable", "veggie", "veg", "greens", "leaf"]],
  ["pizza", ["pizza", "burger", "hamburger", "cheeseburger", "fries", "momos", "samosa"]],
  ["sausage", ["sausage", "bacon", "ham", "salami", "hot dog", "kebab", "nugget"]],
  ["chicken", ["chicken", "meat", "mutton", "lamb", "beef", "pork", "turkey", "steak", "keema", "drumstick"]],
  ["fish", ["fish", "prawn", "shrimp", "salmon", "tuna", "crab", "seafood"]],
  ["cake", ["cake", "pastry", "dessert", "sweet", "chocolate", "pudding", "brownie", "cookie", "biscuit", "donut", "doughnut", "mithai", "ladoo", "halwa", "jam"]],
  ["meal", ["leftover", "curry", "biryani", "soup", "dal", "sabzi", "pulao", "khichdi", "stew", "meal", "lunch", "dinner", "noodles", "pasta", "fried rice", "gravy"]],
  ["rice", ["rice", "chawal", "lentil", "flour", "atta", "maida", "sugar", "salt", "oats", "cereal", "cornflakes", "poha", "rajma", "chickpea", "chana", "grain", "sauce", "ketchup", "oil", "spice", "masala", "nuts", "almond"]],
];
const part = (w: string) => w.replace(/\s+/g, "\\s*") + (w.length <= 4 ? "(?:e?s)?\\b" : "");
const RX = RULES.map(([k, words]) => [k, new RegExp(`\\b(${words.map(part).join("|")})`, "i")] as const);
const CATEGORY: Record<string, string> = { Dairy: "milk", Fruit: "apple", Vegetables: "veg", Meat: "chicken", Leftovers: "meal", Bakery: "bread", Pantry: "rice", Beverages: "juice" };

const KIND_CATEGORY: Record<string, string> = { milk: "Dairy", yogurt: "Dairy", cheese: "Dairy", butter: "Dairy", egg: "Dairy", apple: "Fruit", banana: "Fruit", orange: "Fruit", lemon: "Fruit", grapes: "Fruit", strawberry: "Fruit", mango: "Fruit", watermelon: "Fruit",
  tomato: "Vegetables", carrot: "Vegetables", potato: "Vegetables", onion: "Vegetables", veg: "Vegetables", chicken: "Meat", fish: "Meat", sausage: "Meat", bread: "Bakery", cake: "Bakery", meal: "Leftovers", pizza: "Leftovers", juice: "Beverages", drink: "Beverages", water: "Beverages", rice: "Pantry" };
/** Category suggested by the food name ("milk" -> Dairy), or undefined if unknown. */
export const suggestCategory = (name: string) => KIND_CATEGORY[foodKind(name)];

export function foodKind(name: string, category?: string): string {
  const n = name.trim();
  for (const [k, rx] of RX) if (rx.test(n)) return k;
  return (category && CATEGORY[category]) || "pack";
}

export default function FoodImage({ name, category, size = 48, className = "" }: { name: string; category?: string; size?: number; className?: string }) {
  const kind = foodKind(name, category); const word = name.trim().split(/\s+/).pop() ?? "";
  const label = kind === "rice" ? (RX.find(([k]) => k === "rice")![1].exec(name)?.[1] ?? "PACK").toUpperCase().slice(0, 7) : (name.trim()[0] ?? "?").toUpperCase();
  const Art = ART[kind] ?? ART.pack;
  return <span role="img" aria-label={`${name} (${kind === "pack" ? "grocery pack" : kind})`} data-kind={kind} title={word}
    className={`inline-flex shrink-0 items-center justify-center rounded-2xl bg-brand-50 ring-1 ring-brand-100 ${className}`} style={{ width: size, height: size }}>
    <svg viewBox="0 0 64 64" width={size * 0.82} height={size * 0.82} aria-hidden="true">{Art({ label })}</svg></span>;
}
