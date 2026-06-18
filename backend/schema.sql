-- Run this in Neon SQL Editor

-- Users table (replaces Supabase Auth)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Teaching staff
CREATE TABLE IF NOT EXISTS teachers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  subject TEXT DEFAULT '',
  unavail TEXT DEFAULT '',
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Attendants
CREATE TABLE IF NOT EXISTS attendants (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  unavail TEXT DEFAULT '',
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Invigilator pairs
CREATE TABLE IF NOT EXISTS pairs (
  id SERIAL PRIMARY KEY,
  member_a TEXT NOT NULL,
  member_b TEXT NOT NULL,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Exam venues
CREATE TABLE IF NOT EXISTS venues (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  capacity INT DEFAULT 20,
  pairs_needed INT DEFAULT 1,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Exam timetable
CREATE TABLE IF NOT EXISTS exams (
  id SERIAL PRIMARY KEY,
  exam_date TEXT NOT NULL,
  slot TEXT NOT NULL DEFAULT 'Slot 1',
  start_time TEXT DEFAULT '',
  end_time TEXT DEFAULT '',
  duration_min INT,
  candidates INT,
  grade TEXT DEFAULT '',
  subject TEXT DEFAULT '',
  venue TEXT NOT NULL,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Configuration
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Default config
INSERT INTO config (key, value) VALUES
  ('school_name', 'Curepipe College'),
  ('series_label', ''),
  ('own_subject_rule', 'false'),
  ('grades_list', 'Grade 7|Grade 7 (Ext)|Grade 8|Grade 9|Grade 10|Grade 11|Grade 12|Grade 13|PVE'),
  ('subjects_list', 'Economics|General Paper|Hindi|Commerce|Physics|Social Studies|Business Studies|Art|Food & Textile Studies|Computer Science|Mathematics|Additional Mathematics|French|Design|English|Biology|Chemistry|Hinduism|ICT|Sociology|Travel & Tourism|Entrepreneurship Education|Life Skills|Physical Education|Accounting')
ON CONFLICT (key) DO NOTHING;

-- Seed 68 teachers
INSERT INTO teachers (name, sort_order) VALUES
('AUMEER Prithiviraj',1),('BANKA Sheetal',2),('BAURHOO Bibi Afsanah',3),('BAURHOO Kamleshsingh',4),
('BAWANYPECK Hemlata Singh',5),('BEEFNAH - GHOORBIN Vanusha',6),('BEEHARRY Priyadarshinee',7),
('BEGUE Mellino',8),('BHIKOO TATEA Soumita',9),('BHOWANEE Steeve Desire',10),
('BHUGWATH Kunal Sharmah',11),('BHURTHA Sangeeta Devi',12),('BISSESSUR Whelena Pillay',13),
('BOKHOREE-LALLJEE Kareshma Devi',14),('BOODHOO Karouna Devi',15),('BOYJOO Ashwinee',16),
('BULLADIN Bibi Shaheen',17),('BUSAWON Arvind Willy',18),('CHOOLUN Ameersingh',19),
('CURPEN Kovilen',20),('DEENOO Karishma',21),('DHUNPUT Preeti',22),('DHURMEA Yashwant',23),
('DUSOYE Jayshree',24),('DUSSAYA Pravish',25),('DWARKA Ashvin',26),('GHEERAWO Preetum Shyam',27),
('GHOORUN Shenaz',28),('GOOLJAR Deepak',29),('GOORVADOO Darshinee',30),
('GUNGADIN BOODHNA Chandranee',31),('HARDOWAR Khemwantee',32),('JANKEE Laxmee Devi',33),
('KALLEE Seewoosagur',34),('KHANDOO Vishwadev',35),('KITARUTH Ashna',36),
('LAURENT Louis Gino Giovanni',37),('LOBOGUN Sindi',38),('LUCKOO Anouraj',39),('MAGON Georgie',40),
('MOONEESAWMY Ananda',41),('MUNGROO Mohammad Zubair',42),('NEEHAUL Jessica',43),
('NEERAHOO Mohammad Shadat Khan',44),('NEERSOO Dilesh',45),('NUNKOO Keshwarduth',46),
('PATROO Niraj Kumar',47),('PERMALL Yovishka Navina',48),('PILLAY Yagaven',49),('PROAG Devika',50),
('PUCHOOA Keevraj Kumar',51),('QUEDOU Neha',52),('RAMKORUN Taramattee',53),('RUPEAR Resmee',54),
('SEEROO Chandradeosing Juddoo',55),('SEETARAM-BUNDHOO Pareema Sing',56),
('SEEWOOSUNKUR Goorooduth',57),('SEWPAL Arjun',58),('SOBRUN Lutchman',59),('SOMOROWA Vishal',60),
('SOOBUNGS Dharmansingh',61),('SOOKAYE Ahtish',62),('SOOKHUR Breehaspatty Soorujsing',63),
('SOORIAMOORTHY Revathy',64),('SUDDUL Varuna',65),('THEODORE Marie Carole Joanna',66),
('TYMUN Premee',67),('UJOODIA Jeetendra',68)
ON CONFLICT DO NOTHING;
