// Frontend logic to fetch products with pagination and filters
(function () {
  const listEl = document.getElementById('product-list');
  const paginationEl = document.getElementById('pagination');
  const categoryEl = document.getElementById('filter-category');
  const minEl = document.getElementById('filter-min');
  const maxEl = document.getElementById('filter-max');
  const applyBtn = document.getElementById('apply-filters');
  const clearBtn = document.getElementById('clear-filters');

  let state = { page: 1, limit: 10 };

  function buildQuery() {
    const params = new URLSearchParams();
    params.set('page', state.page);
    params.set('limit', state.limit);
    if (categoryEl.value) params.set('category', categoryEl.value);
    if (minEl.value) params.set('minPrice', minEl.value);
    if (maxEl.value) params.set('maxPrice', maxEl.value);
    return params.toString();
  }

  async function fetchProducts() {
    try {
      paginationEl.innerHTML = 'Loading...';
      const q = buildQuery();
      const res = await fetch('/api/products?' + q);
      const data = await res.json();
      renderProducts(data.products);
      renderPagination(data.pagination);
    } catch (err) {
      console.error(err);
      listEl.innerHTML = '<p style="grid-column:1/-1;color:red">Failed to load products</p>';
      paginationEl.innerHTML = '';
    }
  }

  function renderProducts(products) {
    if (!products || products.length === 0) {
      listEl.innerHTML = '<p style="grid-column:1/-1;">No products found</p>';
      return;
    }
    listEl.innerHTML = products.map(p => `
      <div class="product-card" style="border:1px solid #e0e0e0; padding:12px; border-radius:6px; background:#fff;">
        <img src="${p.image || '/images/home_tour_photo_1.jpg'}" alt="${escapeHtml(p.name)}" style="width:100%; height:150px; object-fit:cover; border-radius:4px;">
        <h4 style="margin:8px 0 4px">${escapeHtml(p.name)}</h4>
        <div style="color:#555; font-size:14px; margin-bottom:8px">${escapeHtml(p.category)} - <b>$${p.price}</b></div>
        <p style="font-size:13px; color:#666; min-height:40px">${escapeHtml(p.description || '')}</p>
      </div>
    `).join('');
  }

  function renderPagination(pagination) {
    if (!pagination) { paginationEl.innerHTML = ''; return; }
    const { page, totalPages } = pagination;
    const prevDisabled = page <= 1 ? 'disabled' : '';
    const nextDisabled = page >= totalPages ? 'disabled' : '';

    let html = '';
    html += `<button ${prevDisabled} data-page="${page - 1}">Prev</button>`;
    // show 1..total small list limited
    const start = Math.max(1, page - 2);
    const end = Math.min(totalPages, page + 2);
    for (let i = start; i <= end; i++) {
      html += `<button class="page-btn" ${i === page ? 'disabled' : ''} data-page="${i}">${i}</button>`;
    }
    html += `<button ${nextDisabled} data-page="${page + 1}">Next</button>`;

    paginationEl.innerHTML = html;

    paginationEl.querySelectorAll('button[data-page]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const p = parseInt(btn.getAttribute('data-page'));
        if (!isNaN(p) && p > 0) {
          state.page = p;
          fetchProducts();
        }
      });
    });
  }

  applyBtn.addEventListener('click', () => {
    state.page = 1;
    fetchProducts();
  });

  clearBtn.addEventListener('click', () => {
    categoryEl.value = '';
    minEl.value = '';
    maxEl.value = '';
    state.page = 1;
    fetchProducts();
  });

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // initial load
  fetchProducts();
})();
