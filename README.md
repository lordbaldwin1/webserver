# webserver in TypeScript

## HTTP Notes
TCP (Transmission Control Protocol)
- TCP - reliable, ordered delivery
- TCP is a bidirectional channel for transmitting raw bytes, powers protocols like HTTP or SSH
- HTTP request or response has header followed by optional payload.
- Header consists of URL of request, or response code, followed by list of header fields

NC
- nc example.com 80 (netcat) creates a TCP connection to destination host and port, then attaches the connection to stdin + stdout.

HTTP

- Head-of-line (HOL) blocking: slow/delayed packet at front of queue prevents other packets from being processed.
- Multiplexing: multiple requests over a single connection
- Userspace congestion control: algorithms to let deveopers handle datapath separate from network layer(???)

- Response format: HTTP version + status code
- then, header fields (k: v), then empty line, then payload

- HTTP/1.0 is ANCIENT, doesn't support multiple requests over a single connection (new connection for every request)

- HTTP/1.1 has a fix for this

- HTTP/2 added compressed headers (?)
- Added server push, so server can send stuff before client requests
- Allows multiple requests to be sent over a single TCP connection and return in any order
- HTTP/2 is no longer a simple request-response protocol

- HTTP/3 uses UDP (User Datagram Protocol, prio speed, sacrifices reliability)
- Replicates TCP (called QUIC)

HTTPS
- Adds an extra protocol layer, TLS, which is not plaintext
- Can't use netcat, but can use TLS client because there's still a byte stream
```openssl s_client -verify_quiet -quiet -connect example.com:443```

TCP/Layers of Protocols
- Network protocols are divided into layers, higher depend on lower
- App (message/etc..) -> TCP (byte stream) -> IP (packets) -> ...
- IP packets have: sender's address, receiver's address, and message data
- IP issues for apps: message data exceeding single packet capacity, packet may be lost, out of order packets

- TCP: byte streams instead of packets, reliable and ordered delivery
- Byte stream is ordered sequence of bytes. A protocol is used to make sense of bytes.
- UDP/TCP same layer but UDP uses packet-based. It adds port numbers over IP packets

TCP Byte Stream vs. UDP Packet
- Difference: boundaries
- UDP: each read from socket corresponds to single write from peer
- TCP: No correspondence, data is continuous flow of bytes

- TCP send buffer: stores data before transmission. Multiple writes indistinguishable from single write.
- Data is one or more IP packets
- TCP recieve buffer: data is available to applications as it arrives (?how)

- THERE ARE NO TCP PACKETS! Protocols interpret TCP data by imposing boundaries within the byte stream

Byte Stream vs. Packet: DNS as an Example
- DNS (runs on UDP): domain name to IP address lookup
- DNS message is in a UDP packet:
| IP header |         IP payload           |
            \............................../
             | UDP header |  UDP payload  |
                          \.............../
                           | DNS message |
- DNS also runs on TCP but requires a 2-byte length field to be added to start so server or client can tell where it is in byte stream.

TCP Start with a Handshake
- Bind & listen: server waits for client at address
- Then, client can connect to that address.
- Connect is 3-step handshake (SYN, SYN-ACK, ACK)
- After that, the connection can be accepted by the server

TCP is Bidirectional & Full-Duplex
- Can be used as bi-directional byte stream with a channel for each direction
- Although HTTP is req-res, TCP isn't restricted to this (e.g., websocket).
- Full-duplex communication: Peer sending/receiving at same time

TCP End with 2 Handshakes
- Peer tells other side no more data (with FIN flag)
- Other side ACKs FIN
- Each direction of channels terminates, so each side performs handshake to fully close

Socket Primitives
- Applications Refer to Sockets by Opaque OS Handles
- TCP connection is managed by your OS, we use the socket handle to refer to the connection in the socket API
- In Node.js, socket handles are wrapped into JS objects with methods on them
- OS handles must be closed by the application

- Listening Socket & Connection Socket
- TCP server listens on an address and accepts client connections from that address
- Listening address represented by socket handle
- When you accept a new connection, you get the socket handle of the TCP connection
- 2 types of socket handles: listening sockets & connection sockets

- End of Transmission
- Send/receive = read/write
- Write: can close socket connection and send TCP FIN (recycles handle too), can also close our side and send FIN whil still being able to receive data (half-closed connection)
- Read: receives a FIN, often called end of file

