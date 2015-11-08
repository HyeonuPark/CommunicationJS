Communication Adaptor
======================

CommunicationJS is built as vendor-agnostic layer for p2p streaming

To support specific low-level API, like WebRTC(, or ORTC, maybe),
it needs adaptor with interface specified below

# Adaptor

## adaptor.support: Boolean

Check wether runtime support this api

## adaptor.connect(stream: MediaStream, config: Object): Connection

Start connection from local stream

## adaptor.receive(id: String, config: Object): Connection

Make connection to receive remote stream

# interface Connection

## Method

### write(msg: String): void

Receive message from signaling channel

### isSender(): Boolean

Check wether this connection is stream sender

true for connect(), false for receive()

### open(): void

Only for sender

Start connection for stream

### getStream(): MediaStream

MediaStream this connection hold

### getId(): String

This connection's unique id

If sender, same as getStream().id

If receiver, same as id received from receive()

## Event

### stream(stream: MediaStream)

Only for receiver

MediaStream is arrived from remote connection

### message(msg: String)

Connection has a new message to send to remote connection

### closed()

This connection is closed

hahaha
=======
