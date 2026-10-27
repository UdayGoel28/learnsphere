/**
 * LearnSphere — Administrative Dashboard Client Application
 * Modular, vanilla JavaScript for interactive CRUD, dialogs, and real-time feedback.
 */

// Toast notification helper
function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let icon = 'ℹ️';
  if (type === 'success') icon = '✅';
  if (type === 'error') icon = '⚠️';
  if (type === 'warning') icon = '🔔';

  toast.innerHTML = `
    <span>${icon}</span>
    <div style="flex: 1; word-break: break-word;">${message}</div>
    <button style="background:none; border:none; color:#64748b; cursor:pointer;" onclick="this.parentElement.remove()">✕</button>
  `;

  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 4500);
}

// Global API Fetch wrapper
async function apiFetch(url, options = {}) {
  try {
    const res = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      ...options,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errorMsg = data.errors ? data.errors.join('<br>') : (data.error || `Request failed (${res.status})`);
      throw new Error(errorMsg);
    }
    return data;
  } catch (err) {
    showToast(err.message, 'error');
    throw err;
  }
}

// Setup dialog backdrops & light dismiss (following modern-web-guidance)
function initDialogs() {
  document.querySelectorAll('dialog').forEach(dialog => {
    // If browser lacks native closedby, handle outside click cleanly
    dialog.addEventListener('click', (e) => {
      const rect = dialog.getBoundingClientRect();
      const isInDialog = (
        rect.top <= e.clientY &&
        e.clientY <= rect.top + rect.height &&
        rect.left <= e.clientX &&
        e.clientX <= rect.left + rect.width
      );
      if (!isInDialog) {
        dialog.close();
      }
    });
  });
}

// Mobile sidebar toggle
function initSidebar() {
  const toggleBtn = document.getElementById('mobile-sidebar-toggle');
  const sidebar = document.querySelector('.sidebar');
  if (toggleBtn && sidebar) {
    toggleBtn.addEventListener('click', () => {
      sidebar.classList.toggle('open');
    });
  }
}

// Database live health indicator
async function checkDbStatus() {
  const dot = document.getElementById('db-status-dot');
  const label = document.getElementById('db-status-label');
  if (!dot || !label) return;

  try {
    const res = await fetch('/api/health/db');
    const data = await res.json();
    if (res.ok && data.database && data.database.connected) {
      dot.className = 'status-dot';
      label.textContent = `MySQL Connected (${data.database.database})`;
    } else {
      dot.className = 'status-dot offline';
      label.textContent = 'MySQL Disconnected';
    }
  } catch (e) {
    dot.className = 'status-dot offline';
    label.textContent = 'MySQL Unreachable';
  }
}

// Generic confirmation dialog
function confirmAction({ title, message, confirmText = 'Delete', onConfirm }) {
  let modal = document.getElementById('confirm-action-modal');
  if (!modal) {
    modal = document.createElement('dialog');
    modal.id = 'confirm-action-modal';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3 class="modal-title" id="confirm-modal-title">Confirm Action</h3>
          <button class="modal-close-btn" onclick="document.getElementById('confirm-action-modal').close()">✕</button>
        </div>
        <div class="modal-body">
          <p id="confirm-modal-message" style="color: var(--text-main); font-size: 0.95rem;"></p>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" onclick="document.getElementById('confirm-action-modal').close()">Cancel</button>
          <button type="button" class="btn btn-danger" id="confirm-modal-action-btn">Confirm</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  document.getElementById('confirm-modal-title').textContent = title;
  document.getElementById('confirm-modal-message').innerHTML = message;
  const actionBtn = document.getElementById('confirm-modal-action-btn');
  actionBtn.textContent = confirmText;

  // Replace onclick handler cleanly
  actionBtn.onclick = async () => {
    modal.close();
    if (onConfirm) await onConfirm();
  };

  modal.showModal();
}

// Format date helper
function formatDate(isoStr) {
  if (!isoStr) return '-';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// Debounce helper for live search
function debounce(fn, delay = 300) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

// Document Ready
document.addEventListener('DOMContentLoaded', () => {
  initSidebar();
  initDialogs();
  checkDbStatus();
});
