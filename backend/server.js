const path = require('path');
const express = require('express');
const cors = require('cors');
const pool = require('./db');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));   // serve the frontend too

// Wrap async handlers so errors go to one place
const wrap = fn => (req, res, next) => fn(req, res).catch(next);

// ---------- generic CRUD for the simple lookup tables ----------
const simple = {
  departments: { table: 'department', pk: 'dept_id', cols: ['dept_name'] },
  categories: { table: 'category', pk: 'category_id', cols: ['category_name'] },
  publishers: { table: 'publisher', pk: 'publisher_id', cols: ['publisher_name', 'city'] },
  authors: { table: 'author', pk: 'author_id', cols: ['author_name', 'country'] },
  librarians: { table: 'librarian', pk: 'librarian_id', cols: ['full_name', 'email'] }
};
for (const [route, t] of Object.entries(simple)) {
  app.get(`/api/${route}`, wrap(async (q, r) => r.json((await pool.query(`SELECT * FROM ${t.table} ORDER BY ${t.pk}`))[0])));
  app.post(`/api/${route}`, wrap(async (q, r) => {
    const vals = t.cols.map(c => q.body[c] ?? null);
    const [x] = await pool.query(`INSERT INTO ${t.table}(${t.cols.join(',')}) VALUES (${t.cols.map(() => '?').join(',')})`, vals);
    r.status(201).json({ id: x.insertId });
  }));
  app.put(`/api/${route}/:id`, wrap(async (q, r) => {
    await pool.query(`UPDATE ${t.table} SET ${t.cols.map(c => c + '=?').join(',')} WHERE ${t.pk}=?`, [...t.cols.map(c => q.body[c] ?? null), q.params.id]);
    r.json({ ok: true });
  }));
  app.delete(`/api/${route}/:id`, wrap(async (q, r) => {
    await pool.query(`DELETE FROM ${t.table} WHERE ${t.pk}=?`, [q.params.id]); r.json({ ok: true });
  }));
}

// ---------- BOOKS (insert/update touch two tables => transaction) ----------
const bookCols = ['isbn', 'title', 'publisher_id', 'category_id', 'publish_year', 'shelf_location', 'total_copies'];
app.get('/api/books', wrap(async (q, r) => {
  const s = `%${q.query.search || ''}%`;
  const [rows] = await pool.query(
    `SELECT * FROM v_book_catalog WHERE title LIKE ? OR authors LIKE ? OR isbn LIKE ? ORDER BY title`, [s, s, s]);
  r.json(rows);
}));
app.get('/api/books/:id', wrap(async (q, r) => {
  const [[b]] = await pool.query('SELECT * FROM book WHERE book_id=?', [q.params.id]);
  if (!b) return r.status(404).json({ error: 'Book not found' });
  const [a] = await pool.query('SELECT author_id FROM book_author WHERE book_id=?', [q.params.id]);
  r.json({ ...b, author_ids: a.map(x => x.author_id) });
}));
async function saveBook(conn, id, b) {
  const ids = [].concat(b.author_ids || []).filter(Boolean);
  if (id === null) {
    const total = +b.total_copies || 1;
    const [x] = await conn.query(
      `INSERT INTO book(${bookCols.join(',')},available_copies) VALUES (?,?,?,?,?,?,?,?)`,
      [...bookCols.map(c => b[c] ?? null).slice(0, 6), total, total]);
    id = x.insertId;
  } else {
    const [[cur]] = await conn.query('SELECT total_copies, available_copies FROM book WHERE book_id=? FOR UPDATE', [id]);
    const total = +b.total_copies;
    const avail = cur.available_copies + (total - cur.total_copies);   // keep issued count intact
    await conn.query(
      `UPDATE book SET isbn=?,title=?,publisher_id=?,category_id=?,publish_year=?,shelf_location=?,total_copies=?,available_copies=? WHERE book_id=?`,
      [...bookCols.map(c => b[c] ?? null).slice(0, 6), total, avail, id]);
    await conn.query('DELETE FROM book_author WHERE book_id=?', [id]);
  }
  for (const a of ids) await conn.query('INSERT INTO book_author VALUES (?,?)', [id, a]);
  return id;
}
async function inTx(fn) {
  const conn = await pool.getConnection();
  try { await conn.beginTransaction(); const out = await fn(conn); await conn.commit(); return out; }
  catch (e) { await conn.rollback(); throw e; }
  finally { conn.release(); }
}
app.post('/api/books', wrap(async (q, r) => r.status(201).json({ id: await inTx(c => saveBook(c, null, q.body)) })));
app.put('/api/books/:id', wrap(async (q, r) => { await inTx(c => saveBook(c, +q.params.id, q.body)); r.json({ ok: true }); }));
app.delete('/api/books/:id', wrap(async (q, r) => { await pool.query('DELETE FROM book WHERE book_id=?', [q.params.id]); r.json({ ok: true }); }));

