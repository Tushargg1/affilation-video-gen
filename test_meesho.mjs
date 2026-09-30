const url = 'https://www.meesho.com/api/v1/products/fm8xrz';
fetch(url, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
  }
}).then(res => res.text()).then(text => console.log(text.substring(0, 500))).catch(console.error);
