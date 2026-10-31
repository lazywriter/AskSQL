// Creates data/shop.db: a small e-commerce dataset (customers, products, orders, order_items).
// Deterministic (seeded PRNG) so results are reproducible. Run: npm run seed
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const dbPath = path.resolve("data/shop.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
if (fs.existsSync(dbPath)) fs.rmSync(dbPath);

let seed = 42;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const int = (min, max) => min + Math.floor(rand() * (max - min + 1));

const db = new DatabaseSync(dbPath);
db.exec(`
CREATE TABLE customers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  city TEXT NOT NULL,
  country TEXT NOT NULL,
  signup_date TEXT NOT NULL            -- ISO date YYYY-MM-DD
);
CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price REAL NOT NULL                  -- unit price in USD
);
CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  order_date TEXT NOT NULL,            -- ISO date YYYY-MM-DD
  status TEXT NOT NULL                 -- 'delivered' | 'shipped' | 'cancelled' | 'returned'
);
CREATE TABLE order_items (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL             -- price paid per unit (after discount)
);
`);

const firstNames = ["Aarav", "Priya", "Liam", "Emma", "Noah", "Olivia", "Rohan", "Ananya", "Lucas", "Mia", "Kenji", "Sofia", "Arjun", "Isha", "Ethan", "Zara", "Mateo", "Chloe", "Vikram", "Sara"];
const lastNames = ["Sharma", "Patel", "Smith", "Johnson", "Garcia", "Tanaka", "Muller", "Khan", "Rossi", "Brown", "Singh", "Lee", "Martin", "Silva", "Gupta"];
const places = [["Mumbai", "India"], ["Bengaluru", "India"], ["Delhi", "India"], ["Pune", "India"], ["New York", "USA"], ["San Francisco", "USA"], ["Austin", "USA"], ["London", "UK"], ["Manchester", "UK"], ["Berlin", "Germany"], ["Tokyo", "Japan"], ["Toronto", "Canada"], ["Sydney", "Australia"]];

const catalog = {
  Electronics: [["Wireless Earbuds", 59], ["Smartwatch", 199], ["Bluetooth Speaker", 79], ["USB-C Hub", 39], ["Mechanical Keyboard", 129], ["4K Monitor", 349], ["Noise-Cancelling Headphones", 249]],
  Books: [["Clean Code", 35], ["Designing Data-Intensive Apps", 45], ["Atomic Habits", 18], ["The Pragmatic Programmer", 40], ["Deep Work", 16]],
  Home: [["Coffee Maker", 89], ["Desk Lamp", 29], ["Air Purifier", 159], ["Ergonomic Chair", 299], ["Standing Desk", 449]],
  Clothing: [["Hoodie", 49], ["Running Shoes", 119], ["Denim Jacket", 89], ["T-Shirt", 19], ["Backpack", 69]],
  Sports: [["Yoga Mat", 25], ["Dumbbell Set", 99], ["Cycling Helmet", 65], ["Fitness Tracker", 89]],
};

const insCustomer = db.prepare("INSERT INTO customers (id, name, email, city, country, signup_date) VALUES (?, ?, ?, ?, ?, ?)");
const insProduct = db.prepare("INSERT INTO products (id, name, category, price) VALUES (?, ?, ?, ?)");
const insOrder = db.prepare("INSERT INTO orders (id, customer_id, order_date, status) VALUES (?, ?, ?, ?)");
const insItem = db.prepare("INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?)");

const start = new Date("2025-01-01");
const end = new Date("2026-10-30");
const span = end - start;
const iso = (d) => d.toISOString().slice(0, 10);

db.exec("BEGIN");

const NUM_CUSTOMERS = 300;
for (let i = 1; i <= NUM_CUSTOMERS; i++) {
  const first = pick(firstNames), last = pick(lastNames);
  const [city, country] = pick(places);
  insCustomer.run(i, `${first} ${last}`, `${first}.${last}${i}@example.com`.toLowerCase(), city, country, iso(new Date(start.getTime() + rand() * span * 0.8)));
}

const products = [];
let pid = 1;
for (const [category, items] of Object.entries(catalog)) {
  for (const [name, price] of items) {
    insProduct.run(pid, name, category, price);
    products.push({ id: pid++, price, category });
  }
}

const NUM_ORDERS = 4000;
for (let o = 1; o <= NUM_ORDERS; o++) {
  // Skew towards later dates (growing business) and add a November/December bump.
  let d = new Date(start.getTime() + Math.sqrt(rand()) * span);
  if (d.getMonth() < 10 && rand() < 0.15) {
    // Re-draw some orders into Nov/Dec of the same year for a holiday bump.
    const holiday = new Date(Date.UTC(d.getUTCFullYear(), 10 + int(0, 1), int(1, 28)));
    if (holiday < end) d = holiday;
  }
  const r = rand();
  const status = r < 0.8 ? "delivered" : r < 0.9 ? "shipped" : r < 0.96 ? "cancelled" : "returned";
  insOrder.run(o, int(1, NUM_CUSTOMERS), iso(d), status);
  const n = int(1, 4);
  for (let k = 0; k < n; k++) {
    const p = pick(products);
    const discount = rand() < 0.2 ? 0.85 : 1;
    insItem.run(o, p.id, int(1, 3), Math.round(p.price * discount * 100) / 100);
  }
}
db.exec("COMMIT");
const count = (t) => db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get().c;
console.log(`Seeded ${dbPath}: ${count("customers")} customers, ${count("products")} products, ${count("orders")} orders, ${count("order_items")} items`);
db.close();