List of Socket primitives:
- Listening socket: bind & listen, accept, close
- Connection socket: read, write, close

## Socket API in Node.js

```echo.ts```

## Half-Open Connections
- TCP connection directions are ended independantly
- You can send data through the open when one is closed
- Socket primitive ```shutdown``` closes BOTH directions
- Node.js doesn't support half-open by default, you need to set:
```let server = net.createServer({allowHalfOpen: true})```
- When allowHalfOpen is set, you need to close the connection. Use ```socket.destroy()``` to close socket manually. ```socket.end()``` will no longer close connection.

## Event Loop & Concurrency
```javascript
while (running) {
    let events = wait_for_events();
    for (let e of events) {
        do_something(e);
    }
}
```
- runtime polls for IO events, the runtime reacts to the events and invokes callbacks that we registered. Continues until all events have been handles.
- event loop + runtime are single threaded
- works because when a callback returns, or awaits, runtime keeps chugging, so it can still emit events and schedule other tasks
- event loop halts when executing js code

- Concurrency in Node.JS is Event-Based
- Servers of can have multiple connections emitting events, single-threaded runtime can't do anything for the other connections until the handler returns. Longer it takes for one event to process, the longer everything else is delayed.

## Asynchronous vs. Synchronous

- Blocking & Non-Blocking IO
- Crucial to avoid staying in the event loop for too long.
- ^running CPU-intensive code
- Solved by: Voluntarily yielding to the runtime (break up work to let event loop process) & move CPU-intensive code out of the event loop via multi-threading or multi-processing (worker threads/child processes)
- OS provides both blocking & non-blocking: the calling OS thread blocks until the result is ready, or the OS immediately returns the result if it's not ready (or is), and there's a way to be notified of readiness
- Node.js used non-blocking mode. only blocking is OS waiting for events when nothing to do

- IO in Node.js is Asynchronous
- Promises: non-blocking because we return to main thread, when result is ready, runtime invokes the callback

## Promise-Based IO
- Application logic is not broken into multiple functions, no callback hell
- When creating a promise object, an executor callback is passed with resolve() and reject()
- resolve causes await statements to return val
- reject causes them to throw exception
Terminology:
Fulfilled: resolve() called.
Rejected: reject() called.
Settled: Either fulfilled or rejected.
Pending: Not settled.

- In JS, you start background tasks by not awaiting an async function (not waiting for promises)

## Backpressure
- used to stop producer from producing faster than the consumer is consuming
- In TCP, this is called flow control
- the receiver has a receive buffer where an application reads from
- the producer has a window (measurement) that it knows of, when that says buffer is full, it will pause sending data
- consumer manages window, when it drains the receive buffer, it moves window (?) and alerts producer that it can start sending again

IMPORTANT: TCP can pause and resume transmission so it doesn't overflow consumer's buffer
                           flow ctrl    bounded!
|producer| ==> |send buf| ===========> |recv buf| ==> |consumer|
    app            OS         TCP          OS            app

this is NOT TCP congestion control, which also controls the window

- the window tells how much data can be read into the buffer

- on the application side, if writing is blocked, the app will stop producing when the send buf is full
- this isn't the case when coding in JS with an event loop hehe, so we need to await writes
           write()    unbounded!    event loop
|producer| ======> |internal queue| =========> |send buf| =====> ...
    app                Node.js                     OS      TCP

## Pipelined Requests
- although http is request-response, we can optimize by having a buffer allow for multiple requests to be sent at once
- this greatly reduces load times because otherwise, a page that needs to make multiple requests, would need to make a roundtrip for each

 client            server
 ------            ------

 |req1|  ==>
 |req2|  ==>
 |req3|  ==>  <==  |res1|
  ...         <==  |res2|
                    ...

- web browsers do not use pipelined requests due to buggy servers, they use multiple concurrent connections instead
- pipelining can cause a deadlock if both sender/receiver are sending and their send buffers are full

## Smarter Buffers
- many HTTP implementations can use a fixed size buffer for headers since they don't allow a lot of data in the header
- the buffer may also be sufficient for reading the payload if it doesn't need to store it in memory
- not very relevant to node.js but it's important in environments with manual memory management

## HTTP Semantics
- stateless application-level protocol






