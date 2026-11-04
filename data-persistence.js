const fs = require('fs');
const path = require('path');

const BACKUP_FILE = path.join(__dirname, 'data_backup.json');

function saveDataBackup(db) {
  try {
    if (!db) return;
    const backup = {
      users: db.prepare(`SELECT id, username, password, name, role, pin, active, phone, email, created_at FROM users`).all(),
      active_table_orders: db.prepare(`SELECT table_name, order_data, updated_at FROM active_table_orders`).all(),
      table_definitions: db.prepare(`SELECT table_name, sort_order FROM table_definitions ORDER BY sort_order ASC, rowid ASC`).all(),
      settings: db.prepare(`SELECT key, value FROM settings`).all(),
      saved_at: new Date().toISOString()
    };
    fs.writeFileSync(BACKUP_FILE, JSON.stringify(backup, null, 2), 'utf8');
    try {
      db.exec('PRAGMA wal_checkpoint(PASSIVE);');
    } catch (e) {}
  } catch (e) {
    console.warn('Lỗi ghi file sao lưu data_backup.json:', e.message);
  }
}

function restoreDataBackup(db) {
  try {
    if (!db) return;
    if (!fs.existsSync(BACKUP_FILE)) return;
    const raw = fs.readFileSync(BACKUP_FILE, 'utf8');
    if (!raw) return;
    const backup = JSON.parse(raw);
    if (!backup) return;

    // 1. Phục hồi nhân viên & users
    if (Array.isArray(backup.users) && backup.users.length > 0) {
      const insertUser = db.prepare(`
        INSERT OR IGNORE INTO users (id, username, password, name, role, pin, active, phone, email, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const updateUser = db.prepare(`
        UPDATE users SET name = ?, phone = ?, active = ? WHERE id = ?
      `);
      for (const u of backup.users) {
        insertUser.run(u.id, u.username, u.password, u.name, u.role, u.pin, u.active, u.phone || '', u.email || '', u.created_at || new Date().toISOString());
        updateUser.run(u.name, u.phone || '', u.active, u.id);
      }
    }

    // 2. Phục hồi đơn các bàn đang vào
    if (Array.isArray(backup.active_table_orders) && backup.active_table_orders.length > 0) {
      const upsertOrder = db.prepare(`
        INSERT INTO active_table_orders (table_name, order_data, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(table_name) DO UPDATE SET order_data = excluded.order_data, updated_at = excluded.updated_at
      `);
      for (const o of backup.active_table_orders) {
        upsertOrder.run(o.table_name, o.order_data, o.updated_at || new Date().toISOString());
      }
    }

    // 3. Phục hồi danh sách bàn
    if (Array.isArray(backup.table_definitions) && backup.table_definitions.length > 0) {
      const insertTable = db.prepare(`
        INSERT OR IGNORE INTO table_definitions (table_name, sort_order)
        VALUES (?, ?)
      `);
      for (const t of backup.table_definitions) {
        insertTable.run(t.table_name, t.sort_order || 0);
      }
    }

    console.log('Đã nạp và phục hồi toàn bộ dữ liệu bàn & nhân viên từ data_backup.json!');
  } catch (e) {
    console.warn('Lỗi phục hồi dữ liệu sao lưu:', e.message);
  }
}

module.exports = {
  saveDataBackup,
  restoreDataBackup
};
