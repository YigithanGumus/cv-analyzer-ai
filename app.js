const { createServer } = require('node:http');
const port = process.env.PORT || 3000;
const hostname = process.env.HOSTNAME || 'localhost';


const server = createServer((req, res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain');
  res.end('Sistem aktif!');
});

server.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});