// ---------- MEMBERS ----------
const memCols = ['full_name', 'email', 'phone', 'member_type', 'dept_id', 'status'];
app.get('/api/members', wrap(async (q, r) => {
  const s = `%${q.query.search || ''}%`;
  r.json((await pool.query(
    `SELECT m.*, d.dept_name FROM member m JOIN department d ON d.dept_id=m.dept_id
     WHERE m.full_name LIKE ? OR m.email LIKE ? ORDER BY m.member_id`, [s, s]))[0]);
}));
app.post('/api/members', wrap(async (q, r) => {
  const b = q.body;
  const [x] = await pool.query('INSERT INTO member(full_name,email,phone,member_type,dept_id) VALUES (?,?,?,?,?)',
    [b.full_name, b.email, b.phone || null, b.member_type || 'Student', b.dept_id]);
  r.status(201).json({ id: x.insertId });
}));
app.put('/api/members/:id', wrap(async (q, r) => {
  await pool.query(`UPDATE member SET ${memCols.map(c => c + '=?').join(',')} WHERE member_id=?`,
    [...memCols.map(c => q.body[c] ?? null), q.params.id]);
  r.json({ ok: true });
}));
app.delete('/api/members/:id', wrap(async (q, r) => { await pool.query('DELETE FROM member WHERE member_id=?', [q.params.id]); r.json({ ok: true }); }));

// ---------- CIRCULATION (calls the transactional stored procedures) ----------
app.get('/api/issues', wrap(async (q, r) => {
  const where = q.query.status ? 'WHERE i.status=?' : '';
  r.json((await pool.query(
    `SELECT i.*, m.full_name AS member_name, b.title,
            IF(i.status='Issued', GREATEST(DATEDIFF(CURDATE(), i.due_date),0), 0) AS days_overdue
     FROM issue i JOIN member m ON m.member_id=i.member_id JOIN book b ON b.book_id=i.book_id
     ${where} ORDER BY i.issue_id DESC`, q.query.status ? [q.query.status] : []))[0]);
}));
app.post('/api/issue', wrap(async (q, r) => {
  const { member_id, book_id, librarian_id } = q.body;
  try {
    const [res] = await pool.query('CALL sp_issue_book(?,?,?)', [member_id, book_id, librarian_id]);
    return r.status(201).json(res[0][0]);
  } catch (err) {
    // If cloud database does not support stored procedures, execute transaction directly:
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [[mem]] = await conn.query('SELECT status, member_type FROM member WHERE member_id = ? FOR UPDATE', [member_id]);
      if (!mem) throw new Error('Member not found');
      if (mem.status !== 'Active') throw new Error('Member account is suspended');
      const [[bk]] = await conn.query('SELECT available_copies FROM book WHERE book_id = ? FOR UPDATE', [book_id]);
      if (!bk) throw new Error('Book not found');
      if (bk.available_copies <= 0) throw new Error('No copies available');
      const [[cnt]] = await conn.query("SELECT COUNT(*) AS c FROM issue WHERE member_id = ? AND status = 'Issued'", [member_id]);
      const limit = mem.member_type === 'Faculty' ? 5 : 3;
      if (cnt.c >= limit) throw new Error('Borrow limit reached for this member');
      const [[held]] = await conn.query("SELECT 1 FROM issue WHERE member_id = ? AND book_id = ? AND status = 'Issued'", [member_id, book_id]);
      if (held) throw new Error('Member already holds a copy of this book');

      const [ins] = await conn.query(
        "INSERT INTO issue(member_id, book_id, librarian_id, issue_date, due_date) VALUES (?, ?, ?, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 14 DAY))",
        [member_id, book_id, librarian_id]
      );
      await conn.query('UPDATE book SET available_copies = available_copies - 1 WHERE book_id = ?', [book_id]);
      await conn.commit();
      const [[due]] = await conn.query('SELECT DATE_ADD(CURDATE(), INTERVAL 14 DAY) AS due_date');
      return r.status(201).json({ issue_id: ins.insertId, due_date: due.due_date });
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }
}));

