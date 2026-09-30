import re
import os

pg_setup = """const { Client } = require('pg');
const getDb = async () => {
    const client = new Client({
        connectionString: "postgres://postgres.lgzqxzfepgfatdseiwxh:r4H2CJmPhWnZx8n4@aws-0-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require"
    });
    await client.connect();
    return client;
};
"""

def replace_sqlite_with_pg(content):
    content = content.replace("const sqlite3 = require('sqlite3').verbose();", pg_setup)
    content = re.sub(r"const dbPath = path\.join[^\n]*\n", "", content)
    
    # scheduler.js
    content = content.replace("const db = new sqlite3.Database(dbPath);", "const db = await getDb();")
    
    # replace db.all(query, (err, rows) => { ... })
    # This requires careful regex or manual replacement. 
    # Since there are only a few, I will do it manually.
    
    return content

