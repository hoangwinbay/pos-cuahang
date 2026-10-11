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

    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      platform TEXT,
      device_type TEXT,
      ip TEXT,
      role TEXT,
      user_name TEXT,
      last_seen INTEGER,
      custom_name INTEGER DEFAULT 0
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

  // Chuyển đổi dữ liệu sang toàn bộ thực đơn chuẩn của Bún Mắm Miền Tây
  try {
    const hasCorrectMenu = db.prepare("SELECT COUNT(*) as count FROM categories WHERE name = 'Hộp mang về'").get()?.count > 0;
    if (!hasCorrectMenu) {
      db.exec('DELETE FROM products;');
      db.exec('DELETE FROM categories;');
      db.exec('DELETE FROM active_table_orders;');
      try {
        db.exec("DELETE FROM sqlite_sequence WHERE name IN ('categories', 'products');");
      } catch (e) {}
    }
  } catch (e) {}

  // Seed default categories & products if empty
  const categoryCount = db.prepare('SELECT COUNT(*) as count FROM categories').get().count;
  if (categoryCount === 0) {
    const insertCat = db.prepare('INSERT INTO categories (name, icon) VALUES (?, ?)');
    insertCat.run('Hộp mang về', '');
    insertCat.run('Bún mắm', '');
    insertCat.run('Đồ gọi thêm', '');
    insertCat.run('Đồ uống', '');

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
      // 1. Hộp mang về
      ['HMV01', 'Hộp mang về', catMap['Hộp mang về'], 0, 5000, 9999, 'hộp', ''],

      // 2. Bún mắm
      ['BM01', 'Bún mắm chả cá', catMap['Bún mắm'], 0, 45000, 9999, 'tô', ''],
      ['BM02', 'Bún mắm heo quay', catMap['Bún mắm'], 0, 55000, 9999, 'tô', ''],
      ['BM03', 'Bún mắm chả cá heo quay', catMap['Bún mắm'], 0, 60000, 9999, 'tô', ''],
      ['BM04', 'Bún mắm cá tươi', catMap['Bún mắm'], 0, 55000, 9999, 'tô', ''],
      ['BM05', 'Bún mắm mực', catMap['Bún mắm'], 0, 80000, 9999, 'tô', ''],
      ['BM06', 'Bún mắm tôm', catMap['Bún mắm'], 0, 80000, 9999, 'tô', ''],
      ['BM07', 'Bún mắm đầy đủ', catMap['Bún mắm'], 0, 80000, 9999, 'tô', ''],
      ['BM08', 'Bún mắm đặc biệt', catMap['Bún mắm'], 0, 100000, 9999, 'tô', ''],

      // 3. Đồ gọi thêm
      ['THEM01', 'Thêm tôm', catMap['Đồ gọi thêm'], 0, 18000, 9999, 'phần', ''],
      ['THEM02', 'Thêm trứng vịt lộn', catMap['Đồ gọi thêm'], 0, 10000, 9999, 'quả', ''],
      ['THEM03', 'Thêm chả cá', catMap['Đồ gọi thêm'], 0, 20000, 9999, 'phần', ''],
      ['THEM04', 'Thêm mực', catMap['Đồ gọi thêm'], 0, 40000, 9999, 'phần', ''],
      ['THEM05', 'Thêm cá tươi', catMap['Đồ gọi thêm'], 0, 40000, 9999, 'phần', ''],
      ['THEM06', 'Thêm heo quay', catMap['Đồ gọi thêm'], 0, 40000, 9999, 'phần', ''],
      ['THEM07', 'Thêm rau', catMap['Đồ gọi thêm'], 0, 5000, 9999, 'đĩa', ''],

      // 4. Đồ uống
      ['DU01', 'Trà đá', catMap['Đồ uống'], 0, 5000, 9999, 'ly', ''],
      ['DU02', 'Sữa đậu', catMap['Đồ uống'], 0, 10000, 9999, 'ly', ''],
      ['DU03', 'Coca', catMap['Đồ uống'], 0, 15000, 9999, 'lon', ''],
      ['DU04', 'Dừa tươi', catMap['Đồ uống'], 0, 25000, 9999, 'quả', ''],
      ['DU05', 'Bia', catMap['Đồ uống'], 0, 25000, 9999, 'lon', ''],
      ['DU06', 'Lavie', catMap['Đồ uống'], 0, 10000, 9999, 'chai', '']
    ];

    for (const p of seedProducts) {
      insertProd.run(...p);
    }
  }
}

initDatabase();

module.exports = db;
