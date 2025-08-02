import * as net from "net";

// different socket types are represented as JS objects

// 2 styles of handling IO in JS
// use callbacks: request something to be done and register callback with the runtime, when thing is done, callback is invoked

function newConn(socket: net.Socket): void {
  console.log("new connection", socket.remoteAddress, socket.remotePort);

  socket.on('end', () => {
    // FIN received! connection will close
    console.log('EOF');
  });

  socket.on('data', (data: Buffer) => {
    console.log('Data received:', data);
    socket.write(data);

    if (data.includes('q')) {
        console.log('closing.');
        socket.end(); // send FIN and close
    }
  });

  socket.on('error', (hadError: Error) => {
    console.log('error occurred:', hadError)
  })
};

// creates listening socket
// has listen() method to bind and listen on an address:port
let server = net.createServer();
server.on("connection", newConn); // accept operation, called for each new connection
server.on("error", (err: Error) => {
  throw err;
});

server.listen({ host: "127.0.0.01", port: 1234 }, () => {
  console.log("listening on", server.address());
});
