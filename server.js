const express = require('express');
const cors = require('cors');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const db = require('./db.js');

const app = express();
const PORT = process.env.PORT || 3000;
const AUTH_SECRET = 'pos_secret_key_' + (process.env.AUTH_SECRET || 'antigravity_pos_2026');

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// -------------------------------------------------------------
// AUTH TOKEN HELPERS (HMAC-SHA256 Token)
// -------------------------------------------------------------
function generateToken(user) {
  const payload = {
    userId: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    iat: Date.now()
  };
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', AUTH_SECRET).update(b64).digest('base64url');
  return `${b64}.${signature}`;
}

function verifyToken(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [b64, signature] = parts;
  const expectedSig = crypto.createHmac('sha256', AUTH_SECRET).update(b64).digest('base64url');
  if (signature !== expectedSig) return null;
  try {
    const jsonStr = Buffer.from(b64, 'base64url').toString('utf8');
    return JSON.parse(jsonStr);
  } catch (e) {
    return null;
  }
}

// Auth Middleware: attach req.user if valid token present
app.use((req, res, next) => {
  const authHeader = req.headers.authorization || req.headers['x-auth-token'];
  let token = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (authHeader) {
    token = authHeader;
  }

  if (token) {
    const decoded = verifyToken(token);
    if (decoded) {
      // Fetch fresh user from DB
      const user = db.prepare('SELECT id, username, name, role, active FROM users WHERE id = ?').get(decoded.userId);
      if (user && user.active) {
        req.user = user;
      }
    }
  }
  next();
});

// Require Admin (Chủ cửa hàng) Middleware
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Vui lòng đăng nhập tài khoản chủ cửa hàng' });
  }
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Chỉ tài khoản Chủ Cửa Hàng mới có quyền thực hiện thao tác này!' });
  }
  next();
}

// -------------------------------------------------------------
// LOCAL NETWORK IP DETECTOR
// -------------------------------------------------------------
function getLocalNetworkIp() {
  const nets = os.networkInterfaces();
  const candidates = [];

  for (const name of Object.keys(nets)) {
    const lowerName = name.toLowerCase();
    // Skip virtual or internal adapters
    if (lowerName.includes('virtual') || lowerName.includes('vmware') || lowerName.includes('vbox') || lowerName.includes('loopback')) {
      continue;
    }
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254')) {
        candidates.push({ name, address: net.address });
      }
    }
  }

  // Prioritize Wi-Fi or Ethernet
  const wifiOrEth = candidates.find(c => {
    const n = c.name.toLowerCase();
    return n.includes('wi-fi') || n.includes('wlan') || n.includes('ethernet') || n.includes('mạng');
  });

  if (wifiOrEth) return wifiOrEth.address;
  if (candidates.length > 0) return candidates[0].address;
  return 'localhost';
}

app.get('/api/network/info', (req, res) => {
  const localIp = getLocalNetworkIp();
  res.json({
    localIp,
    port: PORT,
    mobileUrl: `http://${localIp}:${PORT}`
  });
});

// Lightweight health check endpoint for cron-job.org / uptime monitoring
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// -------------------------------------------------------------
// AUTH & USERS API
// -------------------------------------------------------------
app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password, pin } = req.body;

    let user = null;
    if (pin) {
      // Login via quick 4-digit PIN
      user = db.prepare('SELECT * FROM users WHERE pin = ? AND active = 1').get(String(pin).trim());
    } else if (username && password) {
      // Login via username & password
      user = db.prepare('SELECT * FROM users WHERE username = ? AND active = 1').get(username.trim().toLowerCase());
      if (user && user.password !== password) {
        user = null;
      }
    }

    if (!user) {
      return res.status(401).json({ error: 'Tên đăng nhập / Mật khẩu hoặc mã PIN không chính xác' });
    }

    const token = generateToken(user);
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        pin: user.pin
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/me', (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Chưa đăng nhập' });
  }
  res.json({ user: req.user });
});