app.post('/api/return/:id', wrap(async (q, r) => {
  try {
    const [res] = await pool.query('CALL sp_return_book(?)', [q.params.id]);
    return r.json(res[0][0]);
  } catch (err) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [[iss]] = await conn.query('SELECT book_id, due_date, status FROM issue WHERE issue_id = ? FOR UPDATE', [q.params.id]);
      if (!iss) throw new Error('Issue record not found');
      if (iss.status === 'Returned') throw new Error('Book already returned');
      await conn.query("UPDATE issue SET return_date = CURDATE(), status = 'Returned' WHERE issue_id = ?", [q.params.id]);
      await conn.query('UPDATE book SET available_copies = available_copies + 1 WHERE book_id = ?', [iss.book_id]);
      let fine = 0;
      const [[diff]] = await conn.query('SELECT DATEDIFF(CURDATE(), ?) AS diff', [iss.due_date]);
      if (diff && diff.diff > 0) {
        fine = diff.diff * 2;
        await conn.query('INSERT INTO fine(issue_id, amount, fine_date) VALUES (?, ?, CURDATE())', [q.params.id, fine]);
      }
      await conn.commit();
      return r.json({ fine_amount: fine });
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }
}));
app.put('/api/fines/:id/pay', wrap(async (q, r) => {
  await pool.query("UPDATE fine SET paid_status='Paid' WHERE fine_id=?", [q.params.id]); r.json({ ok: true });
}));

// ---------- DASHBOARD + REPORTS (views) ----------
app.get('/api/stats', wrap(async (q, r) => {
  const [[s]] = await pool.query(`SELECT
    (SELECT COUNT(*) FROM book) AS titles,
    (SELECT COALESCE(SUM(available_copies),0) FROM book) AS available,
    (SELECT COUNT(*) FROM member) AS members,
    (SELECT COUNT(*) FROM issue WHERE status='Issued') AS issued,
    (SELECT COUNT(*) FROM v_overdue_books) AS overdue,
    (SELECT COALESCE(SUM(amount),0) FROM fine WHERE paid_status='Unpaid') AS unpaid_fines`);
  r.json(s);
}));
const reports = ['v_overdue_books', 'v_popular_books', 'v_member_summary', 'v_fine_report', 'v_category_stock', 'v_current_issues'];
app.get('/api/reports/:name', wrap(async (q, r) => {
  if (!reports.includes(q.params.name)) return r.status(404).json({ error: 'Unknown report' });
  r.json((await pool.query(`SELECT * FROM ${q.params.name}`))[0]);
}));

// ---------- error handling: turn SQL errors into friendly messages ----------
app.use((err, req, res, next) => {
  console.error(err.code || '', err.message);
  const map = {
    ER_DUP_ENTRY: [409, 'Duplicate value: that record already exists'],
    ER_ROW_IS_REFERENCED_2: [409, 'Cannot delete: other records depend on this one'],
    ER_NO_REFERENCED_ROW_2: [400, 'Invalid reference: selected item does not exist'],
    ER_CHECK_CONSTRAINT_VIOLATED: [400, 'Value violates a table rule (e.g. copies cannot be negative)']
  };
  if (err.sqlState === '45000') return res.status(400).json({ error: err.sqlMessage });
  const [code, msg] = map[err.code] || [500, 'Server/database error: ' + (err.sqlMessage || err.message)];
  res.status(code).json({ error: msg });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Library system running at http://localhost:${PORT}`));
