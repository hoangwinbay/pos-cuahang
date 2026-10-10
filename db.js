const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

const dbPath = path.join(__dirname, 'pos.db');
const db = new DatabaseSync(dbPath);

// Enable WAL mode and foreign keys for speed & consistency
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      icon TEXT DEFAULT '📦'
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      barcode TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      cost_price REAL DEFAULT 0,
      price REAL NOT NULL,
      stock INTEGER DEFAULT 0,
      unit TEXT DEFAULT 'cái',
      image TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_code TEXT UNIQUE NOT NULL,
      subtotal REAL NOT NULL,
      discount REAL DEFAULT 0,
      discount_type TEXT DEFAULT 'amount',
      total REAL NOT NULL,
      cash_given REAL DEFAULT 0,
      change_returned REAL DEFAULT 0,
      payment_method TEXT DEFAULT 'cash',
      customer_name TEXT DEFAULT 'Khách lẻ',
      customer_phone TEXT DEFAULT '',
      note TEXT DEFAULT '',
      status TEXT DEFAULT 'completed',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
      product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
      product_name TEXT NOT NULL,
      barcode TEXT,
      unit TEXT,
      cost_price REAL DEFAULT 0,
      price REAL NOT NULL,
      quantity INTEGER NOT NULL,
      total REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'staff',
      pin TEXT DEFAULT '1234',
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS active_table_orders (
      table_name TEXT PRIMARY KEY,
      order_data TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS table_definitions (
      table_name TEXT PRIMARY KEY,
      sort_order INTEGER DEFAULT 0
    );
  `);

  // Seed default table definitions if empty
  try {
    const tableDefCount = db.prepare('SELECT COUNT(*) as count FROM table_definitions').get()?.count || 0;
    if (tableDefCount === 0) {
      const insertTableDef = db.prepare('INSERT INTO table_definitions (table_name, sort_order) VALUES (?, ?)');
      for (let i = 1; i <= 12; i++) {
        insertTableDef.run(`Bàn ${i}`, i);
      }
    }
  } catch (e) {}

  // Ensure cashier and table_name columns exist in orders table
  try {
    db.exec('ALTER TABLE orders ADD COLUMN cashier_id INTEGER;');
  } catch (e) {}
  try {
    db.exec('ALTER TABLE orders ADD COLUMN cashier_name TEXT DEFAULT "Thu ngân";');
  } catch (e) {}
  try {
    db.exec('ALTER TABLE orders ADD COLUMN table_name TEXT DEFAULT "";');
  } catch (e) {}

  // Seed default users if empty
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  if (userCount === 0) {
    const insertUser = db.prepare('INSERT INTO users (username, password, name, role, pin, active) VALUES (?, ?, ?, ?, ?, ?)');
    insertUser.run('admin', '123', 'Chủ Cửa Hàng', 'admin', '9999', 1);
    insertUser.run('nhanvien', '123', 'Nhân Viên Thu Ngân', 'staff', '1234', 1);
  }

  // Seed default settings if empty
  const settingCount = db.prepare('SELECT COUNT(*) as count FROM settings').get().count;
  if (settingCount === 0) {
    const insertSetting = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
    const defaultSettings = [
      ['store_name', 'BÚN MẮM MIỀN TÂY'],
      ['store_address', '123 Đường Lê Lợi, Phường Bến Thành, Quận 1, TP. HCM'],
      ['store_phone', '0909 888 999'],
      ['store_greeting', 'Cảm ơn quý khách và hẹn gặp lại! Hotline hỗ trợ: 0909 888 999'],
      ['bank_id', 'MB'],
      ['bank_account_no', '0909888999'],
      ['bank_account_name', 'BUN MAM MIEN TAY'],
      ['paper_size', '80mm'],
      ['zalo_mini_app_id', '3906597427562388428']
    ];
    for (const [k, v] of defaultSettings) {
      insertSetting.run(k, v);
    }
  }

  // Cập nhật tên quán sang BÚN MẮM MIỀN TÂY và lưu ID Zalo Mini App
  try {
    db.exec(`
      UPDATE settings 
      SET value = 'BÚN MẮM MIỀN TÂY' 
      WHERE key = 'store_name' AND (value = 'CỬA HÀNG TẠP HÓA POS PRO' OR value = 'QUÁN ĂN - CÀ PHÊ' OR value = 'POS ORDER' OR value = '' OR value IS NULL);
      INSERT OR REPLACE INTO settings (key, value) VALUES ('zalo_mini_app_id', '3906597427562388428');
    `);
  } catch (e) {}

  // Clean up legacy emoji icons from categories and products
  try {
    db.exec("UPDATE categories SET icon = '' WHERE icon IS NOT NULL;");
    db.exec("UPDATE products SET image = '' WHERE image NOT LIKE 'data:image%' AND image NOT LIKE 'http%' AND image NOT LIKE '/%';");
  } catch (e) {}

  // Seed default categories & products if empty
  const categoryCount = db.prepare('SELECT COUNT(*) as count FROM categories').get().count;
  if (categoryCount === 0) {
    const insertCat = db.prepare('INSERT INTO categories (name, icon) VALUES (?, ?)');
    insertCat.run('Đồ uống', '');
    insertCat.run('Bánh kẹo & Ăn vặt', '');
    insertCat.run('Món ăn nhanh', '');

    const catMap = {};
    const cats = db.prepare('SELECT id, name FROM categories').all();
    for (const c of cats) {
      catMap[c.name] = c.id;
    }

    const insertProd = db.prepare(`
      INSERT INTO products (barcode, name, category_id, cost_price, price, stock, unit, image)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const seedProducts = [
      ['8935049500018', 'Cà phê đen đá', catMap['Đồ uống'], 0, 20000, 9999, 'ly', ''],
      ['8935049500025', 'Cà phê sữa đá', catMap['Đồ uống'], 0, 25000, 9999, 'ly', ''],
      ['8935049500032', 'Bạc xỉu đá', catMap['Đồ uống'], 0, 28000, 9999, 'ly', ''],
      ['8935049500049', 'Trà đào cam sả', catMap['Đồ uống'], 0, 30000, 9999, 'ly', ''],
      ['8935049500056', 'Trà chanh tắc đá', catMap['Đồ uống'], 0, 18000, 9999, 'ly', ''],
      ['8935049500063', 'Bánh mì pate trứng', catMap['Món ăn nhanh'], 0, 25000, 9999, 'phần', ''],
      ['8935049500070', 'Khoai tây chiên', catMap['Món ăn nhanh'], 0, 25000, 9999, 'phần', ''],
      ['8935049500087', 'Hướng dương rang húng lìu', catMap['Bánh kẹo & Ăn vặt'], 0, 15000, 9999, 'đĩa', '']
    ];

    for (const p of seedProducts) {
      insertProd.run(...p);
    }
  }
}

initDatabase();

module.exports = db;
