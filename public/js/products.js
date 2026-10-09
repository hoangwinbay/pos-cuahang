// Product Management & Inventory Logic

let productListCache = [];

// Load products for the management table
async function loadProductsTable() {
  try {
    const [products, categories] = await Promise.all([
      api('/api/products'),
      api('/api/categories')
    ]);

    productListCache = products;
    state.categories = categories;

    // Populate Category filter dropdown
    const catSelect = document.getElementById('productTableCategoryFilter');
    if (catSelect) {
      catSelect.innerHTML = `<option value="all">Tất cả danh mục</option>` +
        categories.map(c => `<option value="${c.id}">${c.icon || '📁'} ${c.name}</option>`).join('');
    }

    // Populate Category dropdown in Add/Edit modal
    const modalCatSelect = document.getElementById('prodCategory');
    if (modalCatSelect) {
      modalCatSelect.innerHTML = categories.map(c => `
        <option value="${c.id}">${c.icon || '📁'} ${c.name}</option>
      `).join('');
    }

    filterProductTable();
  } catch (err) {
    showToast('Lỗi khi tải danh sách sản phẩm', 'error');
  }
}

// Filter product table
function filterProductTable() {
  const searchTerm = (document.getElementById('productTableSearch').value || '').trim().toLowerCase();
  const selectedCat = document.getElementById('productTableCategoryFilter').value;
  const lowStockOnly = document.getElementById('productTableLowStockOnly').checked;

  const filtered = productListCache.filter(p => {
    const matchesSearch = !searchTerm || 
      p.name.toLowerCase().includes(searchTerm) || 
      p.barcode.toLowerCase().includes(searchTerm);
    const matchesCat = selectedCat === 'all' || p.category_id == selectedCat;
    const matchesLowStock = !lowStockOnly || p.stock <= 10;
    return matchesSearch && matchesCat && matchesLowStock;
  });

  renderProductTable(filtered);
}

