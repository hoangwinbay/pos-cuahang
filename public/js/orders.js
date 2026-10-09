// Order History & Management Logic

let ordersCache = [];
let debounceTimer = null;

function debounceLoadOrders() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    loadOrdersList();
  }, 300);
}

// Load Orders list from server
async function loadOrdersList() {
  const search = (document.getElementById('orderSearchInput').value || '').trim();
  const startDate = document.getElementById('orderStartDate').value;
  const endDate = document.getElementById('orderEndDate').value;

  const params = new URLSearchParams();
  if (search) params.append('search', search);
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);

  try {
    const orders = await api(`/api/orders?${params.toString()}`);
    ordersCache = orders;
    renderOrdersTable(orders);
  } catch (err) {
    showToast('Lỗi khi tải lịch sử đơn hàng', 'error');
  }
}

// Render Orders Table
function renderOrdersTable(orders) {
  const tbody = document.getElementById('ordersTableBody');
  const empty = document.getElementById('ordersEmpty');

  if (!orders || orders.length === 0) {
    tbody.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');

  tbody.innerHTML = orders.map(o => {
    const isCancelled = o.status === 'cancelled';
    const statusBadge = isCancelled
      ? `<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-600 border border-rose-200">Đã hủy</span>`
      : `<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-600 border border-emerald-200">Hoàn tất</span>`;

    const methodBadge = o.payment_method === 'vietqr'
      ? `<span class="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200"><i class="fa-solid fa-qrcode mr-1"></i>VietQR</span>`
      : `<span class="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200"><i class="fa-solid fa-money-bill-wave mr-1"></i>Tiền mặt</span>`;

    return `
      <tr class="hover:bg-slate-50 transition-colors ${isCancelled ? 'opacity-60 bg-slate-50/50' : ''}">
        <td class="px-3 sm:px-4 py-2.5 sm:py-3 font-mono font-bold text-xs text-blue-600">${o.order_code}</td>
        <td class="px-3 sm:px-4 py-2.5 sm:py-3 text-xs text-slate-500">${formatDateTime(o.created_at)}</td>
        <td class="px-3 sm:px-4 py-2.5 sm:py-3 text-xs font-semibold text-slate-700">${o.cashier_name || 'Thu ngân'}</td>
        <td class="px-3 sm:px-4 py-2.5 sm:py-3">
          <div class="font-semibold text-slate-800 text-xs">${o.customer_name || 'Khách lẻ'}</div>
          ${o.customer_phone ? `<div class="text-[11px] text-slate-400 font-mono">${o.customer_phone}</div>` : ''}
        </td>
        <td class="px-3 sm:px-4 py-2.5 sm:py-3 text-center text-xs font-semibold text-slate-700">${o.item_count || 1} món</td>
        <td class="px-3 sm:px-4 py-2.5 sm:py-3 text-center">${methodBadge}</td>
        <td class="px-3 sm:px-4 py-2.5 sm:py-3 text-right font-black text-slate-800">${formatMoney(o.total)}</td>
        <td class="px-3 sm:px-4 py-2.5 sm:py-3 text-center">${statusBadge}</td>
        <td class="px-3 sm:px-4 py-2.5 sm:py-3 text-center">
          <button onclick="viewOrderDetail(${o.id})" class="px-2.5 py-1 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-600 rounded-lg text-xs font-semibold transition-colors flex items-center space-x-1 mx-auto">
            <i class="fa-solid fa-eye"></i>
            <span>Chi tiết</span>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// View Order Detail in Modal
async function viewOrderDetail(id) {
  try {
    const order = await api(`/api/orders/${id}`);
    state.currentOrderInView = order;

    document.getElementById('orderDetailCode').textContent = order.order_code;
    
    const cancelBtn = document.getElementById('btnCancelOrder');
    const isAdmin = state.currentUser && state.currentUser.role === 'admin';
    cancelBtn.style.display = isAdmin ? '' : 'none';

    if (order.status === 'cancelled') {
      cancelBtn.disabled = true;
      cancelBtn.classList.add('opacity-50', 'cursor-not-allowed');
      cancelBtn.innerHTML = '<i class="fa-solid fa-ban"></i> <span>Đơn đã bị hủy</span>';
    } else {
      cancelBtn.disabled = false;
      cancelBtn.classList.remove('opacity-50', 'cursor-not-allowed');
      cancelBtn.innerHTML = '<i class="fa-solid fa-ban"></i> <span>Hủy đơn hoàn kho</span>';
    }

    const itemsHtml = (order.items || []).map(item => `
      <div class="flex items-center justify-between py-2 border-b border-slate-100 text-xs">
        <div>
          <div class="font-bold text-slate-800">${item.product_name}</div>
          <div class="text-slate-400 text-[11px]">${item.quantity} ${item.unit || 'cái'} x ${formatMoney(item.price)}</div>
        </div>
        <div class="font-bold text-slate-800 text-sm">${formatMoney(item.total)}</div>
      </div>
    `).join('');

    const content = document.getElementById('orderDetailContent');
    content.innerHTML = `
      <!-- Info Header -->
      <div class="p-3 bg-slate-50 rounded-xl space-y-1.5 text-xs text-slate-600">
        <div class="flex justify-between">
          <span>Thời gian:</span>
          <span class="font-semibold text-slate-800">${formatDateTime(order.created_at)}</span>
        </div>
        <div class="flex justify-between">
          <span>Thu ngân xử lý:</span>
          <span class="font-bold text-indigo-700">${order.cashier_name || 'Thu ngân'}</span>
        </div>
        <div class="flex justify-between">
          <span>Khách hàng:</span>
          <span class="font-semibold text-slate-800">${order.customer_name || 'Khách lẻ'} ${order.customer_phone ? `(${order.customer_phone})` : ''}</span>
        </div>
        <div class="flex justify-between">
          <span>Phương thức:</span>
          <span class="font-semibold text-slate-800">${order.payment_method === 'vietqr' ? 'Chuyển khoản VietQR' : 'Tiền mặt'}</span>
        </div>
        <div class="flex justify-between">
          <span>Trạng thái:</span>
          <span class="font-semibold ${order.status === 'cancelled' ? 'text-rose-600' : 'text-emerald-600'}">
            ${order.status === 'cancelled' ? 'ĐÃ HỦY ĐƠN HÀNG' : 'HOÀN TẤT'}
          </span>
        </div>
      </div>

      <!-- Item list -->
      <div>
        <div class="text-xs font-bold text-slate-500 uppercase mb-1">Danh sách sản phẩm</div>
        <div class="space-y-0.5 max-h-48 overflow-y-auto">
          ${itemsHtml}
        </div>
      </div>

      <!-- Totals -->
      <div class="p-3 bg-slate-50 rounded-xl space-y-1.5 text-xs text-slate-600">
        <div class="flex justify-between">
          <span>Tạm tính:</span>
          <span class="font-semibold text-slate-800">${formatMoney(order.subtotal)}</span>
        </div>
        ${order.discount > 0 ? `
        <div class="flex justify-between text-rose-600">
          <span>Giảm giá:</span>
          <span class="font-semibold">-${formatMoney(order.discount)}</span>
        </div>
        ` : ''}
        <div class="flex justify-between text-base font-black text-blue-600 pt-1 border-t border-slate-200">
          <span>TỔNG TIỀN:</span>
          <span>${formatMoney(order.total)}</span>
        </div>
      </div>
    `;

    document.getElementById('orderDetailModal').classList.remove('hidden');
  } catch (err) {
    showToast('Lỗi khi tải chi tiết đơn hàng', 'error');
  }
}

function closeOrderDetailModal() {
  document.getElementById('orderDetailModal').classList.add('hidden');
  state.currentOrderInView = null;
}

// Print receipt for current order in modal
function printCurrentOrderReceipt() {
  if (state.currentOrderInView) {
    printReceipt(state.currentOrderInView);
  }
}

// Cancel current order
async function cancelCurrentOrder() {
  if (!state.currentOrderInView) return;
  const order = state.currentOrderInView;

  if (confirm(`Bạn có chắc muốn HỦY hóa đơn ${order.order_code}? Toàn bộ số lượng sản phẩm trong đơn sẽ được hoàn trả lại vào kho hàng!`)) {
    try {
      await api(`/api/orders/${order.id}/cancel`, { method: 'POST' });
      showToast(`Đã hủy thành công đơn hàng ${order.order_code}`);
      closeOrderDetailModal();
      await loadOrdersList();
      await loadPosProducts();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }
}
