-- =====================================================================
-- College Library & Book Circulation System  |  MySQL 8.0+
-- Run:  mysql -u root -p < database/schema.sql
-- =====================================================================
DROP DATABASE IF EXISTS library_db;
CREATE DATABASE library_db CHARACTER SET utf8mb4;
USE library_db;

-- ---------- TABLES (all in 3NF) ----------
CREATE TABLE department (
  dept_id     INT AUTO_INCREMENT PRIMARY KEY,
  dept_name   VARCHAR(80) NOT NULL UNIQUE
);
CREATE TABLE category (
  category_id   INT AUTO_INCREMENT PRIMARY KEY,
  category_name VARCHAR(60) NOT NULL UNIQUE
);
CREATE TABLE publisher (
  publisher_id   INT AUTO_INCREMENT PRIMARY KEY,
  publisher_name VARCHAR(100) NOT NULL UNIQUE,
  city           VARCHAR(60)
);
CREATE TABLE author (
  author_id   INT AUTO_INCREMENT PRIMARY KEY,
  author_name VARCHAR(100) NOT NULL,
  country     VARCHAR(60)
);
CREATE TABLE book (
  book_id          INT AUTO_INCREMENT PRIMARY KEY,
  isbn             VARCHAR(20)  NOT NULL UNIQUE,
  title            VARCHAR(200) NOT NULL,
  publisher_id     INT NOT NULL,
  category_id      INT NOT NULL,
  publish_year     SMALLINT,
  shelf_location   VARCHAR(20),
  total_copies     INT NOT NULL DEFAULT 1,
  available_copies INT NOT NULL DEFAULT 1,
  CONSTRAINT chk_total  CHECK (total_copies >= 0),
  CONSTRAINT chk_avail  CHECK (available_copies >= 0 AND available_copies <= total_copies),
  CONSTRAINT fk_book_pub FOREIGN KEY (publisher_id) REFERENCES publisher(publisher_id) ON UPDATE CASCADE,
  CONSTRAINT fk_book_cat FOREIGN KEY (category_id)  REFERENCES category(category_id)  ON UPDATE CASCADE
);
-- M:N resolver  (Book <-> Author)
CREATE TABLE book_author (
  book_id   INT NOT NULL,
  author_id INT NOT NULL,
  PRIMARY KEY (book_id, author_id),
  CONSTRAINT fk_ba_book   FOREIGN KEY (book_id)   REFERENCES book(book_id)     ON DELETE CASCADE,
  CONSTRAINT fk_ba_author FOREIGN KEY (author_id) REFERENCES author(author_id) ON DELETE CASCADE
);
CREATE TABLE member (
  member_id   INT AUTO_INCREMENT PRIMARY KEY,
  full_name   VARCHAR(100) NOT NULL,
  email       VARCHAR(120) NOT NULL UNIQUE,
  phone       VARCHAR(15),
  member_type ENUM('Student','Faculty') NOT NULL DEFAULT 'Student',
  dept_id     INT NOT NULL,
  join_date   DATE NOT NULL DEFAULT (CURDATE()),
  status      ENUM('Active','Suspended') NOT NULL DEFAULT 'Active',
  CONSTRAINT fk_member_dept FOREIGN KEY (dept_id) REFERENCES department(dept_id) ON UPDATE CASCADE
);
CREATE TABLE librarian (
  librarian_id INT AUTO_INCREMENT PRIMARY KEY,
  full_name    VARCHAR(100) NOT NULL,
  email        VARCHAR(120) NOT NULL UNIQUE
);
CREATE TABLE issue (
  issue_id     INT AUTO_INCREMENT PRIMARY KEY,
  member_id    INT NOT NULL,
  book_id      INT NOT NULL,
  librarian_id INT NOT NULL,
  issue_date   DATE NOT NULL,
  due_date     DATE NOT NULL,
  return_date  DATE NULL,
  status       ENUM('Issued','Returned') NOT NULL DEFAULT 'Issued',
  CONSTRAINT chk_dates CHECK (due_date >= issue_date),
  CONSTRAINT fk_issue_member FOREIGN KEY (member_id)    REFERENCES member(member_id),
  CONSTRAINT fk_issue_book   FOREIGN KEY (book_id)      REFERENCES book(book_id),
  CONSTRAINT fk_issue_lib    FOREIGN KEY (librarian_id) REFERENCES librarian(librarian_id)
);
CREATE TABLE fine (
  fine_id     INT AUTO_INCREMENT PRIMARY KEY,
  issue_id    INT NOT NULL UNIQUE,
  amount      DECIMAL(8,2) NOT NULL CHECK (amount >= 0),
  paid_status ENUM('Unpaid','Paid') NOT NULL DEFAULT 'Unpaid',
  fine_date   DATE NOT NULL,
  CONSTRAINT fk_fine_issue FOREIGN KEY (issue_id) REFERENCES issue(issue_id)
);

CREATE INDEX idx_issue_member ON issue(member_id, status);
CREATE INDEX idx_issue_book   ON issue(book_id, status);
CREATE INDEX idx_book_title   ON book(title);

-- ---------- VIEWS (reports) ----------
CREATE VIEW v_book_catalog AS
SELECT b.book_id, b.isbn, b.title, c.category_name, p.publisher_name, b.publish_year,
       b.shelf_location, b.total_copies, b.available_copies,
       GROUP_CONCAT(a.author_name ORDER BY a.author_name SEPARATOR ', ') AS authors
