CommunicationJS
================

Utilize WebRTC PeerConnection API

Hide session establishing process, handle stream persistency

# Usage
```js

import Communication from 'communication'
import webrtc from 'communication-adaptor-webrtc'

if (!webrtc.support) {
  throw new Error('This browser does not support WebRTC API')
}

let comm = Communication(webrtc)

comm.on('message', msg => {
  mySignalChannel.send(msg)
})

mySignalChannel.on('message', msg => {
  comm.write(msg)
})

comm.open()

let streamId = null

comm.on('streamAdded', (stream, id, meta) => {
  if (streamId != null) return
  streamId = id
  myDescription.textContent = meta.description
  myMedia.src = URL.createObjectURL(stream)
})

comm.on('streamUpdated', (stream, id) => {
  if (id !== streamId) return
  myMedia.src = URL.createObjectURL(stream)
})

comm.on('streamRemoved', id => {
  if (id !== streamID) return
  streamId = null
  myMedia.src = null
})

let localStream = getStreamSomehow()

comm.addStream(localStream, {
  description: 'my nice stream'
})

```

# Method

## state(): String

Get current Communication state

will return one of following values

- 'waiting': Communication is not established
- 'running': Communication is established and usable
- 'closed': Communication is closed

## open(): void

Start establishing connection

This method MUST be called AFTER message handling, BEFORE any other operation

## write(message: String): void

Receive message from signalling channel

## addStream(stream: MediaStream, meta: Object): void

Add local MediaStream to the Communication

Metadata object will be sent to the remote Communication object

See streamAdded event

## removeStream(stream: MediaStream|String)

Remove local MediaStream from the Communication

## getLocalStreams()

Return an array of MediaStreams that Communication streaming to remote peer

## getRemoteStreams()

Return an array of MediaStreams that Communication streaming from remote peer

## getStreamById(id: String)

Return an MediaStream from given id

Note: if stream is sent from remote peer, stream.id may not be same as given id

## close()

Close this communication permanently

# Event

## message(msg: String)

Communication has a new message to send to remote peer

## running()

Connection to remote peer is established

This Communication is now workable

## streamAdded(stream: MediaStream, id: String, meta: Object)

Remote peer added another stream to Communication

See addStream method

## streamUpdated(stream: MediaStream, id: String)

Existing stream is re-established for some reason(ex) internet connection is unstable)

For stream sender, newly arrived stream is just same stream as previous stream with same id

Just replace previous stream with this one is enough to handle stream persistency

## streamRemoved(id: String)

Remote peer removed stream from Communication

## closed(fromRemote: Boolean, reason: Any)

This Communication is closed permanently
