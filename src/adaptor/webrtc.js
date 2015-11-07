import Event from 'events'

export const Peer =
  window.RTCPeerConnection       ||
  window.webkitRTCPeerConnection ||
  window.mozRTCPeerConnection    ||
  window.msRTCPeerConnection     //why not?
export const Description = window.RTCSessionDescription
export const Candidate = window.RTCIceCandidate
export const support = Peer && Description && Candidate

const DEFAULT_CONFIG = {
  RTCPeerConnection: {
    iceServers: [{"url": "stun:stun.l.google.com:19302"}]
  }
}

function setupPeer (peer, channel) {
  peer.onicecandidate = evt => {
    if (!evt.candidate) return
    channel.emit('message', JSON.stringify({ice: evt.candidate}))
  }

  peer.oniceconnectionstatechange = () => {
    switch (peer.iceConnectionState) {
      case 'disconnected':
      case 'closed':
        channel.emit('closed')
    }
  }

  channel.on('closed', () => {
    try{
      peer.close()
    }catch(e){}
  })

  channel.close = () => {
    channel.emit('closed')
  }
}

export function connect (stream, _config) {
  const config = {...DEFAULT_CONFIG, ..._config}
  const channel = new Event()

  const peer = new Peer(config.RTCPeerConnection)
  peer.addStream(stream)

  setupPeer(peer, channel)

  channel.write = msg => {
    const {ice, sdp} = JSON.parse(msg)
    if (ice) {
      peer.addIceCandidate(new Candidate(ice))
    }
    if (sdp) {
      peer.setRemoteDescription(new Description(sdp))
    }
  }

  channel.isSender = () => true
  channel.getStream = () => stream
  channel.getId = () => stream.id

  channel.open = () => {
    peer.createOffer(offer => {
      peer.setLocalDescription(offer, () => {
        channel.emit('message', JSON.stringify({sdp: offer}))
      }, ::console.error)
    }, ::console.error)
  }

  return channel
}

export function receive (id, _config) {
  const config = {...DEFAULT_CONFIG, ..._config}
  const channel = new Event()
  let stream = null

  const peer = new Peer(config.RTCPeerConnection)
  peer.onaddstream = evt => {
    stream = evt.stream
    channel.emit('stream', stream)
  }

  setupPeer(peer, channel)

  channel.write = msg => {
    const {ice, sdp} = JSON.parse(msg)
    if (ice) {
      peer.addIceCandidate(new Candidate(ice))
    }
    if (sdp) {
      peer.setRemoteDescription(new Description(sdp), () => {
        peer.createAnswer(answer => {
          peer.setLocalDescription(answer, () => {
            channel.emit('message', JSON.stringify({sdp: answer}))
          }, ::console.error)
        }, ::console.error)
      })
    }
  }

  channel.isSender = () => false
  channel.getStream = () => stream
  channel.getId = () => id

  return channel
}
