const API = (window.API_BASE || '') + '/api';
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function api(path, method = 'GET', body) {
  const r = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Request failed');
  return d;
}

let tt;
function toast(m, err) {
  const t = $('#toast');
  t.innerHTML = `<span class="toast-dot ${err ? 'err' : 'ok'}"></span><span>${esc(m)}</span>`;
  t.className = 'show' + (err ? ' err' : '');
  clearTimeout(tt);
  tt = setTimeout(() => t.className = '', 3400);
}

async function run(fn, ok) {
  try {
    await fn();
    if (ok) toast(ok);
  } catch (e) {
    toast(e.message, true);
  }
}

function table(cols, rows, actions) {
  if (!rows || !rows.length) {
    return `<div class="tw"><div class="empty">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M16 16s-1.5-2-4-2-4 2-4 2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
      <p>No records found in this view.</p>
    </div></div>`;
  }
  const head = cols.map(c => `<th>${c[1]}</th>`).join('') + (actions ? '<th class="th-actions">Actions</th>' : '');
  const body = rows.map(r => '<tr>' + cols.map(c => `<td>${c[2] ? c[2](r) : esc(r[c[0]])}</td>`).join('') + (actions ? `<td class="act">${actions(r)}</td>` : '') + '</tr>').join('');
  return `<div class="tw"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

const tag = (t, c) => `<span class="tag ${c}"><span class="tag-bullet"></span>${esc(t)}</span>`;

// ---------- generic modal form ----------
function form(title, fields, values = {}) {
  return new Promise(res => {
    const d = $('#dlg'), f = $('#frm');
    f.innerHTML = `<div class="form-header"><h3>${title}</h3><p class="form-desc">Fill in the parameters below and save.</p></div>` + fields.map(x => {
      const v = values[x.n] ?? '';
      if (x.opts) {
        return `<label class="form-field"><span class="field-label">${x.l}${x.req ? ' *' : ''}</span><select name="${x.n}" ${x.multi ? 'multiple' : ''} ${x.req ? 'required' : ''}>${x.multi ? '' : '<option value="">Select an option…</option>'}${x.opts.map(o => `<option value="${o[0]}" ${[].concat(v).map(String).includes(String(o[0])) ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select></label>`;
      }
      return `<label class="form-field"><span class="field-label">${x.l}${x.req ? ' *' : ''}</span><input name="${x.n}" type="${x.t || 'text'}" value="${esc(v)}" ${x.req ? 'required' : ''} ${x.t === 'number' ? 'min="0"' : ''} placeholder="Enter ${esc(x.l.toLowerCase())}"></label>`;
    }).join('') + '<div class="row"><button type="button" class="btn sec" id="cx">Cancel</button><button class="btn primary-gradient">Save Record</button></div>';
    
    $('#cx').onclick = () => { d.close(); res(null); };
    f.onsubmit = e => {
      e.preventDefault();
      const o = {};
      fields.forEach(x => {
        const el = f.elements[x.n];
        o[x.n] = x.multi ? [...el.selectedOptions].map(i => i.value) : el.value === '' ? null : el.value;
      });
      d.close();
      res(o);
    };
    d.showModal();
  });
}

const lk = {};
async function loadLookups() {
  const [dep, cat, pub, aut, lib] = await Promise.all(['departments', 'categories', 'publishers', 'authors', 'librarians'].map(x => api('/' + x)));
  Object.assign(lk, { dep, cat, pub, aut, lib });
}
const opt = (a, id, nm) => (a || []).map(x => [x[id], x[nm]]);

