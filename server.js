import express from "express";
import cors from "cors";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) { throw new Error("JWT_SECRET environment variable is required"); }
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const db = new Database(path.join(__dirname, "..", "storyhub.db"));
const uploads = path.join(__dirname, "..", "uploads");
fs.mkdirSync(uploads, {recursive:true});

app.use(cors());
app.use(express.json({limit:"2mb"}));
app.use("/uploads", express.static(uploads));

db.exec(`
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 email TEXT UNIQUE NOT NULL,
 password_hash TEXT NOT NULL,
 role TEXT NOT NULL DEFAULT 'reader',
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS stories (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 type TEXT NOT NULL DEFAULT 'story',
 title TEXT NOT NULL,
 author TEXT NOT NULL,
 genre TEXT NOT NULL,
 description TEXT DEFAULT '',
 cover_url TEXT DEFAULT '',
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS chapters (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 story_id INTEGER NOT NULL,
 title TEXT NOT NULL,
 content TEXT DEFAULT '',
 chapter_number INTEGER NOT NULL,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(story_id) REFERENCES stories(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS manga_images (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 story_id INTEGER NOT NULL,
 image_url TEXT NOT NULL,
 image_order INTEGER NOT NULL,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(story_id) REFERENCES stories(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS bookmarks (
 user_id INTEGER NOT NULL,
 story_id INTEGER NOT NULL,
 PRIMARY KEY(user_id, story_id)
);
CREATE TABLE IF NOT EXISTS reviews (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 story_id INTEGER NOT NULL,
 user_id INTEGER NOT NULL,
 rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
 body TEXT NOT NULL,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS complaints (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 story_id INTEGER NOT NULL,
 user_id INTEGER NOT NULL,
 body TEXT NOT NULL,
 status TEXT DEFAULT 'open',
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS ads (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 provider TEXT DEFAULT '',
 placement_id TEXT DEFAULT '',
 active INTEGER DEFAULT 1,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS ad_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER,
 event_type TEXT NOT NULL,
 amount REAL DEFAULT 0,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

function auth(req,res,next){
  const h=req.headers.authorization||"";
  if(!h.startsWith("Bearer ")) return res.status(401).json({error:"Login required"});
  try{ req.user=jwt.verify(h.slice(7),JWT_SECRET); next(); }
  catch{res.status(401).json({error:"Invalid or expired login"});}
}
function admin(req,res,next){
  if(req.user?.role!=="admin") return res.status(403).json({error:"Owner/admin access required"});
  next();
}
function token(user){return jwt.sign({id:user.id,name:user.name,email:user.email,role:user.role},JWT_SECRET,{expiresIn:"7d"});}

app.get("/api/health",(req,res)=>res.json({ok:true,service:"Story Hub API"}));

app.post("/api/auth/signup",(req,res)=>{
  const {name,email,password}=req.body;
  if(!name||!email||!password||password.length<6) return res.status(400).json({error:"Name, email and a password of at least 6 characters are required"});
  try{
    const hash=bcrypt.hashSync(password,10);
    const normalizedEmail=email.toLowerCase();
    const role = ADMIN_EMAIL && normalizedEmail === ADMIN_EMAIL ? "admin" : "reader";
    const info=db.prepare("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)").run(name,normalizedEmail,hash,role);
    const user=db.prepare("SELECT id,name,email,role FROM users WHERE id=?").get(info.lastInsertRowid);
    res.json({user,token:token(user)});
  }catch(e){res.status(409).json({error:"Email is already registered"});}
});

app.post("/api/auth/login",(req,res)=>{
  const {email,password}=req.body;
  const user=db.prepare("SELECT * FROM users WHERE email=?").get((email||"").toLowerCase());
  if(!user||!bcrypt.compareSync(password||"",user.password_hash)) return res.status(401).json({error:"Invalid email or password"});
  const safe={id:user.id,name:user.name,email:user.email,role:user.role};
  res.json({user:safe,token:token(safe)});
});

app.get("/api/stories",(req,res)=>{
  const q=(req.query.q||"").trim(), genre=(req.query.genre||"").trim().toLowerCase(), type=req.query.type;
  let sql="SELECT * FROM stories WHERE 1=1", args=[];
  if(q){sql+=" AND (lower(title) LIKE ? OR lower(author) LIKE ? OR lower(genre) LIKE ?)"; const x="%"+q.toLowerCase()+"%";args.push(x,x,x);}
  if(genre){sql+=" AND lower(genre)=?";args.push(genre)}
  if(type){sql+=" AND type=?";args.push(type)}
  sql+=" ORDER BY id DESC";
  res.json(db.prepare(sql).all(...args));
});

app.get("/api/stories/:id",(req,res)=>{
  const story=db.prepare("SELECT * FROM stories WHERE id=?").get(req.params.id);
  if(!story)return res.status(404).json({error:"Not found"});
  const chapters=db.prepare("SELECT * FROM chapters WHERE story_id=? ORDER BY chapter_number").all(story.id);
  const images=db.prepare("SELECT * FROM manga_images WHERE story_id=? ORDER BY image_order").all(story.id);
  const reviews=db.prepare("SELECT r.*,u.name FROM reviews r JOIN users u ON u.id=r.user_id WHERE r.story_id=? ORDER BY r.id DESC").all(story.id);
  res.json({...story,chapters,images,reviews});
});

app.post("/api/stories",auth,(req,res)=>{
  if(!["author","admin"].includes(req.user.role)) return res.status(403).json({error:"Author access required"});
  const {title,genre,description="",cover_url="",type="story"}=req.body;
  if(!title||!genre)return res.status(400).json({error:"Title and genre are required"});
  const info=db.prepare("INSERT INTO stories(type,title,author,genre,description,cover_url) VALUES(?,?,?,?,?,?)")
    .run(type,title,req.user.name,genre,description,cover_url);
  res.json(db.prepare("SELECT * FROM stories WHERE id=?").get(info.lastInsertRowid));
});

app.post("/api/stories/:id/chapters",auth,(req,res)=>{
  const s=db.prepare("SELECT * FROM stories WHERE id=?").get(req.params.id);
  if(!s)return res.status(404).json({error:"Story not found"});
  if(req.user.role!=="admin" && s.author!==req.user.name)return res.status(403).json({error:"Not your story"});
  const {title,content,chapter_number}=req.body;
  const info=db.prepare("INSERT INTO chapters(story_id,title,content,chapter_number) VALUES(?,?,?,?)").run(s.id,title,content||"",chapter_number||1);
  res.json(db.prepare("SELECT * FROM chapters WHERE id=?").get(info.lastInsertRowid));
});

const upload=multer({dest:uploads,limits:{fileSize:10*1024*1024}});
app.post("/api/stories/:id/manga-images",auth,upload.array("images",30),(req,res)=>{
  const s=db.prepare("SELECT * FROM stories WHERE id=?").get(req.params.id);
  if(!s)return res.status(404).json({error:"Story/manga not found"});
  if(req.user.role!=="admin" && s.author!==req.user.name)return res.status(403).json({error:"Not your manga"});
  const start=db.prepare("SELECT COALESCE(MAX(image_order),0) n FROM manga_images WHERE story_id=?").get(s.id).n;
  const insert=db.prepare("INSERT INTO manga_images(story_id,image_url,image_order) VALUES(?,?,?)");
  const result=[];
  req.files.forEach((f,i)=>{const url="/uploads/"+f.filename;insert.run(s.id,url,start+i+1);result.push(url)});
  res.json({images:result});
});

app.post("/api/stories/:id/bookmark",auth,(req,res)=>{
  const exists=db.prepare("SELECT 1 FROM bookmarks WHERE user_id=? AND story_id=?").get(req.user.id,req.params.id);
  if(exists) db.prepare("DELETE FROM bookmarks WHERE user_id=? AND story_id=?").run(req.user.id,req.params.id);
  else db.prepare("INSERT INTO bookmarks(user_id,story_id) VALUES(?,?)").run(req.user.id,req.params.id);
  res.json({bookmarked:!exists});
});
app.get("/api/bookmarks",auth,(req,res)=>res.json(db.prepare("SELECT s.* FROM stories s JOIN bookmarks b ON b.story_id=s.id WHERE b.user_id=? ORDER BY s.id DESC").all(req.user.id)));

app.post("/api/stories/:id/reviews",auth,(req,res)=>{
  const {rating,body}=req.body;
  if(!Number.isInteger(rating)||rating<1||rating>5||!body)return res.status(400).json({error:"Rating 1-5 and review text required"});
  const info=db.prepare("INSERT INTO reviews(story_id,user_id,rating,body) VALUES(?,?,?,?)").run(req.params.id,req.user.id,rating,body);
  res.json(db.prepare("SELECT r.*,u.name FROM reviews r JOIN users u ON u.id=r.user_id WHERE r.id=?").get(info.lastInsertRowid));
});
app.post("/api/stories/:id/complaints",auth,(req,res)=>{
  if(!req.body.body)return res.status(400).json({error:"Complaint text required"});
  db.prepare("INSERT INTO complaints(story_id,user_id,body) VALUES(?,?,?)").run(req.params.id,req.user.id,req.body.body);
  res.json({ok:true});
});

app.post("/api/ad-event",auth,(req,res)=>{
  const {event_type,amount=0}=req.body;
  db.prepare("INSERT INTO ad_events(user_id,event_type,amount) VALUES(?,?,?)").run(req.user.id,event_type||"view",Number(amount)||0);
  res.json({ok:true});
});

app.post("/api/admin/bootstrap", (req,res)=>{
  const {email,secret}=req.body;
  if(secret!==process.env.ADMIN_BOOTSTRAP_SECRET || !email)return res.status(403).json({error:"Set ADMIN_BOOTSTRAP_SECRET on the server first"});
  const u=db.prepare("SELECT * FROM users WHERE email=?").get(email.toLowerCase());
  if(!u)return res.status(404).json({error:"Create this user account first"});
  db.prepare("UPDATE users SET role='admin' WHERE id=?").run(u.id);
  res.json({ok:true,message:"Owner role enabled"});
});
app.get("/api/admin/summary",auth,admin,(req,res)=>{
  const users=db.prepare("SELECT COUNT(*) n FROM users").get().n;
  const stories=db.prepare("SELECT COUNT(*) n FROM stories WHERE type='story'").get().n;
  const manga=db.prepare("SELECT COUNT(*) n FROM stories WHERE type='manga'").get().n;
  const complaints=db.prepare("SELECT COUNT(*) n FROM complaints WHERE status='open'").get().n;
  const earnings=db.prepare("SELECT COALESCE(SUM(amount),0) n FROM ad_events").get().n;
  res.json({users,stories,manga,complaints,earnings});
});
app.get("/api/admin/complaints",auth,admin,(req,res)=>res.json(db.prepare("SELECT c.*,u.name,s.title FROM complaints c JOIN users u ON u.id=c.user_id JOIN stories s ON s.id=c.story_id ORDER BY c.id DESC").all()));
app.post("/api/admin/ads",auth,admin,(req,res)=>{
  const {name,provider="",placement_id="",active=1}=req.body;
  const info=db.prepare("INSERT INTO ads(name,provider,placement_id,active) VALUES(?,?,?,?)").run(name,provider,placement_id,active?1:0);
  res.json(db.prepare("SELECT * FROM ads WHERE id=?").get(info.lastInsertRowid));
});
app.get("/api/admin/ads",auth,admin,(req,res)=>res.json(db.prepare("SELECT * FROM ads ORDER BY id DESC").all()));

// Serve the Story Hub frontend from the same Node service.
const frontendDir = path.join(__dirname, "..", "frontend");
app.use(express.static(frontendDir));
app.get("/", (req,res)=>res.sendFile(path.join(frontendDir, "index.html")));
app.use((req,res)=>{
  if (req.path.startsWith("/api/") || req.path.startsWith("/uploads/")) return res.status(404).json({error:"Not found"});
  res.sendFile(path.join(frontendDir, "index.html"));
});

app.listen(PORT,()=>console.log(`Story Hub running on port ${PORT}`));