// Render product table rows
function renderProductTable(products) {
  const tbody = document.getElementById('productsTableBody');
  document.getElementById('productTableTotalCount').textContent = products.length;

  if (products.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center py-8 text-slate-400">
          <i class="fa-solid fa-box-open text-3xl mb-2 text-slate-300"></i>
          <p>Không có sản phẩm nào phù hợp</p>
        </td>
      </tr>
    `;
    return;
  }

  const isAdmin = state.currentUser && state.currentUser.role === 'admin';

  tbody.innerHTML = products.map(p => {
    const isLow = p.stock <= 10;
    const isOut = p.stock <= 0;

    let stockBadgeClass = 'text-emerald-700 bg-emerald-50 border-emerald-200';
    if (isOut) {
      stockBadgeClass = 'text-rose-700 bg-rose-50 border-rose-200';
    } else if (isLow) {
      stockBadgeClass = 'text-amber-700 bg-amber-50 border-amber-200';
    }

    return `
      <tr class="hover:bg-slate-50 transition-colors">
        <td class="px-3 sm:px-4 py-2.5 sm:py-3 font-mono text-xs font-semibold text-slate-700">${p.barcode}</td>
        <td class="px-3 sm:px-4 py-2.5 sm:py-3">
          <div class="flex items-center space-x-2">
            <span class="text-xl shrink-0">${p.image || '📦'}</span>
            <div>
              <span class="font-bold text-slate-800">${p.name}</span>
            </div>
          </div>
        </td>
        <td class="px-3 sm:px-4 py-2.5 sm:py-3">
          <span class="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
            ${p.category_name || 'Chung'}
          </span>
        </td>
        <td class="px-3 sm:px-4 py-2.5 sm:py-3 text-right font-medium text-slate-500 col-cost-price" style="${isAdmin ? '' : 'display:none;'}">${formatMoney(p.cost_price)}</td>
        <td class="px-3 sm:px-4 py-2.5 sm:py-3 text-right font-bold text-blue-600">${formatMoney(p.price)}</td>
        <td class="px-3 sm:px-4 py-2.5 sm:py-3 text-center">
          ${isAdmin ? `
          <div class="inline-flex items-center space-x-1">
            <button onclick="quickAdjustStock(${p.id}, -1)" title="Giảm 1" class="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center text-xs">
              <i class="fa-solid fa-minus"></i>
            </button>
            <span class="px-2.5 py-0.5 rounded-full text-xs font-bold border ${stockBadgeClass} min-w-[45px] text-center">
              ${p.stock}
            </span>
            <button onclick="quickAdjustStock(${p.id}, 1)" title="Tăng 1" class="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center text-xs">
              <i class="fa-solid fa-plus"></i>
            </button>
            <button onclick="promptCustomStock(${p.id}, '${p.name.replace(/'/g, "\\'")}', ${p.stock})" title="Nhập số lượng lớn" class="w-6 h-6 rounded bg-blue-50 hover:bg-blue-100 text-blue-600 flex items-center justify-center text-xs">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
          </div>
          ` : `
          <span class="px-2.5 py-0.5 rounded-full text-xs font-bold border ${stockBadgeClass} min-w-[45px] text-center inline-block">
            ${p.stock}
          </span>
          `}
        </td>
        <td class="px-3 sm:px-4 py-2.5 sm:py-3 text-center text-xs text-slate-500">${p.unit || 'cái'}</td>
        <td class="px-3 sm:px-4 py-2.5 sm:py-3 text-center col-product-actions" style="${isAdmin ? '' : 'display:none;'}">
          <div class="flex items-center justify-center space-x-1.5">
            <button onclick="editProduct(${p.id})" class="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Chỉnh sửa">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button onclick="deleteProduct(${p.id}, '${p.name.replace(/'/g, "\\'")}')" class="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors" title="Xóa">
              <i class="fa-regular fa-trash-can"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Quick adjust stock
async function quickAdjustStock(id, change) {
  try {
    const updated = await api(`/api/products/${id}/adjust-stock`, {
      method: 'POST',
      body: JSON.stringify({ change })
    });
    
    // Update local caches
    const p1 = productListCache.find(p => p.id === id);
    if (p1) p1.stock = updated.stock;
    const p2 = state.products.find(p => p.id === id);
    if (p2) p2.stock = updated.stock;

    filterProductTable();
    showToast(`Đã cập nhật tồn kho: ${updated.name} (còn ${updated.stock})`);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Prompt custom stock change
async function promptCustomStock(id, name, currentStock) {
  const input = prompt(`Nhập số lượng tồn kho mới cho "${name}" (Hiện tại: ${currentStock}):`, currentStock);
  if (input === null) return;
  const newStock = parseInt(input, 10);
  if (isNaN(newStock) || newStock < 0) {
    showToast('Số lượng tồn kho không hợp lệ', 'error');
    return;
  }
  const diff = newStock - currentStock;
  if (diff === 0) return;
  await quickAdjustStock(id, diff);
}

// Open modal for new product
function showQuickAddProductModal() {
  document.getElementById('productForm').reset();
  document.getElementById('prodEditId').value = '';
  document.getElementById('productModalTitle').textContent = 'Thêm Sản Phẩm Mới';
  document.getElementById('prodBarcode').value = '893' + Math.floor(1000000000 + Math.random() * 9000000000);
  document.getElementById('productModal').classList.remove('hidden');
}

function closeProductModal() {
  document.getElementById('productModal').classList.add('hidden');
}

// Open modal for editing product
function editProduct(id) {
  const p = productListCache.find(item => item.id === id);
  if (!p) return;

  document.getElementById('prodEditId').value = p.id;
  document.getElementById('productModalTitle').textContent = 'Chỉnh Sửa Sản Phẩm';
  document.getElementById('prodName').value = p.name;
  document.getElementById('prodBarcode').value = p.barcode;
  document.getElementById('prodCategory').value = p.category_id || '';
  document.getElementById('prodPrice').value = p.price;
  document.getElementById('prodCostPrice').value = p.cost_price || 0;
  document.getElementById('prodStock').value = p.stock;
  document.getElementById('prodUnit').value = p.unit || 'cái';
  document.getElementById('prodImage').value = p.image || '📦';

  document.getElementById('productModal').classList.remove('hidden');
}

// Save product (Create or Update)
async function saveProduct(e) {
  e.preventDefault();
  const id = document.getElementById('prodEditId').value;

  const payload = {
    name: document.getElementById('prodName').value.trim(),
    barcode: document.getElementById('prodBarcode').value.trim(),
    category_id: document.getElementById('prodCategory').value || null,
    price: Number(document.getElementById('prodPrice').value),
    cost_price: Number(document.getElementById('prodCostPrice').value) || 0,
    stock: Number(document.getElementById('prodStock').value) || 0,
    unit: document.getElementById('prodUnit').value.trim() || 'cái',
    image: document.getElementById('prodImage').value.trim() || '📦'
  };

  try {
    if (id) {
      await api(`/api/products/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      showToast('Cập nhật sản phẩm thành công!');
    } else {
      await api('/api/products', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      showToast('Thêm sản phẩm mới thành công!');
    }

    closeProductModal();
    await loadProductsTable();
    await loadPosProducts();
    await loadPosCategories();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Delete product
async function deleteProduct(id, name) {
  if (confirm(`Bạn có chắc muốn xóa sản phẩm "${name}" khỏi hệ thống?`)) {
    try {
      await api(`/api/products/${id}`, { method: 'DELETE' });
      showToast(`Đã xóa sản phẩm "${name}"`);
      await loadProductsTable();
      await loadPosProducts();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }
}

// Generate random barcode
function generateRandomBarcode() {
  document.getElementById('prodBarcode').value = '893' + Math.floor(1000000000 + Math.random() * 9000000000);
}

// Export CSV
function exportProductsCSV() {
  if (productListCache.length === 0) {
    showToast('Không có sản phẩm để xuất file', 'error');
    return;
  }

  const headers = ['Mã vạch', 'Tên sản phẩm', 'Danh mục', 'Giá vốn', 'Giá bán', 'Tồn kho', 'Đơn vị tính'];
  const rows = productListCache.map(p => [
    `"${p.barcode}"`,
    `"${p.name.replace(/"/g, '""')}"`,
    `"${p.category_name || ''}"`,
    p.cost_price || 0,
    p.price,
    p.stock,
    `"${p.unit || 'cái'}"`
  ]);

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Danh_Sach_San_Pham_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