// ---------- pages ----------
const pages = {
  async dashboard() {
    const s = await api('/stats'), od = await api('/reports/v_overdue_books');
    return `
    <div class="page-header">
      <div>
        <h2>Circulation Dashboard</h2>
        <p class="lead">Live operational indicators and circulation metrics.</p>
      </div>
    </div>
    
    <div class="stats">
      <div class="stat">
        <div class="stat-icon-wrap ic-indigo">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
        </div>
        <div class="stat-body">
          <b>${s.titles}</b>
          <span>Total Titles</span>
        </div>
      </div>

      <div class="stat">
        <div class="stat-icon-wrap ic-emerald">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        </div>
        <div class="stat-body">
          <b>${s.available}</b>
          <span>Copies on Shelf</span>
        </div>
      </div>

      <div class="stat">
        <div class="stat-icon-wrap ic-blue">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        </div>
        <div class="stat-body">
          <b>${s.members}</b>
          <span>Registered Members</span>
        </div>
      </div>

      <div class="stat">
        <div class="stat-icon-wrap ic-amber">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6"/><path d="M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
        </div>
        <div class="stat-body">
          <b>${s.issued}</b>
          <span>Currently Issued</span>
        </div>
      </div>

      <div class="stat ${s.overdue ? 'bad' : ''}">
        <div class="stat-icon-wrap ic-rose">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>
        <div class="stat-body">
          <b>${s.overdue}</b>
          <span>Overdue Books</span>
        </div>
      </div>

      <div class="stat ${+s.unpaid_fines ? 'bad' : ''}">
        <div class="stat-icon-wrap ic-purple">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
        </div>
        <div class="stat-body">
          <b>₹${s.unpaid_fines}</b>
          <span>Unpaid Fines</span>
        </div>
      </div>
    </div>

    <div class="section-title-wrap">
      <h3>Overdue Alert Queue</h3>
      <span class="sub-counter">${od.length} action item${od.length === 1 ? '' : 's'}</span>
    </div>` +
    table([
      ['issue_id', 'Issue #'],
      ['member_name', 'Borrower'],
      ['title', 'Book Title'],
      ['due_date', 'Due Date', r => String(r.due_date || '').slice(0, 10)],
      ['days_overdue', 'Late By', r => tag(`${r.days_overdue} days`, 'bad')],
      ['fine_so_far', 'Fine Accrued', r => `<strong>₹${r.fine_so_far}</strong>`]
    ], od);
  },

  async books() {
    const q = window._bq || '', rows = await api('/books?search=' + encodeURIComponent(q));
    return `
    <div class="page-header">
      <div>
        <h2>Books Catalog</h2>
        <p class="lead">Search real-time availability and physical shelf coordinates.</p>
      </div>
      <button class="btn primary-gradient" id="addBook">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        <span>Add New Book</span>
      </button>
    </div>

    <div class="bar">
      <div class="search-wrap">
        <svg class="search-ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input id="bs" placeholder="Search title, author or ISBN..." value="${esc(q)}">
      </div>
      <span class="sp"></span>
      <span class="result-count">${rows.length} book titles</span>
    </div>` +
    table([
      ['book_id', 'ID'],
      ['title', 'Title', r => `<strong>${esc(r.title)}</strong><br><small style="color:var(--mut)">ISBN: ${esc(r.isbn)}</small>`],
      ['authors', 'Authors'],
      ['category_name', 'Category'],
      ['shelf_location', 'Location', r => `<span class="shelf-pill">${esc(r.shelf_location)}</span>`],
      ['available_copies', 'Stock', r => tag(`${r.available_copies} / ${r.total_copies} available`, r.available_copies ? 'ok' : 'bad')]
    ], rows,
    r => `<button class="btn sm sec" data-edit="${r.book_id}">Edit</button><button class="btn sm red" data-del="${r.book_id}">Delete</button>`);
  },

  async members() {
    const q = window._mq || '', rows = await api('/members?search=' + encodeURIComponent(q));
    return `
    <div class="page-header">
      <div>
        <h2>Library Members</h2>
        <p class="lead">Borrowers registry &bull; Students (limit: 3 books), Faculty (limit: 5 books).</p>
      </div>
      <button class="btn primary-gradient" id="addMem">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        <span>Add Member</span>
      </button>
    </div>

    <div class="bar">
      <div class="search-wrap">
        <svg class="search-ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input id="ms" placeholder="Search member name or email..." value="${esc(q)}">
      </div>
      <span class="sp"></span>
      <span class="result-count">${rows.length} registered</span>
    </div>` +
    table([
      ['member_id', 'ID'],
      ['full_name', 'Member Name', r => `<strong>${esc(r.full_name)}</strong>`],
      ['email', 'Contact', r => `<span>${esc(r.email)}</span><br><small style="color:var(--mut)">${esc(r.phone || 'No phone')}</small>`],
      ['member_type', 'Type', r => `<span class="type-pill ${r.member_type.toLowerCase()}">${esc(r.member_type)}</span>`],
      ['dept_name', 'Department'],
      ['status', 'Status', r => tag(r.status, r.status === 'Active' ? 'ok' : 'bad')]
    ], rows,
    r => `<button class="btn sm sec" data-edit="${r.member_id}">Edit</button><button class="btn sm red" data-del="${r.member_id}">Delete</button>`);
  },

  async circulation() {
    const [mem, books, cur, all] = await Promise.all([api('/members'), api('/books'), api('/issues?status=Issued'), api('/issues')]);
    const sel = (id, arr) => `<select id="${id}" required><option value="">Select option…</option>${arr.map(o => `<option value="${o[0]}">${esc(o[1])}</option>`).join('')}</select>`;
    return `
    <div class="page-header">
      <div>
        <h2>Circulation Desk</h2>
        <p class="lead">Atomic transactions with automatic overdue fine computation.</p>
      </div>
    </div>

    <div class="grid2">
      <div class="panel form-panel">
        <div class="panel-header">
          <h3>Issue a Book</h3>
          <span class="badge-loan">14-Day Lending Period</span>
        </div>
        <label class="form-field"><span class="field-label">Select Borrower Member *</span>${sel('im', mem.filter(m => m.status === 'Active').map(m => [m.member_id, `${m.full_name} (${m.member_type} #${m.member_id})`]))}</label>
        <label class="form-field"><span class="field-label">Select Available Book *</span>${sel('ib', books.filter(b => b.available_copies > 0).map(b => [b.book_id, `${b.title} [${b.available_copies} in stock]`]))}</label>
        <label class="form-field"><span class="field-label">Issuing Librarian *</span>${sel('il', opt(lk.lib, 'librarian_id', 'full_name'))}</label>
        <button class="btn primary-gradient full-w" id="doIssue">Complete Loan Issue</button>
      </div>

      <div class="panel info-panel">
        <div class="panel-header">
          <h3>Circulation Policy</h3>
        </div>
        <div class="policy-card">
          <div class="policy-icon">⚡</div>
          <div>
            <strong>Automated Transactions</strong>
            <p>Every checkout decrementing copies and return incrementing stock is wrapped in a strict SQL transaction.</p>
          </div>
        </div>
        <div class="policy-card">
          <div class="policy-icon">💰</div>
          <div>
            <strong>Fine Accrual Rule</strong>
            <p>Overdue returns automatically calculate ₹2.00 per late day and log an unbilled fine record instantly.</p>
          </div>
        </div>
      </div>
    </div>

    <div class="section-title-wrap" style="margin-top:32px">
      <h3>Currently Checked Out</h3>
      <span class="sub-counter">${cur.length} active loan${cur.length === 1 ? '' : 's'}</span>
    </div>` +
    table([
      ['issue_id', 'Loan #'],
      ['member_name', 'Borrower'],
      ['title', 'Book Title'],
      ['issue_date', 'Issued Date', r => String(r.issue_date || '').slice(0, 10)],
      ['due_date', 'Due Date', r => String(r.due_date || '').slice(0, 10)],
      ['days_overdue', 'Loan Status', r => r.days_overdue > 0 ? tag(`${r.days_overdue} days late`, 'bad') : tag('Active / On Time', 'ok')]
    ], cur,
    r => `<button class="btn sm primary-gradient" data-ret="${r.issue_id}">Process Return</button>`) +
    
    `<div class="section-title-wrap" style="margin-top:36px">
      <h3>Recent Circulation History</h3>
    </div>` +
    table([
      ['issue_id', 'Loan #'],
      ['member_name', 'Borrower'],
      ['title', 'Book Title'],
      ['issue_date', 'Issued', r => String(r.issue_date || '').slice(0, 10)],
      ['return_date', 'Returned', r => r.return_date ? String(r.return_date).slice(0, 10) : '<span style="color:var(--warn)">Pending</span>'],
      ['status', 'Final Status', r => tag(r.status, r.status === 'Returned' ? 'ok' : 'warn')]
    ], all.slice(0, 20));
  },

  async reports() {
    const R = {
      v_overdue_books: 'Overdue Books & Fines',
      v_popular_books: 'Most Borrowed Books',
      v_member_summary: 'Member Activity & Counts',
      v_fine_report: 'Fine Collection Summary',
      v_category_stock: 'Stock Count by Category'
    };
    const cur = window._rep || 'v_overdue_books', rows = await api('/reports/' + cur);
    const cols = rows.length ? Object.keys(rows[0]).map(k => [k, k.replace(/_/g, ' ')]) : [];
    return `
    <div class="page-header">
      <div>
        <h2>SQL Database Views &amp; Reports</h2>
        <p class="lead">Pre-compiled relational views querying 3NF tables in real-time.</p>
      </div>
    </div>

    <div class="bar">
      <div class="select-wrapper">
        <label for="rsel" style="font-size:13px;font-weight:600;color:var(--mut);margin-right:10px">Select View:</label>
        <select id="rsel">${Object.entries(R).map(([k, v]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${v} (${k})</option>`).join('')}</select>
      </div>
      <span class="sp"></span>
      <span class="result-count">${rows.length} records</span>
    </div>` +
    table(cols, rows, cur === 'v_fine_report' ? r => r.paid_status === 'Unpaid' ? `<button class="btn sm ok-btn" data-pay="${r.fine_id}">Mark as Paid</button>` : `<span style="color:var(--ok);font-size:13px;font-weight:600">✓ Settled</span>` : null);
  },

  async masters() {
    const sec = (key, title, cols) => `
    <div class="panel">
      <div class="bar" style="margin-bottom:12px">
        <h3 style="margin:0;font-size:17px">${title}</h3>
        <span class="sp"></span>
        <button class="btn sm sec" data-add="${key}">+ Add ${title.slice(0, -1)}</button>
      </div>` +
      table(cols.map(c => [c, c.replace(/_/g, ' ')]), lk[key]) + '</div>';

    return `
    <div class="page-header">
      <div>
        <h2>Master Data &amp; Reference Lookups</h2>
        <p class="lead">Normalized reference tables sustaining relational integrity.</p>
      </div>
    </div>
    <div class="grid2">
      ${sec('aut', 'Authors', ['author_id', 'author_name', 'country'])}
      ${sec('pub', 'Publishers', ['publisher_id', 'publisher_name', 'city'])}
      ${sec('cat', 'Categories', ['category_id', 'category_name'])}
      ${sec('dep', 'Departments', ['dept_id', 'dept_name'])}
    </div>`;
  }
};

// ---------- events ----------
const masterCfg = {
  aut: ['authors', 'author', [{ n: 'author_name', l: 'Author name', req: 1 }, { n: 'country', l: 'Country' }]],
  pub: ['publishers', 'publisher', [{ n: 'publisher_name', l: 'Publisher name', req: 1 }, { n: 'city', l: 'City' }]],
  cat: ['categories', 'category', [{ n: 'category_name', l: 'Category name', req: 1 }]],
  dep: ['departments', 'department', [{ n: 'dept_name', l: 'Department name', req: 1 }]]
};

const bookFields = () => [
  { n: 'isbn', l: 'ISBN (13 digits)', req: 1 },
  { n: 'title', l: 'Book Title', req: 1 },
  { n: 'author_ids', l: 'Authors (Hold Ctrl/Cmd to select multiple)', opts: opt(lk.aut, 'author_id', 'author_name'), multi: 1 },
  { n: 'category_id', l: 'Subject Category', opts: opt(lk.cat, 'category_id', 'category_name'), req: 1 },
  { n: 'publisher_id', l: 'Publisher', opts: opt(lk.pub, 'publisher_id', 'publisher_name'), req: 1 },
  { n: 'publish_year', l: 'Publication Year', t: 'number' },
  { n: 'shelf_location', l: 'Physical Shelf Location (e.g. CS-A1)' },
  { n: 'total_copies', l: 'Total Inventory Copies', t: 'number', req: 1 }
];

const memFields = edit => [
  { n: 'full_name', l: 'Full Name', req: 1 },
  { n: 'email', l: 'Official College Email', t: 'email', req: 1 },
  { n: 'phone', l: 'Phone Number' },
  { n: 'member_type', l: 'Membership Role', opts: [['Student', 'Student (Limit 3)'], ['Faculty', 'Faculty (Limit 5)']], req: 1 },
  { n: 'dept_id', l: 'Academic Department', opts: opt(lk.dep, 'dept_id', 'dept_name'), req: 1 },
  ...(edit ? [{ n: 'status', l: 'Account Status', opts: [['Active', 'Active Account'], ['Suspended', 'Suspended']], req: 1 }] : [])
];

async function show(p) {
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.p === p));
  window._p = p;
  try {
    await loadLookups();
    $('#view').innerHTML = await pages[p]();
  } catch (e) {
    $('#view').innerHTML = `
      <div class="panel error-panel">
        <div class="error-icon">⚠️</div>
        <h3>Cannot Reach Database</h3>
        <p>${esc(e.message)}. Please verify that your Node.js backend is running and MySQL service is active.</p>
        <button class="btn primary-gradient" onclick="show('${p}')">Retry Connection</button>
      </div>`;
  }
}

// Robust navigation click delegation
$('#nav').onclick = e => {
  const btn = e.target.closest('button[data-p]');
  if (btn) show(btn.dataset.p);
};

$('#view').addEventListener('click', e => run(async () => {
  const t = e.target.closest('button') || e.target, p = window._p;
  if (!t) return;
  if (t.id === 'addBook') {
    const v = await form('Register New Book', bookFields());
    if (v) { await api('/books', 'POST', v); toast('Book added to catalog'); show(p); }
  }
  else if (t.id === 'addMem') {
    const v = await form('Enroll New Member', memFields(false));
    if (v) { await api('/members', 'POST', v); toast('Member successfully registered'); show(p); }
  }
  else if (t.dataset.edit && p === 'books') {
    const cur = await api('/books/' + t.dataset.edit);
    const v = await form('Modify Book Record', bookFields(), cur);
    if (v) { await api('/books/' + t.dataset.edit, 'PUT', v); toast('Book details updated'); show(p); }
  }
  else if (t.dataset.edit && p === 'members') {
    const cur = (await api('/members')).find(m => m.member_id == t.dataset.edit);
    const v = await form('Edit Member Profile', memFields(true), cur);
    if (v) { await api('/members/' + t.dataset.edit, 'PUT', v); toast('Member record updated'); show(p); }
  }
  else if (t.dataset.del) {
    if (confirm('Are you sure you want to delete this record? This action cannot be undone.')) {
      await api(`/${p}/${t.dataset.del}`, 'DELETE');
      toast('Record removed');
      show(p);
    }
  }
  else if (t.id === 'doIssue') {
    const b = { member_id: $('#im').value, book_id: $('#ib').value, librarian_id: $('#il').value };
    if (!b.member_id || !b.book_id || !b.librarian_id) throw new Error('Please select a member, book, and issuing librarian.');
    const r = await api('/issue', 'POST', b);
    toast('Book issued successfully! Due date: ' + String(r.due_date).slice(0, 10));
    show(p);
  }
  else if (t.dataset.ret) {
    const r = await api('/return/' + t.dataset.ret, 'POST');
    toast(+r.fine_amount ? `Returned with late fine: ₹${r.fine_amount}` : 'Book returned on time! Stock restored.');
    show(p);
  }
  else if (t.dataset.pay) {
    await api(`/fines/${t.dataset.pay}/pay`, 'PUT');
    toast('Fine marked as settled');
    show(p);
  }
  else if (t.dataset.add) {
    const [route, , f] = masterCfg[t.dataset.add];
    const v = await form('Add Master Record', f);
    if (v) { await api('/' + route, 'POST', v); toast('Record saved'); show(p); }
  }
}));

$('#view').addEventListener('change', e => {
  if (e.target.id === 'rsel') {
    window._rep = e.target.value;
    show('reports');
  }
});

$('#view').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  if (e.target.id === 'bs') { window._bq = e.target.value; show('books'); }
  if (e.target.id === 'ms') { window._mq = e.target.value; show('members'); }
});

show('dashboard');
