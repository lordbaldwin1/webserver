import * as net from "net";
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

function soInit(socket: net.Socket): TCPConn {
  const conn: TCPConn = {
    socket: socket,
    err: null,
    ended: false,
    reader: null,
  };

  socket.on("data", (data: Buffer) => {
    console.assert(conn.reader);

    // pause the 'data' event until next read
    conn.socket.pause();
    // fullfill the promise of the current read
    conn.reader!.resolve(data);
    conn.reader = null;
  });

  socket.on("end", () => {
    // also fulfills current read
    conn.ended = true;
    if (conn.reader) {
      conn.reader.resolve(Buffer.from("")); // EOF
      conn.reader = null;
    }
  });

  socket.on("error", (err: Error) => {
    conn.err = err;
    if (conn.reader) {
      conn.reader.reject(err);
      conn.reader = null;
    }
  });

  return conn;
}

function soRead(conn: TCPConn): Promise<Buffer> {
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

function soWrite(conn: TCPConn, data: Buffer): Promise<void> {
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

async function serveClient(socket: net.Socket): Promise<void> {
    const conn: TCPConn = soInit(socket);
    while (true) {
        const data = await soRead(conn);
        if (data.length === 0) {
            console.log('ended connection');
            break;
        }
        console.log('data:', data);
        soWrite(conn, data);
    }
}

async function newConn(socket: net.Socket): Promise<void> {
    console.log('new connection', socket.remoteAddress, socket.remotePort);
    try {
        await serveClient(socket);
    } catch (exc) { // may want to actually handle errors
        console.error('exception', exc);
    } finally {
        socket.destroy();
    }
}

const server = net.createServer({
  pauseOnConnect: true, // req by TCPConn
});

