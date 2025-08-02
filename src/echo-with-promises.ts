import * as net from "net";

// How this fucking code works, because it took me
// WAY too long to understand this...

// Sockets:
//
// 
// Server:
// Create a server, setup it's behavior on events (resolve promises)
// Then, wait for connections 

// promise-based API for TCP sockets
type TCPConn = {
  // the js socket object
  socket: net.Socket;
  // 'error' event
  err: null | Error;
  // EOF from 'end' event
  ended: boolean;
  // the callbacks of the promise of the current read
  reader: null | {
    resolve: (value: Buffer) => void;
    reject: (reason: Error) => void;
  };
};

type TCPListener = {
    server: net.Server;
    err: null | Error;
    accepter: null | {
        resolve: (value: TCPConn) => void;
        reject: (reason: Error) => void;
    };
};

function socketInit(socket: net.Socket): TCPConn {
  const conn: TCPConn = {
    socket: socket,
    err: null,
    ended: false,
    reader: null,
  };

  socket.on('data', (data: Buffer) => {
    console.assert(conn.reader);
    conn.socket.pause();
    conn.reader!.resolve(data);
    conn.reader = null;
  });

  socket.on('end', () => {
    conn.ended = true;
    if (conn.reader) {
      conn.reader.resolve(Buffer.from('')); // EOF
      conn.reader = null;
    }
  });

  socket.on('error', (err: Error) => {
    conn.err = err;
    if (conn.reader) {
      conn.reader.reject(err);
      conn.reader = null;
    }
  });

  return conn;
}

function socketRead(conn: TCPConn): Promise<Buffer> {
  console.assert(!conn.reader); // no concurrent calls
  return new Promise<Buffer>((resolve, reject) => {
    // if connection is not readable, complete the promise now
    if (conn.err) {
      reject(conn.err);
      return;
    }
    if (conn.ended) {
      resolve(Buffer.from("")); // EOF
      return;
    }
    // save promise callbacks
    conn.reader = { resolve: resolve, reject: reject };
    // resume 'data' event to fullfill the promise later
    conn.socket.resume();
  });
}

function socketWrite(conn: TCPConn, data: Buffer): Promise<void> {
  console.assert(data.length > 0);

  return new Promise<void>((resolve, reject) => {
    if (conn.err) {
      reject(conn.err);
      return;
    }

    conn.socket.write(data, (err?: Error | null) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
};

// initializes a socket
// and waits to read data and immediately
// writes the data back
async function serveClient(conn: TCPConn): Promise<void> {
    while (true) {
        const data = await socketRead(conn);
        if (data.length === 0) {
            console.log('ended connection');
            break;
        }

        console.log('data:', data);
        socketWrite(conn, data);
        if (data.includes('q')) {
            console.log('ending connection');
            conn.socket.end();
            break;
        }
    }
};

// takes a socket and serves it
// so that it can start reading data
async function newConn(conn: TCPConn): Promise<void> {
    console.log('new connection', conn.socket.remoteAddress, conn.socket.remotePort);
    try {
        await serveClient(conn);
    } catch (exc) { // may want to actually handle errors
        console.error('exception', exc);
    } finally {
        conn.socket.destroy();
    }
};

// this function is just creating and returning a promise.
// it needs to be a promise so that it is only resolved
// or rejected in the listener event handlers (aka when a 
// connection/error happens)
function serverAccept(listener: TCPListener): Promise<TCPConn> {
    console.assert(listener);
    return new Promise<TCPConn>((resolve, reject) => {
        if (listener.err) {
            reject(listener.err);
            return;
        };
        listener.accepter = { resolve: resolve, reject: reject };
    });
};

// creates a server and starts listening
// fulfills the promise
function serverListen(port: number, host?: string): TCPListener {
    const server = net.createServer({
        pauseOnConnect: true,
    });
    const listener: TCPListener = {
        server: server,
        err: null,
        accepter: null,
    };
    server.on('connection', (socket: net.Socket) => {
        console.assert(listener.accepter);
        const conn = socketInit(socket);
        listener.accepter!.resolve(conn);
        listener.accepter = null;
    });
    server.on('error', (err: Error) => {
        listener.err = err;
        if (listener.accepter) {
            listener.accepter.reject(err);
            listener.accepter = null;
        }
    });
    server.listen(port, host);
    return listener;
};

async function main() {
    // server is now listening, event handlers are setup, but no promises creates
    const listener = serverListen(8080, 'localhost');
    console.log('Server listenin on localhost:8080');
    while (true) {
        try {
            // when connection, we init a socket and resolve
            // the promise, returning the TCPConn
            // THIS IS SERVER
            const conn = await serverAccept(listener); // blocks here

            // THIS IS HANDLING READING FROM CLIENT - per client
            // Called without await, so it runs in the background
            // takes the returned conn and serves it
            // (loops and reads data from socket)
            newConn(conn).catch(console.error);
        } catch (err) {
            console.error('Accept error:', err);
            break;
        }
    }
};

main().catch(console.error);