// List all users (Admin only)
app.get('/api/users', requireAdmin, (req, res) => {
  try {
    const users = db.prepare('SELECT id, username, name, role, pin, active, created_at FROM users ORDER BY id ASC').all();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create new user (Admin only)
app.post('/api/users', requireAdmin, (req, res) => {
  try {
    const { username, password, name, role, pin } = req.body;
    if (!username || !password || !name) {
      return res.status(400).json({ error: 'Tên đăng nhập, mật khẩu và họ tên là bắt buộc' });
    }

    const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username.trim().toLowerCase());
    if (exists) {
      return res.status(400).json({ error: 'Tên đăng nhập này đã tồn tại' });
    }

    const stmt = db.prepare('INSERT INTO users (username, password, name, role, pin, active) VALUES (?, ?, ?, ?, ?, 1)');
    const result = stmt.run(
      username.trim().toLowerCase(),
      password,
      name.trim(),
      role === 'admin' ? 'admin' : 'staff',
      pin ? String(pin).trim() : '1234'
    );

    const created = db.prepare('SELECT id, username, name, role, pin, active FROM users WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update user (Admin only)
app.put('/api/users/:id', requireAdmin, (req, res) => {
  try {
    const { password, name, role, pin, active } = req.body;
    const userId = req.params.id;

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) return res.status(404).json({ error: 'Không tìm thấy người dùng' });

    const newPass = password ? password : user.password;
    const newName = name ? name.trim() : user.name;
    const newRole = role ? (role === 'admin' ? 'admin' : 'staff') : user.role;
    const newPin = pin !== undefined ? String(pin).trim() : user.pin;
    const newActive = active !== undefined ? (active ? 1 : 0) : user.active;

    db.prepare(`
      UPDATE users SET password = ?, name = ?, role = ?, pin = ?, active = ? WHERE id = ?
    `).run(newPass, newName, newRole, newPin, newActive, userId);

    const updated = db.prepare('SELECT id, username, name, role, pin, active FROM users WHERE id = ?').get(userId);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete user (Admin only)
app.delete('/api/users/:id', requireAdmin, (req, res) => {
  try {
    const userId = req.params.id;
    if (req.user.id == userId) {
      return res.status(400).json({ error: 'Bạn không thể tự xóa tài khoản của chính mình!' });
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    res.json({ success: true, message: 'Đã xóa tài khoản thành công' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// HELPER: Generate Order Code HD-YYYYMMDD-XXXX
// -------------------------------------------------------------
function generateOrderCode() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const datePrefix = `HD-${yyyy}${mm}${dd}-`;

  const lastOrder = db.prepare(
    "SELECT order_code FROM orders WHERE order_code LIKE ? ORDER BY id DESC LIMIT 1"
  ).get(`${datePrefix}%`);

  let seq = 1;
  if (lastOrder && lastOrder.order_code) {
    const parts = lastOrder.order_code.split('-');
    if (parts.length >= 3) {
      seq = parseInt(parts[2], 10) + 1;
    }
  }
  return `${datePrefix}${String(seq).padStart(4, '0')}`;
}

// -------------------------------------------------------------
// PRODUCTS API
// -------------------------------------------------------------
app.get('/api/products', (req, res) => {
  try {
    const { search, category_id, low_stock } = req.query;
    let query = `
      SELECT p.*, c.name as category_name, c.icon as category_icon
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      query += ` AND (p.name LIKE ? OR p.barcode LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }

    if (category_id && category_id !== 'all') {
      query += ` AND p.category_id = ?`;
      params.push(category_id);
    }

    if (low_stock === 'true') {
      query += ` AND p.stock <= 10`;
    }

    query += ` ORDER BY p.id DESC`;

    const products = db.prepare(query).all(...params);

    // If staff user: MASK cost_price so staff cannot see store's wholesale margin!
    const isStaff = req.user && req.user.role === 'staff';
    const sanitized = products.map(p => ({
      ...p,
      cost_price: isStaff ? 0 : p.cost_price
    }));

    res.json(sanitized);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/products/:id', (req, res) => {
  try {
    const product = db.prepare(`
      SELECT p.*, c.name as category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.id = ? OR p.barcode = ?
    `).get(req.params.id, req.params.id);

    if (!product) {
      return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
    }

    const isStaff = req.user && req.user.role === 'staff';
    if (isStaff) product.cost_price = 0;

    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin only: Create product (Tối giản: chỉ cần tên, giá, ảnh, danh mục)
app.post('/api/products', requireAdmin, (req, res) => {
  try {
    const { name, category_id, price, image } = req.body;
    if (!name || price === undefined) {
      return res.status(400).json({ error: 'Tên món và giá tiền là bắt buộc' });
    }

    const code = 'M' + Date.now().toString().slice(-6);

    const stmt = db.prepare(`
      INSERT INTO products (barcode, name, category_id, cost_price, price, stock, unit, image)
      VALUES (?, ?, ?, 0, ?, 9999, 'phần', ?)
    `);

    const result = stmt.run(
      code,
      name.trim(),
      category_id || null,
      Number(price) || 0,
      image || ''
    );

    const newProd = db.prepare('SELECT * FROM products WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(newProd);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin only: Update product
app.put('/api/products/:id', requireAdmin, (req, res) => {
  try {
    const { name, category_id, price, image } = req.body;
    const prodId = req.params.id;

    const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(prodId);
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy món ăn' });

    const newName = name !== undefined ? name.trim() : existing.name;
    const newCat = category_id !== undefined ? (category_id || null) : existing.category_id;
    const newPrice = price !== undefined ? Number(price) : existing.price;
    const newImage = image !== undefined ? image : existing.image;

    const stmt = db.prepare(`
      UPDATE products SET
        name = ?,
        category_id = ?,
        price = ?,
        image = ?
      WHERE id = ?
    `);

    stmt.run(newName, newCat, newPrice, newImage, prodId);

    const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(prodId);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin only: Delete product
app.delete('/api/products/:id', requireAdmin, (req, res) => {
  try {
    db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'Đã xóa sản phẩm thành công' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin only: Adjust stock
app.post('/api/products/:id/adjust-stock', requireAdmin, (req, res) => {
  try {
    const { change } = req.body;
    const num = Number(change);
    if (isNaN(num)) {
      return res.status(400).json({ error: 'Số lượng thay đổi không hợp lệ' });
    }
    db.prepare('UPDATE products SET stock = MAX(0, stock + ?) WHERE id = ?').run(num, req.params.id);
    const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// CATEGORIES API
// -------------------------------------------------------------
app.get('/api/categories', (req, res) => {
  try {
    const categories = db.prepare(`
      SELECT c.*, COUNT(p.id) as product_count
      FROM categories c
      LEFT JOIN products p ON c.id = p.category_id
      GROUP BY c.id
      ORDER BY c.id ASC
    `).all();
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/categories', requireAdmin, (req, res) => {
  try {
    const { name, icon } = req.body;
    if (!name) return res.status(400).json({ error: 'Tên danh mục là bắt buộc' });
    const stmt = db.prepare('INSERT INTO categories (name, icon) VALUES (?, ?)');
    const result = stmt.run(name.trim(), icon || '📁');
    const created = db.prepare('SELECT * FROM categories WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/categories/:id', requireAdmin, (req, res) => {
  try {
    db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// ORDERS & CHECKOUT API
// -------------------------------------------------------------
app.get('/api/orders', (req, res) => {
  try {
    const { start_date, end_date, search, limit = 50 } = req.query;
    let query = `
      SELECT o.*, COUNT(oi.id) as item_count
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE 1=1
    `;
    const params = [];

    if (start_date) {
      query += ` AND DATE(o.created_at) >= DATE(?)`;
      params.push(start_date);
    }
    if (end_date) {
      query += ` AND DATE(o.created_at) <= DATE(?)`;
      params.push(end_date);
    }
    if (search) {
      query += ` AND (o.order_code LIKE ? OR o.customer_name LIKE ? OR o.customer_phone LIKE ? OR o.cashier_name LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ` GROUP BY o.id ORDER BY o.id DESC LIMIT ?`;
    params.push(Number(limit));

    const orders = db.prepare(query).all(...params);
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/orders/:id', (req, res) => {
  try {
    const order = db.prepare('SELECT * FROM orders WHERE id = ? OR order_code = ?').get(req.params.id, req.params.id);
    if (!order) return res.status(404).json({ error: 'Không tìm thấy hóa đơn' });

    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
    res.json({ ...order, items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create Order (Both Admin & Staff can checkout)
app.post('/api/orders', (req, res) => {
  try {
    const { items, discount = 0, discount_type = 'amount', cash_given = 0, payment_method = 'vietqr', customer_name, customer_phone, note, table_name } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Giỏ hàng trống!' });
    }

    const cashierId = req.user ? req.user.id : null;
    const cashierName = req.user ? req.user.name : 'Nhân viên';

    db.exec('BEGIN TRANSACTION;');

    try {
      let subtotal = 0;
      const verifiedItems = [];

      for (const item of items) {
        const prod = db.prepare('SELECT * FROM products WHERE id = ?').get(item.id);
        if (!prod) {
          throw new Error(`Sản phẩm id ${item.id} không tồn tại`);
        }
        const qty = Math.max(1, parseInt(item.quantity, 10) || 1);
        const itemTotal = prod.price * qty;
        subtotal += itemTotal;

        verifiedItems.push({
          product_id: prod.id,
          product_name: prod.name,
          barcode: prod.barcode || '',
          unit: prod.unit || 'phần',
          cost_price: 0,
          price: prod.price,
          quantity: qty,
          total: itemTotal,
          current_stock: prod.stock
        });
      }

      let discountAmount = 0;
      if (discount_type === 'percent') {
        discountAmount = Math.round((subtotal * Math.min(100, Math.max(0, Number(discount) || 0))) / 100);
      } else {
        discountAmount = Math.min(subtotal, Math.max(0, Number(discount) || 0));
      }
      const total = Math.max(0, subtotal - discountAmount);

      const cash = Number(cash_given) || total;
      const changeReturned = Math.max(0, cash - total);

      const orderCode = generateOrderCode();

      const insertOrder = db.prepare(`
        INSERT INTO orders (order_code, subtotal, discount, discount_type, total, cash_given, change_returned, payment_method, customer_name, customer_phone, note, status, cashier_id, cashier_name, table_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?)
      `);

      const orderResult = insertOrder.run(
        orderCode,
        subtotal,
        discountAmount,
        discount_type,
        total,
        cash,
        changeReturned,
        payment_method,
        customer_name || 'Khách',
        customer_phone || '',
        note || '',
        cashierId,
        cashierName,
        table_name || 'Mang về'
      );

      const orderId = orderResult.lastInsertRowid;

      const insertItem = db.prepare(`
        INSERT INTO order_items (order_id, product_id, product_name, barcode, unit, cost_price, price, quantity, total)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const updateStock = db.prepare(`
        UPDATE products SET stock = MAX(0, stock - ?) WHERE id = ?
      `);

      for (const item of verifiedItems) {
        insertItem.run(
          orderId,
          item.product_id,
          item.product_name,
          item.barcode,
          item.unit,
          item.cost_price,
          item.price,
          item.quantity,
          item.total
        );
        updateStock.run(item.quantity, item.product_id);
      }

      db.exec('COMMIT;');

      const createdOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
      const createdItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);

      res.status(201).json({ ...createdOrder, items: createdItems });
    } catch (innerErr) {
      db.exec('ROLLBACK;');
      throw innerErr;
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin only: Cancel order and restore stock
app.post('/api/orders/:id/cancel', requireAdmin, (req, res) => {
  try {
    db.exec('BEGIN TRANSACTION;');
    try {
      const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
      if (!order) throw new Error('Không tìm thấy đơn hàng');
      if (order.status === 'cancelled') throw new Error('Đơn hàng này đã bị hủy trước đó');

      const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
      const restoreStock = db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?');

      for (const item of items) {
        if (item.product_id) {
          restoreStock.run(item.quantity, item.product_id);
        }
      }

      db.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ?").run(order.id);
      db.exec('COMMIT;');

      res.json({ success: true, message: 'Đã hủy đơn hàng và hoàn lại số lượng tồn kho' });
    } catch (e) {
      db.exec('ROLLBACK;');
      throw e;
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// DASHBOARD & REPORTS API (Admin only: Protect store revenue & profit)
// -------------------------------------------------------------
app.get('/api/reports/dashboard', requireAdmin, (req, res) => {
  try {
    const todayStats = db.prepare(`
      SELECT
        COUNT(id) as total_orders,
        COALESCE(SUM(total), 0) as total_revenue
      FROM orders
      WHERE status = 'completed' AND DATE(created_at, 'localtime') = DATE('now', 'localtime')
    `).get();

    const todayItemsStats = db.prepare(`
      SELECT
        COALESCE(SUM(oi.quantity), 0) as items_sold,
        COALESCE(SUM(oi.quantity * (oi.price - oi.cost_price)), 0) as profit
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE o.status = 'completed' AND DATE(o.created_at, 'localtime') = DATE('now', 'localtime')
    `).get();

    const overallStats = db.prepare(`
      SELECT
        COUNT(id) as total_orders,
        COALESCE(SUM(total), 0) as total_revenue
      FROM orders
      WHERE status = 'completed'
    `).get();

    const productStats = db.prepare(`
      SELECT
        COUNT(id) as total_products,
        SUM(CASE WHEN stock <= 10 THEN 1 ELSE 0 END) as low_stock_count
      FROM products
    `).get();

    const last7Days = db.prepare(`
      WITH RECURSIVE dates(date) AS (
        SELECT DATE('now', '-6 days', 'localtime')
        UNION ALL
        SELECT DATE(date, '+1 day') FROM dates WHERE date < DATE('now', 'localtime')
      )
      SELECT
        dates.date,
        COALESCE(SUM(o.total), 0) as revenue,
        COUNT(o.id) as order_count
      FROM dates
      LEFT JOIN orders o ON DATE(o.created_at, 'localtime') = dates.date AND o.status = 'completed'
      GROUP BY dates.date
      ORDER BY dates.date ASC
    `).all();

    const topProducts = db.prepare(`
      SELECT
        oi.product_name,
        SUM(oi.quantity) as total_qty,
        SUM(oi.total) as total_amount
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE o.status = 'completed'
      GROUP BY oi.product_name
      ORDER BY total_qty DESC
      LIMIT 5
    `).all();

    const paymentMethods = db.prepare(`
      SELECT
        payment_method,
        COUNT(id) as count,
        COALESCE(SUM(total), 0) as total_amount
      FROM orders
      WHERE status = 'completed'
      GROUP BY payment_method
    `).all();

    res.json({
      today: {
        orders: todayStats.total_orders,
        revenue: todayStats.total_revenue,
        items_sold: todayItemsStats.items_sold,
        profit: Math.max(0, todayItemsStats.profit)
      },
      overall: {
        total_orders: overallStats.total_orders,
        total_revenue: overallStats.total_revenue,
        total_products: productStats.total_products,
        low_stock_count: productStats.low_stock_count
      },
      chart_7days: last7Days,
      top_products: topProducts,
      payment_methods: paymentMethods
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// SETTINGS API
// -------------------------------------------------------------
app.get('/api/settings', (req, res) => {
  try {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const settings = {};
    for (const r of rows) {
      settings[r.key] = r.value;
    }
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin only: Update settings
app.put('/api/settings', requireAdmin, (req, res) => {
  try {
    const data = req.body;
    const upsert = db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    for (const [k, v] of Object.entries(data)) {
      upsert.run(k, String(v));
    }
    res.json({ success: true, message: 'Cập nhật cài đặt thành công!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Popular Vietnamese Banks for VietQR
app.get('/api/vietqr/banks', (req, res) => {
  const banks = [
    { code: 'MB', name: 'MBBank - Ngân hàng Quân Đội' },
    { code: 'VCB', name: 'Vietcombank - Ngân hàng Ngoại Thương' },
    { code: 'TCB', name: 'Techcombank - Ngân hàng Kỹ Thương' },
    { code: 'ACB', name: 'ACB - Ngân hàng Á Châu' },
    { code: 'VPB', name: 'VPBank - Ngân hàng Thịnh Vượng' },
    { code: 'ICB', name: 'VietinBank - Ngân hàng Công Thương' },
    { code: 'BIDV', name: 'BIDV - Ngân hàng Đầu tư và Phát triển' },
    { code: 'TPB', name: 'TPBank - Ngân hàng Tiên Phong' },
    { code: 'STB', name: 'Sacombank - Ngân hàng Sài Gòn Thương Tín' },
    { code: 'OCB', name: 'OCB - Ngân hàng Phương Đông' },
    { code: 'HDB', name: 'HDBank - Ngân hàng Phát triển TP.HCM' },
    { code: 'VIB', name: 'VIB - Ngân hàng Quốc Tế' },
    { code: 'MSB', name: 'MSB - Ngân hàng Hàng Hải' },
    { code: 'SHB', name: 'SHB - Ngân hàng Sài Gòn - Hà Nội' },
    { code: 'LPB', name: 'LPBank - Ngân hàng Bưu Điện Liên Việt' }
  ];
  res.json(banks);
});

// Backup Database file (Admin only)
app.get('/api/backup/download', requireAdmin, (req, res) => {
  const dbFile = path.join(__dirname, 'pos.db');
  res.download(dbFile, `pos_backup_${new Date().toISOString().slice(0, 10)}.db`);
});

// JSON Full Data Export (Admin only)
app.get('/api/backup/export-json', requireAdmin, (req, res) => {
  const data = {
    exported_at: new Date().toISOString(),
    categories: db.prepare('SELECT * FROM categories').all(),
    products: db.prepare('SELECT * FROM products').all(),
    orders: db.prepare('SELECT * FROM orders').all(),
    order_items: db.prepare('SELECT * FROM order_items').all(),
    settings: db.prepare('SELECT * FROM settings').all(),
    users: db.prepare('SELECT id, username, name, role, pin, active, created_at FROM users').all()
  };
  res.setHeader('Content-Disposition', `attachment; filename=pos_data_${new Date().toISOString().slice(0, 10)}.json`);
  res.json(data);
});

// Catch-all route to serve index.html
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server on 0.0.0.0 so phone on LAN can access
app.listen(PORT, '0.0.0.0', () => {
  const localIp = getLocalNetworkIp();
  console.log(`=================================================`);
  console.log(`🚀 POS SERVER ĐÃ KHỞI ĐỘNG THÀNH CÔNG!`);
  console.log(`💻 Máy tính: http://localhost:${PORT}`);
  console.log(`📱 Điện thoại nhân viên: http://${localIp}:${PORT}`);
  console.log(`=================================================`);
});
