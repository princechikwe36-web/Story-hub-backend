import express from "express";
import cors from "cors";
import Database from "better-sqlite3";

const app = express();
const db = new Database("storyhub.db");
app.use(cors());
app.use(express.json({limit:"5mb"}));

db.exec(`
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
 role TEXT NOT NULL DEFAULT 'reader', created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS stories (
 id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, author TEXT NOT NULL,
 genre TEXT, description TEXT, cover_url TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS chapters (
 id INTEGER PRIMARY KEY AUTOINCREMENT, story_id INTEGER NOT NULL, title TEXT NOT NULL,
 content TEXT NOT NULL, chapter_number INTEGER NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(story_id) REFERENCES stories(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS manga (
 id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, author TEXT NOT NULL,
 genre TEXT, description TEXT, cover_url TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS manga_pages (
 id INTEGER PRIMARY KEY AUTOINCREMENT, manga_id INTEGER NOT NULL, image_url TEXT NOT NULL,
 page_number INTEGER NOT NULL, FOREIGN KEY(manga_id) REFERENCES manga(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS bookmarks (user_id INTEGER, story_id INTEGER, PRIMARY KEY(user_id,story_id));
CREATE TABLE IF NOT EXISTS favorites (user_id INTEGER, story_id INTEGER, PRIMARY KEY(user_id,story_id));
CREATE TABLE IF NOT EXISTS reviews (
 id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, story_id INTEGER,
 rating INTEGER NOT NULL, comment TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS complaints (
 id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, story_id INTEGER,
 message TEXT NOT NULL, status TEXT DEFAULT 'open', created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS analytics (
 id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, story_id INTEGER,
 event TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

const send=(res,data)=>res.json(data);
app.get("/",(_,res)=>send(res,{name:"Storyhub API",status:"running"}));

app.get("/api/stories",(_,res)=>send(res,db.prepare("SELECT * FROM stories ORDER BY id DESC").all()));
app.post("/api/stories",(req,res)=>{
 const {title,author,genre,description,cover_url}=req.body;
 const r=db.prepare("INSERT INTO stories(title,author,genre,description,cover_url) VALUES(?,?,?,?,?)")
 .run(title,author,genre,description,cover_url);
 send(res,{id:r.lastInsertRowid});
});
app.get("/api/stories/:id",(req,res)=>{
 const story=db.prepare("SELECT * FROM stories WHERE id=?").get(req.params.id);
 const chapters=db.prepare("SELECT * FROM chapters WHERE story_id=? ORDER BY chapter_number").all(req.params.id);
 send(res,{story,chapters});
});
app.post("/api/stories/:id/chapters",(req,res)=>{
 const {title,content,chapter_number}=req.body;
 const r=db.prepare("INSERT INTO chapters(story_id,title,content,chapter_number) VALUES(?,?,?,?)")
 .run(req.params.id,title,content,chapter_number);
 send(res,{id:r.lastInsertRowid});
});

app.get("/api/manga",(_,res)=>send(res,db.prepare("SELECT * FROM manga ORDER BY id DESC").all()));
app.post("/api/manga",(req,res)=>{
 const {title,author,genre,description,cover_url}=req.body;
 const r=db.prepare("INSERT INTO manga(title,author,genre,description,cover_url) VALUES(?,?,?,?,?)")
 .run(title,author,genre,description,cover_url);
 send(res,{id:r.lastInsertRowid});
});
app.post("/api/manga/:id/pages",(req,res)=>{
 const {image_url,page_number}=req.body;
 const r=db.prepare("INSERT INTO manga_pages(manga_id,image_url,page_number) VALUES(?,?,?)")
 .run(req.params.id,image_url,page_number);
 send(res,{id:r.lastInsertRowid});
});

app.post("/api/bookmarks",(req,res)=>{
 db.prepare("INSERT OR REPLACE INTO bookmarks(user_id,story_id) VALUES(?,?)").run(req.body.user_id,req.body.story_id); send(res,{ok:true});
});
app.post("/api/favorites",(req,res)=>{
 db.prepare("INSERT OR REPLACE INTO favorites(user_id,story_id) VALUES(?,?)").run(req.body.user_id,req.body.story_id); send(res,{ok:true});
});
app.post("/api/reviews",(req,res)=>{
 const {user_id,story_id,rating,comment}=req.body;
 const r=db.prepare("INSERT INTO reviews(user_id,story_id,rating,comment) VALUES(?,?,?,?)").run(user_id,story_id,rating,comment);
 send(res,{id:r.lastInsertRowid});
});
app.post("/api/complaints",(req,res)=>{
 const {user_id,story_id,message}=req.body;
 const r=db.prepare("INSERT INTO complaints(user_id,story_id,message) VALUES(?,?,?)").run(user_id,story_id,message);
 send(res,{id:r.lastInsertRowid});
});
app.post("/api/analytics",(req,res)=>{
 const {user_id,story_id,event}=req.body;
 db.prepare("INSERT INTO analytics(user_id,story_id,event) VALUES(?,?,?)").run(user_id,story_id,event); send(res,{ok:true});
});
app.get("/api/admin/analytics",(_,res)=>send(res,{
 visitors:db.prepare("SELECT COUNT(DISTINCT user_id) n FROM analytics WHERE user_id IS NOT NULL").get().n,
 story_views:db.prepare("SELECT COUNT(*) n FROM analytics WHERE event='view'").get().n,
 downloads:db.prepare("SELECT COUNT(*) n FROM analytics WHERE event='download'").get().n,
 complaints:db.prepare("SELECT COUNT(*) n FROM complaints").get().n,
 stories:db.prepare("SELECT COUNT(*) n FROM stories").get().n,
 manga:db.prepare("SELECT COUNT(*) n FROM manga").get().n
}));

app.listen(3000,()=>console.log("Storyhub backend running on http://localhost:3000"));
