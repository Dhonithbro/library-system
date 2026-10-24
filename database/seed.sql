USE library_db;
INSERT INTO department(dept_name) VALUES ('Computer Science'),('Electronics'),('Mechanical'),('Mathematics');
INSERT INTO category(category_name) VALUES ('Computer Science'),('Electronics'),('Mathematics'),('Literature'),('Management');
INSERT INTO publisher(publisher_name, city) VALUES ('Pearson','Chennai'),('McGraw Hill','New Delhi'),('Oxford Press','Mumbai');
INSERT INTO author(author_name, country) VALUES
 ('Abraham Silberschatz','USA'),('Henry Korth','USA'),('S. Sudarshan','India'),
 ('Thomas Cormen','USA'),('Andrew Tanenbaum','Netherlands'),('R. K. Narayan','India'),('Erwin Kreyszig','Germany');
INSERT INTO book(isbn,title,publisher_id,category_id,publish_year,shelf_location,total_copies,available_copies) VALUES
 ('9780078022159','Database System Concepts',2,1,2019,'CS-A1',3,2),
 ('9780262033848','Introduction to Algorithms',1,1,2009,'CS-A2',2,1),
 ('9780133594140','Computer Networks',1,1,2013,'CS-B1',2,2),
 ('9780470458365','Advanced Engineering Mathematics',3,3,2011,'MA-C1',4,4),
 ('9788185986173','Malgudi Days',3,4,1982,'LT-D1',2,2),
 ('9780134670959','Operating System Concepts',2,1,2018,'CS-B2',3,3),
 ('9780071314473','Principles of Management',2,5,2015,'MG-E1',2,2),
 ('9780133128093','Digital Design',1,2,2012,'EL-F1',2,2);
INSERT INTO book_author VALUES (1,1),(1,2),(1,3),(2,4),(3,5),(4,7),(5,6),(6,1),(6,2),(6,3);
INSERT INTO member(full_name,email,phone,member_type,dept_id,join_date) VALUES
 ('Ravi Kumar','ravi@college.edu','9876543210','Student',1,'2025-07-01'),
 ('Anitha Reddy','anitha@college.edu','9876500011','Student',2,'2025-07-01'),
 ('Dr. Suresh Babu','suresh@college.edu','9876500022','Faculty',1,'2020-06-15'),
 ('Priya Sharma','priya@college.edu','9876500033','Student',4,'2026-01-10'),
 ('Karthik Naidu','karthik@college.edu','9876500044','Student',3,'2026-01-10');
INSERT INTO librarian(full_name,email) VALUES ('Lakshmi Devi','lakshmi@college.edu'),('Mohan Rao','mohan@college.edu');
-- history (stock numbers above already reflect the 3 books currently out)
INSERT INTO issue(member_id,book_id,librarian_id,issue_date,due_date,return_date,status) VALUES
 (1,1,1,DATE_SUB(CURDATE(),INTERVAL 20 DAY),DATE_SUB(CURDATE(),INTERVAL 6 DAY),NULL,'Issued'),   -- overdue
 (2,2,1,DATE_SUB(CURDATE(),INTERVAL 3 DAY), DATE_ADD(CURDATE(),INTERVAL 11 DAY),NULL,'Issued'),
 (3,3,2,DATE_SUB(CURDATE(),INTERVAL 60 DAY),DATE_SUB(CURDATE(),INTERVAL 46 DAY),DATE_SUB(CURDATE(),INTERVAL 50 DAY),'Returned'),
 (1,3,2,DATE_SUB(CURDATE(),INTERVAL 90 DAY),DATE_SUB(CURDATE(),INTERVAL 76 DAY),DATE_SUB(CURDATE(),INTERVAL 66 DAY),'Returned'),
 (4,6,1,DATE_SUB(CURDATE(),INTERVAL 40 DAY),DATE_SUB(CURDATE(),INTERVAL 26 DAY),DATE_SUB(CURDATE(),INTERVAL 30 DAY),'Returned');
INSERT INTO fine(issue_id,amount,paid_status,fine_date) VALUES (4,20.00,'Paid',DATE_SUB(CURDATE(),INTERVAL 66 DAY));
