const { exec } = require('child_process');

const script = `
import sqlite3, json, sys
sys.stdout.reconfigure(encoding='utf-8')
try:
    conn = sqlite3.connect('../data/meesho_products.db')
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM auto_products ORDER BY id DESC LIMIT 50')
    columns = [desc[0] for desc in cursor.description]
    data = [dict(zip(columns, row)) for row in cursor.fetchall()]
    print(json.dumps(data))
except Exception as e:
    print(json.dumps({'error': str(e)}))
`;

exec(`python -c "${script.replace(/\n/g, ' ')}"`, (error, stdout, stderr) => {
    console.log('STDOUT:', stdout);
    console.log('STDERR:', stderr);
});
