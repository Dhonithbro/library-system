USE library_db;
-- ================= CRUD (SQL level) =================
-- CREATE
INSERT INTO member(full_name,email,phone,member_type,dept_id) VALUES ('Test User','test@college.edu','9000000000','Student',1);
-- READ
SELECT * FROM v_book_catalog;
SELECT * FROM book WHERE title LIKE '%Data%';
-- UPDATE
UPDATE member SET phone='9111111111' WHERE email='test@college.edu';
-- DELETE
DELETE FROM member WHERE email='test@college.edu';

-- ================= REPORTS =================
SELECT * FROM v_overdue_books;
SELECT * FROM v_popular_books LIMIT 5;
SELECT * FROM v_member_summary;
SELECT * FROM v_fine_report;
SELECT * FROM v_category_stock;
SELECT d.dept_name, COUNT(*) AS issues FROM issue i JOIN member m USING(member_id) JOIN department d USING(dept_id) GROUP BY d.dept_name;
SELECT title FROM book WHERE book_id NOT IN (SELECT book_id FROM issue);          -- never issued

-- ================= TRANSACTION DEMO 1: manual COMMIT =================
START TRANSACTION;
  INSERT INTO issue(member_id,book_id,librarian_id,issue_date,due_date) VALUES (4,4,1,CURDATE(),DATE_ADD(CURDATE(),INTERVAL 14 DAY));
  UPDATE book SET available_copies = available_copies - 1 WHERE book_id = 4;
COMMIT;

-- ================= TRANSACTION DEMO 2: ROLLBACK (nothing is saved) =================
SELECT available_copies FROM book WHERE book_id = 5;   -- before: 2
START TRANSACTION;
  UPDATE book SET available_copies = available_copies - 1 WHERE book_id = 5;
  SELECT available_copies FROM book WHERE book_id = 5; -- inside: 1
ROLLBACK;
SELECT available_copies FROM book WHERE book_id = 5;   -- after: 2 again

-- ================= TRANSACTION DEMO 3: stored procedures =================
CALL sp_issue_book(5, 6, 1);     -- success
CALL sp_issue_book(5, 6, 1);     -- fails: already holds a copy (auto ROLLBACK)
CALL sp_return_book(1);          -- late return -> fine row created
SELECT * FROM fine;