FROM book b
JOIN category c  ON c.category_id  = b.category_id
JOIN publisher p ON p.publisher_id = b.publisher_id
LEFT JOIN book_author ba ON ba.book_id = b.book_id
LEFT JOIN author a       ON a.author_id = ba.author_id
GROUP BY b.book_id;

CREATE VIEW v_current_issues AS
SELECT i.issue_id, m.member_id, m.full_name AS member_name, b.book_id, b.title,
       i.issue_date, i.due_date,
       GREATEST(DATEDIFF(CURDATE(), i.due_date), 0) AS days_overdue
FROM issue i JOIN member m ON m.member_id = i.member_id
             JOIN book b   ON b.book_id   = i.book_id
WHERE i.status = 'Issued';

CREATE VIEW v_overdue_books AS
SELECT issue_id, member_name, title, due_date, days_overdue, days_overdue * 2 AS fine_so_far
FROM v_current_issues WHERE days_overdue > 0;

CREATE VIEW v_member_summary AS
SELECT m.member_id, m.full_name, m.member_type, d.dept_name,
       COUNT(i.issue_id)                         AS total_borrowed,
       SUM(i.status = 'Issued')                  AS currently_holding
FROM member m JOIN department d ON d.dept_id = m.dept_id
LEFT JOIN issue i ON i.member_id = m.member_id
GROUP BY m.member_id;

CREATE VIEW v_popular_books AS
SELECT b.book_id, b.title, COUNT(i.issue_id) AS times_issued
FROM book b LEFT JOIN issue i ON i.book_id = b.book_id
GROUP BY b.book_id ORDER BY times_issued DESC, b.title;

CREATE VIEW v_fine_report AS
SELECT f.fine_id, m.full_name AS member_name, b.title, f.amount, f.paid_status, f.fine_date
FROM fine f JOIN issue i ON i.issue_id = f.issue_id
            JOIN member m ON m.member_id = i.member_id
            JOIN book b   ON b.book_id   = i.book_id;

CREATE VIEW v_category_stock AS
SELECT c.category_name, COUNT(b.book_id) AS titles,
       COALESCE(SUM(b.total_copies),0) AS total_copies,
       COALESCE(SUM(b.available_copies),0) AS available_copies
FROM category c LEFT JOIN book b ON b.category_id = c.category_id
GROUP BY c.category_id;

-- ---------- STORED PROCEDURES (TRANSACTIONS) ----------
DELIMITER $$

-- ISSUE BOOK: atomic. Either every step succeeds (COMMIT) or nothing changes (ROLLBACK).
CREATE PROCEDURE sp_issue_book(IN p_member INT, IN p_book INT, IN p_lib INT)
BEGIN
  DECLARE v_status VARCHAR(20); DECLARE v_type VARCHAR(20);
  DECLARE v_avail INT; DECLARE v_count INT; DECLARE v_limit INT;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  START TRANSACTION;
  SELECT status, member_type INTO v_status, v_type FROM member WHERE member_id = p_member FOR UPDATE;
  IF v_status IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Member not found'; END IF;
  IF v_status <> 'Active' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Member account is suspended'; END IF;

  SELECT available_copies INTO v_avail FROM book WHERE book_id = p_book FOR UPDATE;
  IF v_avail IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Book not found'; END IF;
  IF v_avail = 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No copies available'; END IF;

  SELECT COUNT(*) INTO v_count FROM issue WHERE member_id = p_member AND status = 'Issued';
  SET v_limit = IF(v_type = 'Faculty', 5, 3);
  IF v_count >= v_limit THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Borrow limit reached for this member'; END IF;
  IF EXISTS (SELECT 1 FROM issue WHERE member_id = p_member AND book_id = p_book AND status = 'Issued') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Member already holds a copy of this book';
  END IF;

  INSERT INTO issue(member_id, book_id, librarian_id, issue_date, due_date)
  VALUES (p_member, p_book, p_lib, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 14 DAY));
  UPDATE book SET available_copies = available_copies - 1 WHERE book_id = p_book;
  COMMIT;
  SELECT LAST_INSERT_ID() AS issue_id, DATE_ADD(CURDATE(), INTERVAL 14 DAY) AS due_date;
END$$

-- RETURN BOOK: updates issue + stock, and creates a fine (Rs 2/day) if late.
CREATE PROCEDURE sp_return_book(IN p_issue INT)
BEGIN
  DECLARE v_book INT; DECLARE v_due DATE; DECLARE v_status VARCHAR(20); DECLARE v_fine DECIMAL(8,2) DEFAULT 0;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  START TRANSACTION;
  SELECT book_id, due_date, status INTO v_book, v_due, v_status FROM issue WHERE issue_id = p_issue FOR UPDATE;
  IF v_status IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Issue record not found'; END IF;
  IF v_status = 'Returned' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Book already returned'; END IF;

  UPDATE issue SET return_date = CURDATE(), status = 'Returned' WHERE issue_id = p_issue;
  UPDATE book  SET available_copies = available_copies + 1 WHERE book_id = v_book;
  IF CURDATE() > v_due THEN
    SET v_fine = DATEDIFF(CURDATE(), v_due) * 2;
    INSERT INTO fine(issue_id, amount, fine_date) VALUES (p_issue, v_fine, CURDATE());
  END IF;
  COMMIT;
  SELECT v_fine AS fine_amount;
END$$
DELIMITER ;
