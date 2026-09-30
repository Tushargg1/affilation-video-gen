const url = 'https://www.meesho.com/api/v1/product/fm8xrz';
fetch(url, {
  headers: { 'User-Agent': 'okhttp/3.12.1', 'Accept': 'application/json' }
}).then(res => res.text()).then(text => console.log(text)).catch(console.error);
