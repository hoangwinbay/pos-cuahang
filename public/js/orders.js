// =============================================================
// POS ORDER - DANH SÁCH ĐƠN HÀNG ĐỂ ĐỐI CHIẾU
// =============================================================

async function loadOrdersList() {
  const tbody = document.getElementById('ordersTableBody');
  const empty = document.getElementById('ordersEmpty');
  if (!tbody) return;

  try {
    const orders = await api('/api/orders?limit=30');

    if (!orders || orders.length === 0) {
      tbody.innerHTML = '';
      if (empty) empty.classList.remove('hidden');
      return;
    }

    if (empty) empty.classList.add('hidden');

    const esc = typeof escapeHtml === 'function' ? escapeHtml : (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');

    tbody.innerHTML = orders.map(o => {
      const isVietQr = o.payment_method === 'vietqr';
      const timeStr = formatDateTime(o.created_at);
      const tableName = o.table_name || 'Mang về';

      return `
        <tr class="hover:bg-slate-50 transition-colors">
          <td class="px-3 py-2.5 font-mono font-bold text-xs text-emerald-700">
            ${esc(o.order_code)}
          </td>
          <td class="px-3 py-2.5 text-xs text-slate-500 whitespace-nowrap">
            ${timeStr}
          </td>
          <td class="px-3 py-2.5 font-bold text-xs text-slate-800">
            <div>📍 ${esc(tableName)}</div>
            ${o.note ? `<div class="text-[11px] text-amber-700 font-medium italic mt-0.5"><i class="fa-solid fa-pen-to-square text-[10px] mr-1"></i>${esc(o.note)}</div>` : ''}
          </td>
          <td class="px-3 py-2.5 text-right font-black text-xs text-slate-900 whitespace-nowrap">
            ${formatMoney(o.total)}
          </td>
          <td class="px-3 py-2.5 text-center">
            <button 
              onclick="reprintOrderReceipt(${Number(o.id)})" 
              class="px-2.5 py-1 bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 rounded-lg text-xs font-semibold transition-colors inline-flex items-center space-x-1"
              title="In lại phiếu đối chiếu"
            >
              <i class="fa-solid fa-print text-[11px]"></i>
              <span class="hidden sm:inline">In phiếu</span>
            </button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Lỗi tải danh sách hóa đơn:', err);
  }
}

// In lại phiếu đối chiếu cho đơn hàng cũ
async function reprintOrderReceipt(orderId) {
  try {
    showToast('Đang tải thông tin đơn hàng...');
    const order = await api(`/api/orders/${orderId}`);
    if (typeof printReceipt === 'function') {
      printReceipt(order);
    }
  } catch (err) {
    showToast('Không thể in phiếu: ' + err.message, 'error');
  }
}
