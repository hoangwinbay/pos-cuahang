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
  `);

  // Ensure cashier columns exist in orders table
  try {
    db.exec('ALTER TABLE orders ADD COLUMN cashier_id INTEGER;');
  } catch (e) {}
  try {
    db.exec('ALTER TABLE orders ADD COLUMN cashier_name TEXT DEFAULT "Thu ngân";');
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
      ['store_name', 'CỬA HÀNG TẠP HÓA POS PRO'],
      ['store_address', '123 Đường Lê Lợi, Phường Bến Thành, Quận 1, TP. HCM'],
      ['store_phone', '0909 888 999'],
      ['store_greeting', 'Cảm ơn quý khách và hẹn gặp lại! Hotline hỗ trợ: 0909 888 999'],
      ['bank_id', 'MB'],
      ['bank_account_no', '0909888999'],
      ['bank_account_name', 'NGUYEN VAN POS'],
      ['paper_size', '80mm']
    ];
    for (const [k, v] of defaultSettings) {
      insertSetting.run(k, v);
    }
  }

  // Seed default categories & products if empty
  const categoryCount = db.prepare('SELECT COUNT(*) as count FROM categories').get().count;
  if (categoryCount === 0) {
    const insertCat = db.prepare('INSERT INTO categories (name, icon) VALUES (?, ?)');
    insertCat.run('Đồ uống', '🥤');
    insertCat.run('Bánh kẹo & Ăn vặt', '🍪');
    insertCat.run('Sữa & Chế phẩm', '🥛');
    insertCat.run('Mì & Gia vị', '🍜');
    insertCat.run('Hóa mỹ phẩm', '🧼');
    insertCat.run('Nhu yếu phẩm', '🧻');

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
      ['8935049500018', 'Coca Cola 320ml', catMap['Đồ uống'], 8000, 10000, 50, 'lon', '🥤'],
      ['8935049500025', 'Nước khoáng LaVie 500ml', catMap['Đồ uống'], 4000, 6000, 80, 'chai', '💧'],
      ['8935049500032', 'Nước tăng lực Red Bull 250ml', catMap['Đồ uống'], 11000, 14000, 45, 'lon', '⚡'],
      ['8935049500049', 'Cà phê sữa đá Highlands lon', catMap['Đồ uống'], 12000, 16000, 30, 'lon', '☕'],
      ['8935049500056', 'Trà xanh Không Độ 455ml', catMap['Đồ uống'], 7500, 10000, 60, 'chai', '🍵'],
      ['8935049500063', 'Snack Oishi Tôm cay giòn', catMap['Bánh kẹo & Ăn vặt'], 5000, 7000, 40, 'gói', '🍿'],
      ['8935049500070', 'Bánh quy Oreo Vani 133g', catMap['Bánh kẹo & Ăn vặt'], 14000, 18000, 25, 'gói', '🍪'],
      ['8935049500087', 'Kẹo Alpenliebe Dâu kem thỏi', catMap['Bánh kẹo & Ăn vặt'], 8000, 10000, 50, 'thỏi', '🍬'],
      ['8935049500094', 'Bim bim Khoai tây Lay\'s 56g', catMap['Bánh kẹo & Ăn vặt'], 10500, 13000, 35, 'gói', '🥔'],
      ['8935049500100', 'Sữa tươi tiệt trùng Vinamilk 180ml', catMap['Sữa & Chế phẩm'], 7000, 9000, 75, 'hộp', '🥛'],
      ['8935049500117', 'Sữa đặc có đường Ông Thọ 380g', catMap['Sữa & Chế phẩm'], 21000, 25000, 20, 'lon', '🥫'],
      ['8935049500124', 'Sữa chua uống Probi 65ml', catMap['Sữa & Chế phẩm'], 4500, 6000, 48, 'chai', '🍶'],
      ['8935049500131', 'Mì tôm Hảo Hảo Tôm chua cay', catMap['Mì & Gia vị'], 3800, 5000, 120, 'gói', '🍜'],
      ['8935049500148', 'Mì Omachi xốt bò hầm', catMap['Mì & Gia vị'], 7200, 9500, 65, 'gói', '🍜'],
      ['8935049500155', 'Dầu ăn đậu nành Simply 1L', catMap['Mì & Gia vị'], 54000, 65000, 15, 'chai', '🫒'],
      ['8935049500162', 'Nước mắm Nam Ngư Đệ Nhị 900ml', catMap['Mì & Gia vị'], 20000, 25000, 25, 'chai', '🍾'],
      ['8935049500179', 'Hạt nêm Knorr Thịt thăn xương ống 400g', catMap['Mì & Gia vị'], 30000, 36000, 18, 'gói', '🧂'],
      ['8935049500186', 'Khăn giấy lụa Pulppy 180 tờ', catMap['Nhu yếu phẩm'], 17000, 22000, 30, 'hộp', '🧻'],
      ['8935049500193', 'Nước rửa chén Sunlight Chanh 750g', catMap['Hóa mỹ phẩm'], 24000, 29000, 20, 'chai', '🧴'],
      ['8935049500209', 'Kem đánh răng Closeup Thơm mát 180g', catMap['Hóa mỹ phẩm'], 32000, 39000, 18, 'tuýp', '🪥'],
      ['8935049500216', 'Xà bông tắm Lifebuoy Bảo vệ 90g', catMap['Hóa mỹ phẩm'], 11000, 14000, 35, 'bánh', '🧼']
    ];

    for (const p of seedProducts) {
      insertProd.run(...p);
    }
  }
}

initDatabase();

module.exports = db;
